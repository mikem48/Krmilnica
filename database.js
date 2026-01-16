const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./esp32.db');

module.exports = db;
