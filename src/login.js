'use strict';

const { sendPhoto, sendMessage, waitForReply, getLastUpdateId } = require('./telegram');
const { resolverCaptcha, aprenderCaracteres } = require('./captcha-ocr');

// Si el login funciona de verdad, ya sabemos con certeza qué carácter era
// cada trozo: lo añadimos a la biblioteca de referencia para que el
// reconocimiento mejore solo, uso tras uso.
function aprenderSiCoincide(bitmaps, texto) {
  if (!bitmaps || bitmaps.length !== texto.length) return;
  aprenderCaracteres(bitmaps.map((bitmap, i) => ({ label: texto[i], bitmap })));
}

const BASE = 'https://www.citapreviadnie.es/citaPreviaDni/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// --- pequeña "cookie jar" manual (no dependemos de librerías extra) ---
function makeJar() {
  const cookies = new Map();
  return {
    apply(setCookieHeaders) {
      if (!setCookieHeaders) return;
      const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
      for (const raw of arr) {
        const [pair] = raw.split(';');
        const idx = pair.indexOf('=');
        if (idx === -1) continue;
        cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    },
    header() {
      return Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    },
  };
}

async function fetchWithJar(jar, url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    redirect: 'manual',
    headers: {
      'User-Agent': UA,
      Cookie: jar.header(),
      ...(opts.headers || {}),
    },
  });
  jar.apply(res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.get('set-cookie'));

  if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
    const next = new URL(res.headers.get('location'), url).toString();
    return fetchWithJar(jar, next, { method: 'GET' });
  }
  return res;
}

function extraerAccionYJsessionid(html) {
  const m = html.match(/<form[^>]*id="Autentificar"[^>]*action="([^"]+)"/);
  if (!m) throw new Error('No se encontró el formulario de login (¿ha cambiado la web?)');
  return m[1];
}

const MAX_INTENTOS_OCR = 3;
// Con la distancia "blanda" (ver captcha-ocr.js) la confianza ya no es
// comparable a un % absoluto fiable: el 58% de los aciertos reales caen por
// debajo de 35 en validación offline. El filtro real es el propio servidor,
// así que solo descartamos un intento si la segmentación es claramente rara.
const CONFIANZA_MINIMA = 0;
const PAUSA_ENTRE_INTENTOS_MS = 8000;

function loginConseguido(html) {
  return !/id="Autentificar"/.test(html);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Reintenta una vez ante cortes de conexión transitorios (el sitio a veces
// corta la conexión si nota demasiadas peticiones seguidas).
async function conReintentoDeRed(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e && (e.cause?.code === 'UND_ERR_SOCKET' || /terminated|socket|network/i.test(e.message))) {
      await sleep(5000);
      return fn();
    }
    throw e;
  }
}

async function intentarLogin(jar, loginUrl, accion, codigoCaptcha) {
  const body = new URLSearchParams({
    idDocumento: 'D',
    numDocumento: process.env.DNI_NUM_DOCUMENTO,
    letraDocumento: process.env.DNI_LETRA_DOCUMENTO,
    codEquipo: process.env.DNI_COD_EQUIPO,
    fechaValidez: process.env.DNI_FECHA_VALIDEZ,
    numSoporte: process.env.DNI_NUM_SOPORTE,
    codSeguridad: codigoCaptcha,
    tipoCaptcha: 'visual',
  });

  const postUrl = new URL(accion, loginUrl).toString();
  const resLogin = await fetchWithJar(jar, postUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return resLogin.text();
}

/**
 * Login completo: pide la página de login, intenta resolver el captcha con
 * OCR local varias veces y, solo si todos los intentos fallan, lo pide por
 * Telegram como respaldo. Devuelve { jar, html, fetch } de la página tras login.
 */
async function login() {
  const jar = makeJar();
  const tipo = process.env.DNI_ES_MODELO_4_0 === 'true' ? '?tipo=DNI4&documento=D' : '';
  const loginUrl = `${BASE}InicioDNINIE.action${tipo}`;

  const resInicio = await conReintentoDeRed(() => fetchWithJar(jar, loginUrl));
  const htmlInicio = await resInicio.text();
  const accion = extraerAccionYJsessionid(htmlInicio);
  const capUrl = new URL('jcaptcha.jpg', loginUrl).toString();

  for (let intento = 1; intento <= MAX_INTENTOS_OCR; intento++) {
    if (intento > 1) await sleep(PAUSA_ENTRE_INTENTOS_MS);

    const resCap = await conReintentoDeRed(() => fetchWithJar(jar, capUrl));
    const capBuffer = Buffer.from(await resCap.arrayBuffer());

    const { texto, confianzaMedia, nCaracteres, bitmaps } = await resolverCaptcha(capBuffer);
    console.log(`[login] intento OCR ${intento}/${MAX_INTENTOS_OCR}: "${texto}" (${nCaracteres} trozos, confianza ${Math.round(confianzaMedia)})`);

    if (nCaracteres !== 4 || texto.length !== 4 || confianzaMedia < CONFIANZA_MINIMA) {
      console.log('[login]   -> descartado antes de probarlo (segmentación rara)');
      continue; // no merece la pena ni intentarlo, pedimos otro captcha
    }

    const html = await conReintentoDeRed(() => intentarLogin(jar, loginUrl, accion, texto));
    if (loginConseguido(html)) {
      console.log(`[login]   -> ÉXITO AUTOMÁTICO (OCR, intento ${intento})`);
      aprenderSiCoincide(bitmaps, texto);
      return { jar, html, fetch: (url, opts) => fetchWithJar(jar, url, opts) };
    }
    console.log('[login]   -> rechazado por el servidor');
  }

  // Todos los intentos de OCR fallaron: pedimos el captcha por Telegram.
  console.log('[login] los intentos automáticos fallaron, pidiendo el captcha por Telegram...');
  await sleep(PAUSA_ENTRE_INTENTOS_MS);
  const resCap = await conReintentoDeRed(() => fetchWithJar(jar, capUrl));
  const capBuffer = Buffer.from(await resCap.arrayBuffer());

  // Aunque lo vaya a resolver el humano, segmentamos igualmente: si acierta,
  // esos trozos con la respuesta real son oro puro para aprender.
  const { nCaracteres, bitmaps } = await resolverCaptcha(capBuffer);

  const lastUpdateId = await getLastUpdateId();
  await sendPhoto(
    capBuffer,
    `⚠️ No he podido leer el captcha yo solo tras ${MAX_INTENTOS_OCR} intentos. Responde con el texto de esta imagen.`
  );
  const { text: codigoCaptcha } = await waitForReply({ afterUpdateId: lastUpdateId, timeoutMs: 5 * 60 * 1000 });

  const html = await conReintentoDeRed(() => intentarLogin(jar, loginUrl, accion, codigoCaptcha));
  if (loginConseguido(html)) {
    console.log('[login]   -> ÉXITO CON AYUDA MANUAL (Telegram)');
    if (nCaracteres === codigoCaptcha.length) aprenderSiCoincide(bitmaps, codigoCaptcha);
  } else {
    console.log('[login]   -> el servidor también rechazó la respuesta manual');
  }
  return { jar, html, fetch: (url, opts) => fetchWithJar(jar, url, opts) };
}

module.exports = { login, BASE, UA };
