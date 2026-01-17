const sqlite3 = require('sqlite3').verbose();
const db1 = new sqlite3.Database('./esp32.db');
const db2 = new sqlite3.Database('./nastavitve.db');
module.exports = db1;
module.exports = db2;
