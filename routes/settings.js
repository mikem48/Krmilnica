// routes/devices.js
const express = require('express');
const router = express.Router();
const db = require('../database');

// ===========================
// SPREJEM PODATKOV (ESP32 -> Server)
// ===========================

// Endpoint: POST /device/data
// Sprejme: deviceId, value1, value2
router.post('/data', (req, res) => {
  const { deviceId, value1, value2 } = req.body;

  if (!deviceId || !value1 || !value2) {
    return res.status(400).json({ error: 'Manjkajoči podatki' });
  }

  const lastUpdate = Math.floor(Date.now() / 1000);

  db.run(
    `UPDATE devices SET value1 = ?, value2 = ?, last_update = ? WHERE id = ?`,
    [value1, value2, lastUpdate, deviceId],
    function (err) {
      if (err) {
        console.error('Napaka pri posodobitvi podatkov:', err);
        return res.status(500).json({ error: 'Napaka v bazi' });
      }
      res.json({ success: true, message: 'Podatki sprejeti' });
    }
  );
});
// Endpoint: POST /device/updateSettings
// Sprejme: deviceId, value1, value2
router.post('/updatesettings', (req, res) => {
  const { deviceId, visina, wifi_cas, obvestilo_napetost, obvestilo_krmilo, obvestilo_stevilka, ura1_h, ura1_min, ura2_h, ura2_min, casovnik2, cas_delovanja, hitrost_motorja, pon, tor, sre, cet, pet, sob, ned } = req.body;

  if (!deviceId || visina === undefined || wifi_cas === undefined || obvestilo_napetost === undefined || obvestilo_krmilo === undefined || obvestilo_stevilka === undefined || ura1_h === undefined || ura1_min === undefined || ura2_h === undefined || ura2_min === undefined || casovnik2 === undefined || cas_delovanja === undefined || hitrost_motorja === undefined || pon === undefined || tor === undefined || sre === undefined || cet === undefined || pet === undefined || sob === undefined || ned === undefined) {
    return res.status(400).json({ error: 'Manjkajoči podatki' });
  }


  db.run(
    `UPDATE devices SET visina = ?, wifi_cas = ?, obvestilo_napetost = ?, obvestilo_krmilo = ?, obvestilo_stevilka = ?, ura1_h = ?, ura1_min = ?, ura2_h = ?, ura2_min = ?, casovnik2 = ?, cas_delovanja = ?, hitrost_motorja = ?, pon = ?, tor = ?, sre = ?, cet = ?, pet = ?, sob = ?, ned = ? WHERE id = ?`,
    [visina, wifi_cas, obvestilo_napetost, obvestilo_krmilo, obvestilo_stevilka, ura1_h, ura1_min, ura2_h, ura2_min, casovnik2, cas_delovanja, hitrost_motorja, pon, tor, sre, cet, pet, sob, ned, deviceId],
    function (err) {
      if (err) {
        console.error('Napaka pri posodobitvi podatkov:', err);
        return res.status(500).json({ error: 'Napaka v bazi' });
      }
      res.json({ success: true, message: 'Podatki sprejeti' });
    }
  );
});
// ===========================
// SPREJEM NASTAVITEV (ESP32 -> Server)
// ===========================

// Endpoint: POST /device/:id/settings
// Sprejme: hitrost_motorja, ura1_h, ura1_min, ura2_h, ura2_min, cas_delovanja, casovnik2, dnevi
router.post('/:id/settings', (req, res) => {
  const deviceId = req.params.id;
  const {
    hitrost_motorja,
    ura1_h, ura1_min,
    ura2_h, ura2_min,
    cas_delovanja,
    casovnik2,
    pon, tor, sre, cet, pet, sob, ned
  } = req.body;

  // ESP32 se avtenticira z device ID - preveri samo, ali naprava obstaja
  db.get(
    `SELECT id FROM devices WHERE id = ?`,
    [deviceId],
    (err, row) => {
      if (err || !row) {
        return res.status(403).json({ error: 'Naprava ne obstaja' });
      }

      // Posodobi nastavitve v bazi
      const sql = `
        UPDATE devices SET 
          hitrost_motorja = ?,
          ura1_h = ?, ura1_min = ?,
          ura2_h = ?, ura2_min = ?,
          cas_delovanja = ?,
          casovnik2 = ?,
          pon = ?, tor = ?, sre = ?, cet = ?, pet = ?, sob = ?, ned = ?,
          last_update = ?
        WHERE id = ?
      `;

      const params = [
        hitrost_motorja, ura1_h, ura1_min,
        ura2_h, ura2_min, cas_delovanja,
        casovnik2,
        pon, tor, sre, cet, pet, sob, ned,
        Math.floor(Date.now() / 1000), deviceId
      ];

      db.run(sql, params, function (err) {
        if (err) {
          console.error('Napaka pri posodobitvi nastavitev:', err);
          return res.status(500).json({ error: 'Napaka pri posodobitvi' });
        }
        res.json({ success: true, message: 'Nastavitve posodobljene' });
      });
    }
  );
});

// ===========================
// PREVERJANJE FIRMWARE (ESP32 -> Server)
// ===========================

// Endpoint: GET /device/:id/check-update?version=...
router.get('/:id/check-update', (req, res) => {
  const deviceId = req.params.id;
  const { version } = req.query;

  // Preveri, ali ima uporabnik dostop do te naprave
  db.get(
    `SELECT user_id FROM user_devices WHERE device_id = ? AND user_id = ?`,
    [deviceId, req.user.id],
    (err, row) => {
      if (err || !row) {
        return res.status(403).json({ error: 'Dostop zavrnjen' });
      }

      // Primer: če je verzija starejša od trenutne
      const currentVersion = 'krmilnica_20.01.26';
      const updateAvailable = version !== currentVersion;

      res.json({
        updateAvailable: updateAvailable,
        latestVersion: currentVersion,
        downloadUrl: updateAvailable ? `https://github.com/mikem48/Krmilnica/releases/download/v${currentVersion}/firmware.bin` : null
      });
    }
  );
});

// ===========================
// PREJEM PARAMETROV (ESP32 -> Server)
// ===========================

// Endpoint: GET /device/:id/params
router.get('/:id/params', (req, res) => {
  const deviceId = req.params.id;

  db.get(
    `SELECT * FROM devices WHERE id = ?`,
    [deviceId],
    (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Naprava ni najdena' });
      }

      // Vrnejo se nastavitve za ESP32
      res.json({
        hitrost_motorja: row.hitrost_motorja,
        ura1_h: row.ura1_h,
        ura1_min: row.ura1_min,
        ura2_h: row.ura2_h,
        ura2_min: row.ura2_min,
        cas_delovanja: row.cas_delovanja,
        casovnik2: row.casovnik2,
        pon: row.pon,
        tor: row.tor,
        sre: row.sre,
        cet: row.cet,
        pet: row.pet,
        sob: row.sob,
        ned: row.ned
      });
    }
  );
});

module.exports = router;
