const express = require('express');
const router = express.Router();
const db = require('../db'); // Tvoja povezava do baze

router.get('/settings', async (req, res) => {
  try {
    // Pridobi obstoječe nastavitve - prilagodi glede na tvojo bazo
    const [rows] = await db.query('SELECT * FROM device_krmilnica_settings ORDER BY id DESC LIMIT 1');
    const settings = rows[0] || {};
    res.render('device-krmilnica-settings', { settings });
  } catch (error) {
    console.error(error);
    res.status(500).send('Napaka pri nalaganju nastavitev.');
  }
});

router.post('/settings', async (req, res) => {
  try {
    const data = req.body;

    // Pretvori checkboxe na boolean (on/undefined)
    const getBool = (v) => v === 'on';

    // Poišči ali vstavi podatke v bazo (prilagodi tabeli in stolpcem)
    const [rows] = await db.query('SELECT id FROM device_krmilnica_settings LIMIT 1');

    const values = [
      data.ura_h, data.ura_min, data.datum_dan, data.datum_mesec, data.datum_leto,
      data.visina, data.wifi_cas, data.obvestilo_napetost, data.obvestilo_krmilo, data.obvestilo_stevilka,
      true, // casovnika_on privzeto true
      data.ura1_h, data.ura1_min, data.ura2_h || null, data.ura2_min || null, getBool(data.casovnik2),
      data.cas_delovanja, data.hitrost_motorja,
      getBool(data.pon), getBool(data.tor), getBool(data.sre), getBool(data.cet),
      getBool(data.pet), getBool(data.sob), getBool(data.ned)
    ];

    if (rows.length > 0) {
      await db.query(
        `UPDATE device_krmilnica_settings SET 
          ura_h=?, ura_min=?, datum_dan=?, datum_mesec=?, datum_leto=?, visina=?, wifi_cas=?, obvestilo_napetost=?, obvestilo_krmilo=?, obvestilo_stevilka=?,
          casovnika_on=?,
          ura1_h=?, ura1_min=?, ura2_h=?, ura2_min=?, casovnik2=?, cas_delovanja=?, hitrost_motorja=?,
          pon=?, tor=?, sre=?, cet=?, pet=?, sob=?, ned=? WHERE id=?`,
        [...values, rows[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO device_krmilnica_settings (
          ura_h, ura_min, datum_dan, datum_mesec, datum_leto, visina, wifi_cas, obvestilo_napetost, obvestilo_krmilo, obvestilo_stevilka,
          casovnika_on,
          ura1_h, ura1_min, ura2_h, ura2_min, casovnik2, cas_delovanja, hitrost_motorja,
          pon, tor, sre, cet, pet, sob, ned
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );
    }

    res.redirect('/settings');
  } catch (error) {
    console.error(error);
    res.status(500).send('Napaka pri shranjevanju nastavitev.');
  }
});

module.exports = router;
