'use strict';
const fs = require('fs');

const BASE = 'https://www.citapreviadnie.es/citaPreviaDni/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function makeJar() {
  const cookies = new Map();
  return {
    apply(h) {
      if (!h) return;
      const arr = Array.isArray(h) ? h : [h];
      for (const raw of arr) {
        const [pair] = raw.split(';');
        const i = pair.indexOf('=');
        if (i === -1) continue;
        cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    },
    header() { return Array.from(cookies.entries()).map(([k, v]) => k + '=' + v).join('; '); },
  };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchCaptchaBuffer() {
  const jar = makeJar();
  const res1 = await fetch(BASE + 'InicioDNINIE.action', { headers: { 'User-Agent': UA, Cookie: jar.header() } });
  jar.apply(res1.headers.getSetCookie ? res1.headers.getSetCookie() : res1.headers.get('set-cookie'));
  await res1.text();
  const res2 = await fetch(BASE + 'jcaptcha.jpg', { headers: { 'User-Agent': UA, Cookie: jar.header() } });
  jar.apply(res2.headers.getSetCookie ? res2.headers.getSetCookie() : res2.headers.get('set-cookie'));
  return Buffer.from(await res2.arrayBuffer());
}

const N = parseInt(process.argv[2] || '15', 10);
const PAUSA_MS = 5000;
const DIR = 'bg_samples2';

(async () => {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);
  const existentes = fs.readdirSync(DIR).filter((f) => f.endsWith('.jpg')).length;

  for (let i = 0; i < N; i++) {
    if (i > 0) await sleep(PAUSA_MS);
    const buf = await fetchCaptchaBuffer();
    const nombre = `t${existentes + i}.jpg`;
    fs.writeFileSync(`${DIR}/${nombre}`, buf);
    console.log('guardado', nombre);
  }
  console.log('Listo.');
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
