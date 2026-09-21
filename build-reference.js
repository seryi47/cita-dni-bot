'use strict';
const fs = require('fs');
const { toBinaryMask, findBlobs, mergeCloseBlobs, normalizarBlob } = require('./src/captcha-ocr');
const { LOTES } = require('./labels');

const ANGULOS = [-14, -7, 0, 7, 14];

async function procesarLote(dir, etiquetas, referencia, contador) {
  for (const [nombre, etiqueta] of Object.entries(etiquetas)) {
    const file = `${dir}/${nombre}.jpg`;
    if (!fs.existsSync(file)) continue;
    if (!etiqueta) { contador.excluidas++; continue; }

    const buf = fs.readFileSync(file);
    const mask = await toBinaryMask(buf);
    let blobs = findBlobs(mask);
    blobs = mergeCloseBlobs(blobs);

    if (blobs.length !== etiqueta.length) {
      console.log(`⚠️  ${dir}/${nombre}: se esperaban ${etiqueta.length} caracteres ("${etiqueta}") pero se detectaron ${blobs.length} trozos. Se omite.`);
      contador.excluidas++;
      continue;
    }

    for (let i = 0; i < blobs.length; i++) {
      if (etiqueta[i] === '#') continue; // carácter concreto marcado como mal segmentado
      const instancia = `${dir}_${nombre}_${i}`; // agrupa las 5 variantes rotadas de la MISMA letra real
      for (const angulo of ANGULOS) {
        const bitmap = await normalizarBlob(mask, blobs[i], angulo);
        referencia.push({ label: etiqueta[i], bitmap, instancia });
      }
    }
    contador.usadas++;
  }
}

(async () => {
  const referencia = [];
  const contador = { usadas: 0, excluidas: 0 };

  for (const { dir, etiquetas } of LOTES) {
    await procesarLote(dir, etiquetas, referencia, contador);
  }

  fs.writeFileSync('char_reference.json', JSON.stringify({ width: 40, height: 56, referencia }));
  console.log(`Listo. Muestras usadas: ${contador.usadas}, excluidas: ${contador.excluidas}, caracteres de referencia: ${referencia.length}`);

  const porLabel = {};
  for (const r of referencia) porLabel[r.label] = (porLabel[r.label] || 0) + 1;
  console.log('Cobertura por carácter:', JSON.stringify(porLabel));
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
