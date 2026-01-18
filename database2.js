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
      params TEXT
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
