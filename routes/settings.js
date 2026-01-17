const express = require('express');
const router = express.Router();
const db = require('./nastavitve.db'); // tvoja baza

// Helper za checkbox -> boolean
const castBool = v => v === 'on';

// GET /settings?device_id=naprava123
router.get('/settings', async (req, res) => {
  let deviceId = req.query.device_id;
  if (!deviceId) {
    return res.status(400).send('Manjkajoči device_id.');
  }

  try {
    const [rows] = await db.query('SELECT * FROM device_settings WHERE device_id = ? LIMIT 1', [deviceId]);
    
    // Privzete vrednosti, če ni zapisa
    const defaults = {
      device_id: deviceId,
      ura_h: '', ura_min: '', datum_dan: '', datum_mesec: '', datum_leto: '',
      visina: '', wifi_cas: '', obvestilo_napetost: '', obvestilo_krmilo: '', obvestilo_stevilka: '',
      casovnika_on: true,
      ura1_h: '', ura1_min: '', ura2_h: '', ura2_min: '', casovnik2: false,
      cas_delovanja: '', hitrost_motorja: '',
      pon: true, tor: true, sre: true, cet: true, pet: true, sob: true, ned: true
    };

    const settings = rows.length > 0 ? rows[0] : defaults;

    res.render('device-krmilnica-settings', { settings });
  } catch(err) {
    console.error(err);
    res.status(500).send('Napaka pri nalaganju nastavitev.');
  }
});

// POST /settings
router.post('/settings', async (req, res) => {
  const data = req.body;

  if (!data.device_id) {
    return res.status(400).send('Manjkajoči device_id.');
  }

  try {
    // Preveri če obstajajo nastavitve za device_id
    const [rows] = await db.query('SELECT id FROM device_settings WHERE device_id = ? LIMIT 1', [data.device_id]);
    const values = [
      data.device_id,
      parseInt(data.ura_h), parseInt(data.ura_min),
      parseInt(data.datum_dan), parseInt(data.datum_mesec), parseInt(data.datum_leto),
      parseFloat(data.visina), parseInt(data.wifi_cas),
      parseFloat(data.obvestilo_napetost), parseInt(data.obvestilo_krmilo),
      data.obvestilo_stevilka,

      true, // casovnika_on privzeto true
      parseInt(data.ura1_h), parseInt(data.ura1_min),
      data.ura2_h ? parseInt(data.ura2_h) : null,
      data.ura2_min ? parseInt(data.ura2_min) : null,
      castBool(data.casovnik2),
      parseInt(data.cas_delovanja), parseInt(data.hitrost_motorja),

      castBool(data.pon), castBool(data.tor), castBool(data.sre),
      castBool(data.cet), castBool(data.pet), castBool(data.sob), castBool(data.ned)
    ];

    if (rows.length > 0) {
      // Update
      await db.query(
        `UPDATE device_settings SET
          ura_h=?, ura_min=?, datum_dan=?, datum_mesec=?, datum_leto=?, visina=?, wifi_cas=?, 
          obvestilo_napetost=?, obvestilo_krmilo=?, obvestilo_stevilka=?, casovnika_on=?,
          ura1_h=?, ura1_min=?, ura2_h=?, ura2_min=?, casovnik2=?, cas_delovanja=?, hitrost_motorja=?,
          pon=?, tor=?, sre=?, cet=?, pet=?, sob=?, ned=?
         WHERE device_id=?`,
        [...values.slice(1), data.device_id]
      );
    } else {
      // Insert
      await db.query(
        `INSERT INTO device_settings (
          device_id, ura_h, ura_min, datum_dan, datum_mesec, datum_leto, visina, wifi_cas, 
          obvestilo_napetost, obvestilo_krmilo, obvestilo_stevilka, casovnika_on,
          ura1_h, ura1_min, ura2_h, ura2_min, casovnik2, cas_delovanja, hitrost_motorja,
          pon, tor, sre, cet, pet, sob, ned
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );
    }

    // Preusmeri nazaj na GET z device_id, da sproži prikaz vsega
    res.redirect(`/settings?device_id=${encodeURIComponent(data.device_id)}`);

  } catch (err) {
    console.error(err);
    res.status(500).send('Napaka pri shranjevanju nastavitev.');
  }
});

module.exports = router;
