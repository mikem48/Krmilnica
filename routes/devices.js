const express = require('express');
const db = require('../database');
const router = express.Router();

// Stran za nastavitve naprave
router.get('/:id/settings', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  const deviceId = req.params.id;
  console.log('Nastavitve za ID:', deviceId);

  if (!/^[a-zA-Z0-9]{8}$/.test(deviceId)) {
    return res.send('Neveljaven ID naprave.');
  }

  // Preveri, če ima uporabnik dostop do naprave (povezanost v user_devices)
  const query = `
    SELECT devices.*
    FROM devices
    JOIN user_devices ON devices.id = user_devices.device_id
    WHERE devices.id = ? AND user_devices.user_id = ?
  `;

  db.get(query, [deviceId, req.user.id], (err, device) => {
    if (err) {
      console.error('Napaka pri poizvedbi za nastavitve:', err);
      return res.send('Prišlo je do napake.');
    }
    if (!device) {
      return res.send('Naprava ne obstaja ali nimate dovoljenja zanjo.');
    }

    // Dobite tudi najnovejšo verzijo firmware iz baze
    db.get('SELECT * FROM firmware ORDER BY upload_date DESC LIMIT 1', [], (err, latestFirmware) => {
      if (err) {
        console.error('Napaka pri poizvedbi firmware:', err);
      }
      res.render('device-settings', { device, latestFirmware: latestFirmware || null });
    });
  });
});

// Posodobi parametre naprave
router.post('/:id/settings', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  const deviceId = req.params.id;

  if (!/^[a-zA-Z0-9]{8}$/.test(deviceId)) {
    return res.send('Neveljaven ID naprave.');
  }

  const paramsObj = {
    ...req.body,
    // Če checkbox nima vrednosti, bo false
    enableAlerts: req.body.enableAlerts === 'true'
  };
  const params = JSON.stringify(paramsObj);

  // Posodobitev samo če ima uporabnik dostop do naprave
  const updateQuery = `
    UPDATE devices
    SET params = ?
    WHERE id = ? AND id IN (
      SELECT device_id FROM user_devices WHERE user_id = ?
    )
  `;

  db.run(updateQuery, [params, deviceId, req.user.id], function(err) {
    if (err) {
      console.error('Napaka pri posodabljanju nastavitev:', err);
      return res.send('Napaka pri shranjevanju nastavitev.');
    }
    if (this.changes === 0) {
      return res.send('Nimate dovoljenja za posodobitev te naprave.');
    }
    res.redirect('/');
  });
});

// Sprejem podatkov iz ESP32
router.post('/data', (req, res) => {
  const { deviceId, value1, value2 } = req.body;
  if (!deviceId || !/^[a-zA-Z0-9]{8}$/.test(deviceId)) {
    return res.status(400).send('Neveljaven ID naprave.');
  }
  const lastUpdate = Math.floor(Date.now() / 1000);
  db.run('UPDATE devices SET value1 = ?, value2 = ?, last_update = ? WHERE id = ?', 
         [value1, value2, lastUpdate, deviceId], (err) => {
    if (err) {
      console.error('Napaka pri posodabljanju vrednosti:', err);
      return res.status(500).send('Napaka v bazi.');
    }
    res.send('OK');
  });
});

// Branje parametrov za ESP32
router.get('/:id/params', (req, res) => {
  const deviceId = req.params.id;
  if (!/^[a-zA-Z0-9]{8}$/.test(deviceId)) {
    return res.status(400).send('Neveljaven ID naprave.');
  }
  db.get('SELECT params FROM devices WHERE id = ?', [deviceId], (err, device) => {
    if (err || !device) {
      return res.status(404).send('Naprava ne obstaja.');
    }
    const params = device.params ? JSON.parse(device.params) : {};
    res.json(params);
  });
});

// Preveri, ali je na voljo posodobitev firmware (za ESP32)
router.get('/:id/check-update', (req, res) => {
  const deviceId = req.params.id;
  const currentVersion = req.query.version || 'krmilnica_01.01.24';

  if (!/^[a-zA-Z0-9]{8}$/.test(deviceId)) {
    return res.status(400).send('Neveljaven ID naprave.');
  }

  // Posodobitev trenutne verzije v bazi naprave
  db.run('UPDATE devices SET firmware_version = ? WHERE id = ?', [currentVersion, deviceId]);

  db.get('SELECT * FROM firmware ORDER BY upload_date DESC LIMIT 1', [], (err, firmware) => {
    if (err || !firmware) {
      return res.json({ updateAvailable: false });
    }

    // Pretvorba verzije za primerjavo: krmilnica_DD.MM.YY -> YYYYMMDD
    const parseVersion = (v) => {
      const m = v.match(/krmilnica_(\d{2})\.(\d{2})\.(\d{2})/);
      if (!m) return 0;
      return parseInt(`20${m[3]}${m[2]}${m[1]}`);
    };

    const currentVerNum = parseVersion(currentVersion);
    const latestVerNum = parseVersion(firmware.version);
    const updateAvailable = latestVerNum > currentVerNum;

    res.json({
      updateAvailable,
      currentVersion,
      latestVersion: firmware.version,
      downloadUrl: updateAvailable ? `http://${req.get('host')}${firmware.file_path}` : null
    });
  });
});

module.exports = router;
