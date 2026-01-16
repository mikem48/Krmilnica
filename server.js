const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

// Ustvari mapo za firmware, če še ne obstaja
if (!fs.existsSync('./firmware')) {
  fs.mkdirSync('./firmware');
}

// Nastavitve za nalaganje datotek z multer
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

// Ustvarjanje tabel ob zagonu aplikacije
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
      params TEXT,
      value1 REAL,
      value2 REAL,
      last_update INTEGER,
      firmware_version TEXT DEFAULT 'krmilnica_01.01.24'
    );
    CREATE TABLE IF NOT EXISTS firmware (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT UNIQUE,
      filename TEXT,
      upload_date INTEGER,
      file_path TEXT
    );
    CREATE TABLE IF NOT EXISTS user_devices (
      user_id INTEGER,
      device_id TEXT,
      PRIMARY KEY(user_id, device_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(device_id) REFERENCES devices(id)
    );
  `, (err) => {
    if (err) {
      console.error('Napaka pri ustvarjanju tabel:', err);
      process.exit(1);
    } else {
      console.log('Tabele ustvarjene.');
      startServer();
    }
  });
});

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'moj-tajni-kljuc',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/firmware', express.static('firmware'));

// Routes
const deviceRoutes = require('./routes/devices');
app.use('/device', deviceRoutes);

// Passport avtentikacija
passport.use(new LocalStrategy((username, password, done) => {
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

app.get('/register', (req, res) => res.render('register'));

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.length < 3 || password.length < 6 || !/^[a-zA-Z0-9]+$/.test(username)) {
    return res.send('Username mora biti minimalno 3 znake, geslo vsaj 6 znakov in samo alfanumerični znaki.');
  }
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err) => {
    if (err) {
      return res.send('Uporabnik že obstaja.');
    }
    res.redirect('/login');
  });
});

app.get('/login', (req, res) => res.render('login'));

app.post('/login', passport.authenticate('local', { successRedirect: '/', failureRedirect: '/login' }));

app.get('/', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  const userId = req.user.id;
  db.all(`SELECT devices.* FROM devices 
          JOIN user_devices ON devices.id = user_devices.device_id
          WHERE user_devices.user_id = ?`, [userId], (err, devices) => {
    if (err) return res.send('Napaka pri pridobivanju naprav.');
    res.render('index', { devices: devices, user: req.user });
  });
});

app.post('/add-device', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  const { name, deviceId } = req.body;
  if (deviceId.length !== 8 || !/^[a-zA-Z0-9]{8}$/.test(deviceId)) {
    return res.send('ID naprave mora biti točno 8-mestni alfanumerični niz.');
  }
  // Vstavi napravo (če je še ni)
  db.run('INSERT OR IGNORE INTO devices (id, name) VALUES (?, ?)', [deviceId, name], (err) => {
    if (err) return res.send('Napaka pri dodajanju naprave.');
    // Poveži napravo z uporabnikom
    db.run('INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)', [req.user.id, deviceId], (err) => {
      if (err) return res.send('Napaka pri povezovanju naprave z uporabnikom.');
      res.redirect('/');
    });
  });
});

// Admin panel
app.get('/admin', (req, res) => {
  if (!req.isAuthenticated() || !req.user.is_admin) return res.redirect('/');
  db.all('SELECT * FROM firmware ORDER BY upload_date DESC', [], (err, firmwares) => {
    if (err) return res.send('Napaka pri pridobivanju firmware.');
    res.render('admin', { firmwares, user: req.user });
  });
});

// Nalaganje firmware
app.post('/admin/upload-firmware', upload.single('firmware'), (req, res) => {
  if (!req.isAuthenticated() || !req.user.is_admin) return res.redirect('/');
  const version = req.body.version;
  const filename = req.file.originalname;
  const filePath = `/firmware/${filename}`;
  const uploadDate = Math.floor(Date.now() / 1000);

  db.run('INSERT INTO firmware (version, filename, upload_date, file_path) VALUES (?, ?, ?, ?)', [version, filename, uploadDate, filePath], (err) => {
    if (err) return res.send('Firmware z to verzijo že obstaja.');
    res.redirect('/admin');
  });
});

// Brisanje firmware
app.post('/admin/delete-firmware/:id', (req, res) => {
  if (!req.isAuthenticated() || !req.user.is_admin) return res.redirect('/');
  const fwId = req.params.id;
  db.get('SELECT * FROM firmware WHERE id = ?', [fwId], (err, firmware) => {
    if (firmware) {
      const fullPath = path.join(__dirname, firmware.file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      db.run('DELETE FROM firmware WHERE id = ?', [fwId], (err) => {
        res.redirect('/admin');
      });
    } else {
      res.redirect('/admin');
    }
  });
});

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/login'));
});

function startServer() {
  app.listen(3000, () => console.log('Strežnik teče na http://localhost:3000'));
}
