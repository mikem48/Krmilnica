const express = require('express');
const db = require('../database');
const router = express.Router();

/**
 * Stran za nastavitve naprave
 * URL: /:id/settings
 */
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
    db.get('SELECT * FROM firmware ORDER BY upload_date DESC LIMIT 1', [], (fwErr, latestFirmware) => {
      if (fwErr) {
        console.error('Napaka pri poizvedbi firmware:', fwErr);
      }

      // Izračun online statusa (online, če je aktivna v zadnjih 5 minutah)
      const now = Math.floor(Date.now() / 1000);
      const lastUpdate = device.last_update || 0;
      const isOnline = (now - lastUpdate) < 21600;

      const lastUpdateFormatted =
        lastUpdate > 0 ? new Date(lastUpdate * 1000).toLocaleString('sl-SI', { timeZone: 'Europe/Ljubljana' }) : 'Nikoli';

      // Params iz baze
      let params = {};
      try {
        params = device.params ? JSON.parse(device.params) : {};
      } catch (e) {
        console.error('Napaka pri JSON.parse(device.params):', e);
        params = {};
      }

      // Pretvori SQLite integer (0/1) ali boolean v pravi JS boolean
      const toBool = (v) => v === 1 || v === true;

      // Objekt, ki ga uporablja device-settings.ejs
      // Individualne kolumne (iz updatesettings) imajo prednost pred params JSON
      const settings = {
        ...params,
        visina: device.visina,
        wifi_cas: device.wifi_cas,
        obvestilo_napetost: device.obvestilo_napetost,
        obvestilo_krmilo: device.obvestilo_krmilo,
        obvestilo_stevilka: device.obvestilo_stevilka,
        ura1_h: device.ura1_h,
        ura1_min: device.ura1_min,
        ura2_h: device.ura2_h,
        ura2_min: device.ura2_min,
        casovnik2: toBool(device.casovnik2),
        cas_delovanja: device.cas_delovanja,
        hitrost_motorja: device.hitrost_motorja,
        pon: toBool(device.pon),
        tor: toBool(device.tor),
        sre: toBool(device.sre),
        cet: toBool(device.cet),
        pet: toBool(device.pet),
        sob: toBool(device.sob),
        ned: toBool(device.ned),
        device_id: device.id,
        device_name: device.name,
        value1: device.value1,
        value2: device.value2,
        online: device.isOnline,
        last_update: lastUpdateFormatted
      };

      res.render('device-settings', {
        settings,
        latestFirmware: latestFirmware || null,
        user: req.user // pomembno: da EJS navbar ne pade z "user is not defined"
      });
    });
  });
});

/**
 * Posodobi parametre naprave
 * URL: /:id/settings
 *
 * Podpira "shrani samo spremembe":
 * - če frontend pošlje samo spremenjena polja, se naredi merge z obstoječimi params
 * - checkboxi so mapirani na boolean
 */
router.post('/:id/settings', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');

  const deviceId = req.params.id;
  if (!/^[a-zA-Z0-9]{8}$/.test(deviceId)) {
    return res.send('Neveljaven ID naprave.');
  }

  // Preberi trenutne params z preverjanjem dostopa
  const selectQuery = `
    SELECT devices.params
    FROM devices
    JOIN user_devices ON devices.id = user_devices.device_id
    WHERE devices.id = ? AND user_devices.user_id = ?
  `;

  db.get(selectQuery, [deviceId, req.user.id], (err, row) => {
    if (err) {
      console.error('Napaka pri branju params:', err);
      return res.send('Prišlo je do napake.');
    }
    if (!row) {
      return res.send('Nimate dovoljenja za posodobitev te naprave.');
    }

    let currentParams = {};
    try {
      currentParams = row.params ? JSON.parse(row.params) : {};
    } catch (e) {
      console.error('Napaka pri JSON.parse(row.params):', e);
      currentParams = {};
    }

    // Checkbox polja, ki jih imaš v napravi/krmilnici
    const checkboxFields = new Set([
      'casovnik2', 'pon', 'tor', 'sre', 'cet', 'pet', 'sob', 'ned'
    ]);

    // Merge samo prispelih polj (tako lahko shraniš samo spremembe)
    const merged = { ...currentParams };

    for (const [key, raw] of Object.entries(req.body)) {
      if (key === 'device_id') continue; // id dobimo iz URL-ja

      if (checkboxFields.has(key)) {
        // Frontend pošilja:
        // checked -> "1"
        // unchecked (če spremenjeno) -> "" (hidden input)
        merged[key] = raw === '1';
        continue;
      }

      // ostala polja: poskusi pretvorit v number, sicer pusti string
      if (raw === '') {
        merged[key] = '';
        continue;
      }

      const asNumber = Number(raw);
      merged[key] = Number.isFinite(asNumber) && raw.trim() !== '' ? asNumber : raw;
    }

    const params = JSON.stringify(merged);

    const updateQuery = `
      UPDATE devices
      SET params = ?
      WHERE id = ? AND id IN (
        SELECT device_id FROM user_devices WHERE user_id = ?
      )
    `;

    db.run(updateQuery, [params, deviceId, req.user.id], function (updateErr) {
      if (updateErr) {
        console.error('Napaka pri posodabljanju nastavitev:', updateErr);
        return res.send('Napaka pri shranjevanju nastavitev.');
      }
      if (this.changes === 0) {
        return res.send('Nimate dovoljenja za posodobitev te naprave.');
      }
      res.redirect('/');
    });
  });
});

