const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./database');  // vaše database.js, ki ureja SQLite

const app = express();

// Nastavitve za POST podatke
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Nastavitve seje
app.use(session({
  secret: 'moj-tajni-kljuc',
  resave: false,
  saveUninitialized: false,
}));

// Passport inicializacija za avtentikacijo
app.use(passport.initialize());
app.use(passport.session());

// Statične datoteke - public mapa za CSS, JS, slike
app.use(express.static(path.join(__dirname, 'public')));

// Nastavitev EJS kot predlog
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Passport lokalna strategija prijave
passport.use(new LocalStrategy((username, password, done) => {
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return done(err);
    if (!user) return done(null, false, { message: 'Napačno uporabniško ime' });
    if (!bcrypt.compareSync(password, user.password)) return done(null, false, { message: 'Napačno geslo' });
    return done(null, user);
  });
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => done(err, user));
});

// Middleware za zaščito poti
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

// Prikaz login strani
app.get('/login', (req, res) => {
  res.render('login');
});

// Obdelava prijave
app.post('/login', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login'
}));

// Prikaz registracije
app.get('/register', (req, res) => {
  res.render('register');
});

// Obdelava registracije
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.send('Uporabniško ime in geslo sta obvezna.');

  const hashedPassword = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err) => {
    if (err) return res.send('Uporabnik že obstaja ali napaka.');
    res.redirect('/login');
  });
});

// Osnovna stran – seznam naprav za prijavljenega uporabnika
app.get('/', ensureAuthenticated, (req, res) => {
  db.all('SELECT * FROM devices WHERE user_id = ?', [req.user.id], (err, devices) => {
    if (err) return res.send('Napaka pri pridobivanju naprav.');
    res.render('index', { devices, user: req.user });
  });
});

// Obdelava dodajanja naprave
app.post('/add-device', ensureAuthenticated, (req, res) => {
  const { name, deviceId } = req.body;
  if (!name || !deviceId) return res.send('Ime in ID naprave sta obvezna.');
  if (deviceId.length !== 8) return res.send('ID naprave mora biti 8-mestni.');

  db.run('INSERT INTO devices (id, name, user_id) VALUES (?, ?, ?)', [deviceId, name, req.user.id], (err) => {
    if (err) return res.send('Naprava že obstaja ali napaka.');
    res.redirect('/');
  });
});

// Odjava
app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/login');
  });
});

// Zaženite strežnik
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Strežnik teče na http://localhost:${PORT}`);
});
