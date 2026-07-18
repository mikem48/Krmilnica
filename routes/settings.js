// routes/devices.js
const express = require('express');
const router = express.Router();
const db = require('../database');

// SPREJEM PODATKOV (ESP32 -> Server)


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
// Sprejme: deviceId in katera koli nastavitev (delni vnos je dovoljen)
router.post('/updatesettings', (req, res) => {
  const { deviceId } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: 'Manjkajoči podatki' });
  }

  const allowedFields = [
    'visina', 'wifi_cas', 'obvestilo_napetost', 'obvestilo_krmilo', 'obvestilo_stevilka',
    'ura1_h', 'ura1_min', 'ura2_h', 'ura2_min', 'casovnik2', 'cas_delovanja',
    'hitrost_motorja', 'pon', 'tor', 'sre', 'cet', 'pet', 'sob', 'ned'
  ];

  const setClauses = [];
  const params = [];

  // Field names come from the hardcoded allowedFields list, not from user input.
  // Values use parameterized queries (?), so there is no SQL injection risk.
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      params.push(req.body[field]);
    }
  });

  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'Ni polj za posodobitev' });
  }

  params.push(deviceId);

  db.run(
    `UPDATE devices SET ${setClauses.join(', ')} WHERE id = ?`,
    params,
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

  // ESP32 se avtenticira z device ID - preveri samo, ali naprava obstaja
  db.get(
    `SELECT id FROM devices WHERE id = ?`,
    [deviceId],
    (err, row) => {
      if (err || !row) {
        return res.status(403).json({ error: 'Naprava ne obstaja' });
      }

      const allowedFields = [
        'hitrost_motorja', 'ura1_h', 'ura1_min', 'ura2_h', 'ura2_min',
        'cas_delovanja', 'casovnik2', 'pon', 'tor', 'sre', 'cet', 'pet', 'sob', 'ned'
      ];

      const setClauses = [];
      const params = [];

      // Field names come from the hardcoded allowedFields list, not from user input.
      // Values use parameterized queries (?), so there is no SQL injection risk.
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          setClauses.push(`${field} = ?`);
          params.push(req.body[field]);
        }
      });

      setClauses.push('last_update = ?');
      params.push(Math.floor(Date.now() / 1000));
      params.push(deviceId);

      const sql = `UPDATE devices SET ${setClauses.join(', ')} WHERE id = ?`;

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
  const currentVersion = req.query.version || 'krmilnica_01.01.24';

  // Posodobitev trenutne verzije v bazi naprave (brez auth)
  db.run('UPDATE devices SET firmware_version = ? WHERE id = ?', [currentVersion, deviceId]);

  db.get('SELECT * FROM firmware ORDER BY upload_date DESC LIMIT 1', [], (err, firmware) => {
    if (err || !firmware) {
      return res.json({ updateAvailable: false });
    }

    // Pretvorba verzije za primerjavo: krmilnica_DD.MM.YY -> YYYYMMDD
    const parseVersion = (v) => {
      const m = v.match(/krmilnica_(\d{2})\.(\d{2})\.(\d{2})/);
      if (!m) return 0;
      return parseInt(`20${m[3]}${m[2]}${m[1]}`, 10);
    };

    const currentVerNum = parseVersion(currentVersion);
    const latestVerNum = parseVersion(firmware.version);
    const updateAvailable = latestVerNum > currentVerNum;
    let md5_ = null;
    let fileSize = null;
    if (updateAvailable) {
      // Adjust this path to match where your firmware files are stored
    const absPath = path.join(__dirname, '..', 'public', firmware.file_path);
    try {
    const data = fs.readFileSync(absPath);
    md5_ = crypto.createHash('md5').update(data).digest('hex');
    fileSize = data.length;
    } catch (e) {
    console.error('Could not read firmware file for MD5:', e.message);
    }
  }
    res.json({
      updateAvailable,
      currentVersion,
      latestVersion: firmware.version,
      downloadUrl: updateAvailable ? `${req.protocol}://${req.get('host')}${firmware.file_path}` : null
      md5: md5_,
      fileSize: fileSize
    });
  });
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