/**
 * Sprejem podatkov iz ESP32
 * URL: /data
 */
router.post('/data', (req, res) => {
  const { deviceId, value1, value2 } = req.body;

  if (!deviceId || !/^[a-zA-Z0-9]{8}$/.test(deviceId)) {
    return res.status(400).send('Neveljaven ID naprave.');
  }

  const lastUpdate = Math.floor(Date.now() / 1000);

  db.run(
    'UPDATE devices SET value1 = ?, value2 = ?, last_update = ? WHERE id = ?',
    [value1, value2, lastUpdate, deviceId],
    (err) => {
      if (err) {
        console.error('Napaka pri posodabljanju vrednosti:', err);
        return res.status(500).send('Napaka v bazi.');
      }
      res.send('OK');
    }
  );
});
// Endpoint: POST /device/updateSettings
// Sprejme: deviceId in katera koli nastavitev (delni vnos je dovoljen)
router.post('/updatesettings', (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId || !/^[a-zA-Z0-9]{8}$/.test(deviceId)) {
    return res.status(400).send('Neveljaven ID naprave.');
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
    (err) => {
      if (err) {
        console.error('Napaka pri posodabljanju vrednosti:', err);
        return res.status(500).send('Napaka v bazi.');
      }
      res.send('OK');
    }
  );
});
/**
 * Branje parametrov za ESP32
 * URL: /:id/params
 */
router.get('/:id/params', (req, res) => {
  const deviceId = req.params.id;

  if (!/^[a-zA-Z0-9]{8}$/.test(deviceId)) {
    return res.status(400).send('Neveljaven ID naprave.');
  }

  db.get('SELECT params FROM devices WHERE id = ?', [deviceId], (err, device) => {
    if (err || !device) {
      return res.status(404).send('Naprava ne obstaja.');
    }

    let params = {};
    try {
      params = device.params ? JSON.parse(device.params) : {};
    } catch (e) {
      console.error('Napaka pri JSON.parse(params) za napravo:', deviceId, e);
      params = {};
    }

    res.json(params);
  });
});

/**
 * Preveri, ali je na voljo posodobitev firmware (za ESP32)
 * URL: /:id/check-update?version=...
 */
router.get('/:id/check-update', (req, res) => {
  const deviceId = req.params.id;
  const currentVersion = req.query.version || 'krmilnica_01.01.24';

  if (!/^[a-zA-Z0-9]{8}$/.test(deviceId)) {
    return res.status(400).send('Neveljaven ID naprave.');
  }

  // Posodobitev trenutne verzije v bazi naprave (brez auth kot prej)
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

    res.json({
      updateAvailable,
      currentVersion,
      latestVersion: firmware.version,
      fileSize: firmware.file_size || 0,
      md5: firmware.md5 || null,              // ADD: send MD5 to ESP32
      downloadUrl: updateAvailable ? `http://${req.get('host')}${firmware.file_path}` : null
    });
  });
});
// Odstrani napravo samo iz uporabnikovega seznama (briše povezavo v user_devices)
router.post('/:id/remove', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');

  const deviceId = req.params.id;
  if (!/^[a-zA-Z0-9]{8}$/.test(deviceId)) {
    return res.send('Neveljaven ID naprave.');
  }

  db.run(
    'DELETE FROM user_devices WHERE user_id = ? AND device_id = ?',
    [req.user.id, deviceId],
    function (err) {
      if (err) {
        console.error('Napaka pri odstranitvi iz user_devices:', err);
        return res.status(500).send('Napaka pri odstranitvi naprave iz seznama.');
      }

      // Po odstranitvi nazaj na domov (seznam naprav)
      return res.redirect('/');
    }
  );
});
module.exports = router;
