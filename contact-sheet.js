'use strict';
const fs = require('fs');
const sharp = require('sharp');
const { toBinaryMask, findBlobs, mergeCloseBlobs, normalizarBlob } = require('./src/captcha-ocr');
const { LOTES } = require('./labels');

const CELL = 60; // tamaño de cada celda en la hoja de contacto
const COLS = 8;

(async () => {
  const celdas = []; // { png buffer, texto }

  for (const { dir, etiquetas } of LOTES) {
    for (const [nombre, etiqueta] of Object.entries(etiquetas)) {
      const file = `${dir}/${nombre}.jpg`;
      if (!fs.existsSync(file) || !etiqueta) continue;
      const buf = fs.readFileSync(file);
      const mask = await toBinaryMask(buf);
      let blobs = findBlobs(mask);
      blobs = mergeCloseBlobs(blobs);
      if (blobs.length !== etiqueta.length) continue;

      for (let i = 0; i < blobs.length; i++) {
        if (etiqueta[i] === '#') continue;
        const bitmap = await normalizarBlob(mask, blobs[i], 0);
        const png = await sharp(Buffer.from(bitmap), { raw: { width: 40, height: 56, channels: 1 } })
          .resize(CELL, CELL, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
          .png()
          .toBuffer();
        celdas.push({ png, texto: `${dir}_${nombre}_${i}=${etiqueta[i]}` });
      }
    }
  }

  const rows = Math.ceil(celdas.length / COLS);
  const sheetW = COLS * CELL;
  const sheetH = rows * (CELL + 14);

  const composite = celdas.map((c, idx) => ({
    input: c.png,
    left: (idx % COLS) * CELL,
    top: Math.floor(idx / COLS) * (CELL + 14),
  }));

  const base = sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: { r: 255, g: 255, b: 255 } } });
  await base.composite(composite).png().toFile('contact_sheet.png');

  fs.writeFileSync('contact_sheet_labels.txt', celdas.map((c, i) => `${i}: ${c.texto}`).join('\n'));
  console.log('Guardado contact_sheet.png con', celdas.length, 'caracteres,', rows, 'filas.');
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
