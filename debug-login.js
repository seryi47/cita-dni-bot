'use strict';
require('dotenv').config();
const fs = require('fs');
const { login } = require('./src/login');
const { sendMessage } = require('./src/telegram');

(async () => {
  const requeridos = [
    'DNI_NUM_DOCUMENTO',
    'DNI_LETRA_DOCUMENTO',
    'DNI_COD_EQUIPO',
    'DNI_FECHA_VALIDEZ',
    'DNI_NUM_SOPORTE',
  ];
  const faltan = requeridos.filter((k) => !process.env[k]);
  if (faltan.length) {
    console.error('Faltan estos datos en .env:', faltan.join(', '));
    process.exit(1);
  }

  console.log('Pidiendo captcha y enviándolo a Telegram, responde allí con el código...');
  const { html } = await login();

  fs.writeFileSync('debug_after_login.html', html);
  console.log('Guardado debug_after_login.html (' + html.length + ' bytes)');

  const pareceError = /codSeguridad incorrecto|dato.+incorrecto|error/i.test(html) && !/Provincia|Oficina|trámite/i.test(html);
  await sendMessage(
    pareceError
      ? '⚠️ El login parece haber fallado (revisa debug_after_login.html). Puede que el captcha estuviera mal o algún dato del DNI no coincida.'
      : '✅ Login hecho. Revisa debug_after_login.html para ver la siguiente pantalla.'
  );
})().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
