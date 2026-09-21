'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const BG_MODEL_PATH = path.join(__dirname, '..', 'bg_model.json');
const REF_PATH = path.join(__dirname, '..', 'char_reference.json');
const DIFF_THRESHOLD = 40;
const MIN_BLOB_PIXELS = 15;
const CANVAS_W = 40;
const CANVAS_H = 56;
const PAD = 6;
const MAX_REF_POR_LABEL = 40; // evita que un JSON infinito ralentice la comparación

let bgModel = null;
function loadBgModel() {
  if (!bgModel) {
    const raw = JSON.parse(fs.readFileSync(BG_MODEL_PATH));
    bgModel = { width: raw.width, height: raw.height, data: Buffer.from(raw.data) };
  }
  return bgModel;
}

// "Dilata" un bitmap 1 píxel: un hueco blanco pegado a tinta pasa a contar
// como "casi tinta". Se usa para una distancia más tolerante a pequeños
// desajustes de 1px entre dos trazos que en realidad son la misma letra.
function dilatar(bitmap) {
  const out = new Uint8Array(bitmap.length).fill(255);
  for (let y = 0; y < CANVAS_H; y++) {
    for (let x = 0; x < CANVAS_W; x++) {
      const i = y * CANVAS_W + x;
      if (bitmap[i] !== 0) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= CANVAS_W || ny >= CANVAS_H) continue;
          out[ny * CANVAS_W + nx] = 0;
        }
      }
    }
  }
  return out;
}

let refCache = null;
function loadReferencia() {
  if (!refCache) {
    if (fs.existsSync(REF_PATH)) {
      const raw = JSON.parse(fs.readFileSync(REF_PATH));
      refCache = (raw.referencia || []).map((r) => ({ ...r, dilatado: dilatar(r.bitmap) }));
    } else {
      refCache = [];
    }
  }
  return refCache;
}

function guardarReferencia(referencia) {
  // El .dilatado es derivado (se recalcula al cargar) y no se persiste. "instancia" si
  // existe SÍ se conserva (la usa validate.js para no hacer trampa con las rotaciones
  // sintéticas al medir precisión) — perderla no rompe el bot, pero sí las métricas.
  const soloDatos = referencia.map((r) => ({ label: r.label, bitmap: r.bitmap, instancia: r.instancia }));
  fs.writeFileSync(REF_PATH, JSON.stringify({ width: CANVAS_W, height: CANVAS_H, referencia: soloDatos }));
  refCache = referencia;
}

/**
 * Añade caracteres confirmados (login real que ha funcionado) a la
 * biblioteca de referencia, para que el reconocimiento mejore solo con el uso.
 */
function aprenderCaracteres(pares) {
  const referencia = loadReferencia().slice();
  for (const { label, bitmap } of pares) {
    referencia.push({ label, bitmap, dilatado: dilatar(bitmap) });
  }

  // Si algún carácter acumula demasiadas muestras, nos quedamos con las más recientes.
  const porLabel = {};
  const recortada = [];
  for (let i = referencia.length - 1; i >= 0; i--) {
    const r = referencia[i];
    porLabel[r.label] = (porLabel[r.label] || 0) + 1;
    if (porLabel[r.label] <= MAX_REF_POR_LABEL) recortada.push(r);
  }
  recortada.reverse();
  guardarReferencia(recortada);
}

async function toBinaryMask(imgBuffer) {
  const bg = loadBgModel();
  const { data, info } = await sharp(imgBuffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = Math.abs(data[i] - bg.data[i]) > DIFF_THRESHOLD ? 0 : 255;
  }
  return { data: out, width: info.width, height: info.height };
}

function findBlobs({ data, width, height }) {
  const visited = new Uint8Array(width * height);
  const blobs = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (data[idx] !== 0 || visited[idx]) continue;

      let minX = x, maxX = x, minY = y, maxY = y, count = 0;
      const stack = [idx];
      visited[idx] = 1;

      while (stack.length) {
        const cur = stack.pop();
        const cy = Math.floor(cur / width);
        const cx = cur % width;
        count++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1],
          [cx + 1, cy + 1], [cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (data[nIdx] === 0 && !visited[nIdx]) {
            visited[nIdx] = 1;
            stack.push(nIdx);
          }
        }
      }

      if (count >= MIN_BLOB_PIXELS) blobs.push({ minX, maxX, minY, maxY, count });
    }
  }

  return blobs.sort((a, b) => a.minX - b.minX);
}

function mergeCloseBlobs(blobs, gapPx = 4) {
  const merged = [];
  for (const b of blobs) {
    const last = merged[merged.length - 1];
    if (last && b.minX - last.maxX <= gapPx && Math.max(b.maxY, last.maxY) - Math.min(b.minY, last.minY) < 40) {
      last.minX = Math.min(last.minX, b.minX);
      last.maxX = Math.max(last.maxX, b.maxX);
      last.minY = Math.min(last.minY, b.minY);
      last.maxY = Math.max(last.maxY, b.maxY);
    } else {
      merged.push({ ...b });
    }
  }
  return merged;
}

