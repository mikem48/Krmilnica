const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const port = process.env.PORT || 3000;

// Ustvari mapo za firmware
if (!fs.existsSync('./firmware')) {
  fs.mkdirSync('./firmware');
}

// Multer nastavitve
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './firmware/');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname) === '.bin') {
      cb(null, true);
    } else {
      cb(new Error('Samo .bin datoteke so dovoljene!'));
    }
  }
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'moj-tajni-kljuc-' + Math.random(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// View engine in static files
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/firmware', express.static('firmware'));

// Routes
const settingsRouter = require('./routes/settings');
const deviceRoutes = require('./routes/devices');
app.use('/', settingsRouter);
app.use('/device', deviceRoutes);

// Passport LocalStrategy
passport.use(new LocalStrategy((username, password, done) => {
  console.log('Prijava za uporabnika:', username);
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return done(err);
    if (!user) return done(null, false, { message: 'Napačno uporabniško ime.' });
    if (!bcrypt.compareSync(password, user.password)) return done(null, false, { message: 'Napačno geslo.' });
    return done(null, user);
  });
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => done(err, user));
});

// Auth routes
app.get('/register', (req, res) => res.render('register'));
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  console.log('Registracija za uporabnika:', username);
  if (!username || !password || username.length < 3 || password.length < 6 || !/^[a-zA-Z0-9]+$/.test(username)) {
    return res.send('Username mora biti vsaj 3 znake, password vsaj 6 znakov, in username samo črke/številke.');
  }
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err) => {
    if (err) {
      console.error('Napaka pri registraciji:', err);
      return res.send('Uporabnik že obstaja.');
    }
    res.redirect('/login');
  });
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', passport.authenticate('local', { successRedirect: '/', failureRedirect: '/login' }));

// Main routes
app.get('/', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  console.log('Osnovna stran za uporabnika:', req.user.id);
  db.all('SELECT devices.* FROM devices JOIN user_devices ON devices.id = user_devices.device_id WHERE user_devices.user_id = ?', [req.user.id], (err, devices) => {
    if (err) {
      console.error('Napaka pri pridobivanju naprav:', err);
      return res.send('Napaka pri pridobivanju naprav.');
    }
    console.log('Najdenih naprav:', devices.length);
    res.render('index', { devices: devices || [], user: req.user });
  });
});

app.post('/add-device', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  const { name, deviceId } = req.body;
  console.log('Dodajanje naprave:', name, deviceId);
  if (deviceId.length !== 8 || !/^[a-zA-Z0-9]{8}$/.test(deviceId)) {
    return res.send('ID mora biti točno 8-mestni in vsebovati samo črke ter številke.');
  }
  db.run('INSERT OR IGNORE INTO devices (id, name) VALUES (?, ?)', [deviceId, name], (err) => {
    if (err) {
      console.error('Napaka pri dodajanju naprave:', err);
      return res.send('Naprava že obstaja ali napaka v bazi.');
    }
    db.run('INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)', [req.user.id, deviceId], (err) => {
      if (err) {
        console.error('Napaka pri povezovanju naprave:', err);
        return res.send('Napaka pri povezovanju naprave.');
      }
      res.redirect('/');
    });
  });
});

app.get('/admin', (req, res) => {
  if (!req.isAuthenticated() || !req.user.is_admin) {
    return res.redirect('/');
  }
  db.all('SELECT * FROM firmware ORDER BY upload_date DESC', [], (err, firmwares) => {
    res.render('admin', { firmwares: firmwares || [], user: req.user });
  });
});

app.post('/admin/upload-firmware', upload.single('firmware'), (req, res) => {
  if (!req.isAuthenticated() || !req.user.is_admin) {
    return res.redirect('/');
  }
  const { version } = req.body;
  const filename = req.file.originalname;
  const filePath = `/firmware/${filename}`;
  const uploadDate = Math.floor(Date.now() / 1000);

  db.run('INSERT INTO firmware (version, filename, upload_date, file_path) VALUES (?, ?, ?, ?)',
    [version, filename, uploadDate, filePath], (err) => {
      if (err) {
        console.error('Napaka pri nalaganju firmware:', err);
        return res.send('Firmware z to verzijo že obstaja.');
      }
      res.redirect('/admin');
    });
});

app.post('/admin/delete-firmware/:id', (req, res) => {
  if (!req.isAuthenticated() || !req.user.is_admin) {
    return res.redirect('/');
  }
  const firmwareId = req.params.id;

  db.get('SELECT * FROM firmware WHERE id = ?', [firmwareId], (err, firmware) => {
    if (firmware) {
      const filePath = path.join(__dirname, firmware.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      db.run('DELETE FROM firmware WHERE id = ?', [firmwareId]);
    }
    res.redirect('/admin');
  });
});

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/login'));
});

// Initialize database and start server
db.serialize(() => {
  console.log('Ustvarjanje tabel...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      is_admin INTEGER DEFAULT 0,
      auto_update INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT,
      value1 REAL,
      value2 REAL,
      last_update INTEGER,
      firmware_version TEXT,
      params TEXT,
      visina REAL DEFAULT 0,
      wifi_cas INTEGER DEFAULT 60,
      obvestilo_napetost REAL DEFAULT 12.5,
      obvestilo_krmilo REAL DEFAULT 80,
      obvestilo_stevilka TEXT DEFAULT '',
      ura1_h INTEGER DEFAULT 0,
      ura1_min INTEGER DEFAULT 0,
      ura2_h INTEGER DEFAULT 0,
      ura2_min INTEGER DEFAULT 0,
      casovnik2 INTEGER DEFAULT 0,
      cas_delovanja INTEGER DEFAULT 60,
      hitrost_motorja INTEGER DEFAULT 100,
      pon INTEGER DEFAULT 0,
      tor INTEGER DEFAULT 0,
      sre INTEGER DEFAULT 0,
      cet INTEGER DEFAULT 0,
      pet INTEGER DEFAULT 0,
      sob INTEGER DEFAULT 0,
      ned INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS user_devices (
      user_id INTEGER,
      device_id TEXT,
      PRIMARY KEY (user_id, device_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (device_id) REFERENCES devices(id)
    );
    CREATE TABLE IF NOT EXISTS firmware (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT UNIQUE,
      filename TEXT,
      upload_date INTEGER,
      file_path TEXT
    );
  `, (err) => {
    if (err) {
      console.error('Napaka pri ustvarjanju tabel:', err);
      process.exit(1);
    } else {
      console.log('Tabele ustvarjene.');
      
      // Ustvari testnega admin uporabnika
      const testUsername = 'admin';
      const testPassword = 'admin123';
      const hashedPassword = bcrypt.hashSync(testPassword, 10);
      
      db.run('INSERT OR IGNORE INTO users (username, password, is_admin) VALUES (?, ?, 1)',
        [testUsername, hashedPassword], (err) => {
          if (err) {
            console.error('Napaka pri ustvarjanju admin uporabnika:', err);
          } else {
            console.log('✓ Admin uporabnik ustvarjen (username: admin, password: admin123)');
          }
          
          // Start server after database initialization
          app.listen(port, '0.0.0.0', () => {
            console.log(`Strežnik teče na http://0.0.0.0:${port}`);
          });
        });
    }
  });
});
