'use strict';
require('dotenv').config();
const { login } = require('./src/login');
const { cicloCompleto } = require('./src/poller');

(async () => {
  console.log('Login...');
  const { fetch: fetchS } = await login();

  console.log('Revisando todas las oficinas (esto tarda un rato, hay pausas entre peticiones)...');
  const { huecos, sesionCaducada } = await cicloCompleto(fetchS);

  console.log('sesionCaducada:', sesionCaducada);
  console.log('Huecos válidos encontrados:', huecos.length);
  console.log(JSON.stringify(huecos, null, 2));
})().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
