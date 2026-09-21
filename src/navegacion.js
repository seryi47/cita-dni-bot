'use strict';

const RE_META_REFRESH = /<meta[^>]*http-equiv="refresh"[^>]*content="(\d+);url=([^"]+)"/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Hace fetch de una URL y, si la respuesta es una pantalla de "Por favor
 * espere..." con meta-refresh, sigue el refresco automáticamente (con la
 * misma pausa que indica la página) hasta llegar a la página final.
 */
async function fetchResuelto(fetchS, url, { maxSaltos = 8 } = {}) {
  let actual = url;
  for (let i = 0; i < maxSaltos; i++) {
    const res = await fetchS(actual);
    const html = await res.text();
    const m = html.match(RE_META_REFRESH);
    if (!m) return { html, url: actual };

    const segundos = parseInt(m[1], 10) || 1;
    const siguiente = new URL(m[2].replace(/&amp;/g, '&'), actual).toString();
    await sleep(segundos * 1000);
    actual = siguiente;
  }
  throw new Error('Demasiados saltos de "Por favor espere" sin resolver en ' + url);
}

module.exports = { fetchResuelto };
