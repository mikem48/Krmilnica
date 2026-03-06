const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./settings.db');
db.serialize(() => {
  db.run(`
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
      
      -- Krmilnica
      ura1_h INTEGER DEFAULT 0,
      ura1_min INTEGER DEFAULT 0,
      ura2_h INTEGER DEFAULT 0,
      ura2_min INTEGER DEFAULT 0,
      casovnik2 INTEGER DEFAULT 0,
      cas_delovanja INTEGER DEFAULT 60,
      hitrost_motorja INTEGER DEFAULT 100,
      
      -- Dnevi
      pon INTEGER DEFAULT 0,
      tor INTEGER DEFAULT 0,
      sre INTEGER DEFAULT 0,
      cet INTEGER DEFAULT 0,
      pet INTEGER DEFAULT 0,
      sob INTEGER DEFAULT 0,
      ned INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      is_admin INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_devices (
      user_id INTEGER,
      device_id TEXT,
      UNIQUE(user_id, device_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS firmware (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT,
      file_path TEXT,
      upload_date INTEGER
    )
  `);
});

module.exports = db;
