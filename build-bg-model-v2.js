'use strict';
const fs = require('fs');
const sharp = require('sharp');

const PERIOD = 24; // periodo horizontal del patrón de cestería, medido por autocorrelación

(async () => {
  const dirs = ['bg_samples', 'bg_samples2'];
  const files = dirs.flatMap((dir) =>
    fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).map((f) => `${dir}/${f}`) : []
  );
  let width, height;
  const porFase = {}; // clave `${x%PERIOD}_${y}` -> array de valores

  for (const f of files) {
    const buf = fs.readFileSync(f);
    const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
    width = info.width; height = info.height;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const fase = x % PERIOD;
        const key = `${fase}_${y}`;
        (porFase[key] || (porFase[key] = [])).push(data[y * width + x]);
      }
    }
  }

  console.log('Ficheros usados:', files.length, '| Observaciones por celda de fase (deberían ser ~', Math.ceil(180 / PERIOD) * files.length, '):',
    porFase[`0_30`] ? porFase[`0_30`].length : 'n/a');

  // Mediana por (fase, y) -> tile de PERIOD x height
  const tile = Buffer.alloc(PERIOD * height);
  for (let y = 0; y < height; y++) {
    for (let fase = 0; fase < PERIOD; fase++) {
      const vals = (porFase[`${fase}_${y}`] || [0]).slice().sort((a, b) => a - b);
      tile[y * PERIOD + fase] = vals[Math.floor(vals.length / 2)];
    }
  }

  // Repite el tile para reconstruir el fondo completo width x height
  const full = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      full[y * width + x] = tile[y * PERIOD + (x % PERIOD)];
    }
  }

  await sharp(full, { raw: { width, height, channels: 1 } }).png().toFile('bg_model_v2.png');
  await sharp(tile, { raw: { width: PERIOD, height, channels: 1 } })
    .resize(PERIOD * 8, height * 8, { kernel: 'nearest' })
    .png().toFile('bg_tile_v2.png');
  fs.writeFileSync('bg_model.json', JSON.stringify({ width, height, data: Array.from(full) }));
  console.log('Guardado bg_model.json (reconstruido por fase), bg_model_v2.png, bg_tile_v2.png');
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