// Normaliza un blob (recortado de la máscara binaria) a un bitmap 28x40 fijo,
// manteniendo la proporción real del carácter (sin estirarlo) y centrándolo.
// Admite un ángulo opcional: el sitio rota cada carácter una cantidad
// distinta, así que al construir la referencia generamos varias copias
// rotadas de cada muestra real para poder reconocer letras "torcidas".
async function normalizarBlob(mask, b, angulo = 0) {
  const left = Math.max(0, b.minX - PAD);
  const top = Math.max(0, b.minY - PAD);
  const w = Math.min(mask.width - left, b.maxX - b.minX + 1 + PAD * 2);
  const h = Math.min(mask.height - top, b.maxY - b.minY + 1 + PAD * 2);

  let pipeline = sharp(mask.data, { raw: { width: mask.width, height: mask.height, channels: 1 } })
    .extract({ left, top, width: w, height: h });

  if (angulo) {
    pipeline = pipeline.rotate(angulo, { background: { r: 255, g: 255, b: 255 } });
  }

  const { data, info } = await pipeline
    .resize(CANVAS_W, CANVAS_H, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255 },
      kernel: 'nearest',
    })
    .greyscale()
    .threshold(128)
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 1 || data.length !== CANVAS_W * CANVAS_H) {
    throw new Error(`normalizarBlob: tamaño inesperado (channels=${info.channels}, bytes=${data.length})`);
  }
  return Array.from(data);
}

// Distancia "blanda": un píxel que no coincide exactamente solo cuenta
// como error completo si NI SIQUIERA hay tinta vecina (radio 1) en la otra
// imagen; si la hay, cuenta como un desajuste menor (0.3). Con esto, dos
// trazos que son la misma letra pero están desplazados 1px ya no se
// penalizan como si fueran letras distintas. Probado con leave-one-out:
// sube la precisión de 85.5% a 87.4% frente a la distancia exacta.
function distanciaBlanda(a, aDil, b, bDil) {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    d += aDil[i] === bDil[i] ? 0.3 : 1;
  }
  return d;
}

// Probado empíricamente con leave-one-out: k=1 (vecino más cercano) y k=2
// empatan como mejor opción; subir a k=3/5/9 EMPEORA (83.6% / 80.5% / 74.2%)
// porque hay letras con muy pocas muestras reales (5-10) y la votación las
// ahoga con vecinos de otras clases. Con este dataset, 1-NN puro gana.
function clasificar(bitmap, referencia, bitmapDilatado) {
  const dilatado = bitmapDilatado || dilatar(bitmap);
  let mejorLabel = null;
  let mejorDist = Infinity;
  let segundaDist = Infinity;

  for (const r of referencia) {
    const d = distanciaBlanda(bitmap, dilatado, r.bitmap, r.dilatado || dilatar(r.bitmap));
    if (d < mejorDist) {
      segundaDist = mejorDist;
      mejorDist = d;
      mejorLabel = r.label;
    } else if (d < segundaDist) {
      segundaDist = d;
    }
  }

  // confianza: cuánto margen relativo hay entre el mejor candidato y el segundo
  // (poco margen = ambigüedad real entre dos letras parecidas; si ambos son
  // coincidencia exacta —distancia 0, posible con referencia duplicada por
  // las rotaciones— se cuenta como máxima confianza, no como NaN)
  const confianza = mejorLabel === null || segundaDist === Infinity
    ? 0
    : segundaDist === 0
      ? 100
      : Math.round(100 * (1 - mejorDist / segundaDist));
  return { label: mejorLabel, confianza };
}

/**
 * Resuelve el captcha visual: resta el fondo fijo, segmenta caracteres y
 * clasifica cada uno por vecino más cercano contra la biblioteca aprendida.
 * Devuelve { texto, confianzaMedia, nCaracteres, bitmaps } (bitmaps sirve
 * para poder "aprender" estos caracteres si luego se confirma que eran correctos).
 */
async function resolverCaptcha(imgBuffer) {
  const mask = await toBinaryMask(imgBuffer);
  let blobs = findBlobs(mask);
  blobs = mergeCloseBlobs(blobs);
  const referencia = loadReferencia();

  let texto = '';
  const confianzas = [];
  const bitmaps = [];

  for (const b of blobs) {
    const bitmap = await normalizarBlob(mask, b);
    bitmaps.push(bitmap);
    const { label, confianza } = clasificar(bitmap, referencia);
    texto += label || '?';
    confianzas.push(confianza);
  }

  const confianzaMedia = confianzas.length ? confianzas.reduce((a, c) => a + c, 0) / confianzas.length : 0;
  return { texto, confianzaMedia, nCaracteres: blobs.length, bitmaps };
}

module.exports = {
  resolverCaptcha,
  toBinaryMask,
  findBlobs,
  mergeCloseBlobs,
  normalizarBlob,
  aprenderCaracteres,
  loadReferencia,
  clasificar,
};
