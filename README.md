# Cita DNI Bot

Bot que vigila huecos de cita previa para renovación del DNI en citapreviadnie.es
y avisa por Telegram (@dni_renovacion_bot) cuando aparece un hueco que cumple las reglas.

## Estado actual — código completo, pendiente de la prueba en vivo final

- ✅ Reglas de lugar/fecha/hora (`src/rules.js`).
- ✅ Telegram (avisos + relay del captcha de respaldo) (`src/telegram.js`).
- ✅ Login con captcha resuelto por OCR propio automáticamente la mayoría de
  las veces, con Telegram como respaldo (`src/login.js`).
- ✅ Oficinas reales de Albacete + provincia de Alicante (`src/oficinas.js`).
- ✅ Navegación de la pantalla "Por favor espere" (`src/navegacion.js`).
- ✅ Parser del calendario de días/horas disponibles (`src/parser-calendario.js`)
  — probado contra una página real capturada.
- ✅ Poller completo: recorre oficinas, evalúa huecos con las reglas, los
  ordena por preferencia (`src/poller.js`).
- ✅ `poll.js` — bucle final: login, revisa, avisa por Telegram solo de los
  huecos NUEVOS (`avisados.json` evita repetir el mismo aviso), reintenta
  login si la sesión caduca, espera y repite.
- ⏳ **Bloqueados temporalmente por el sitio** (error de framing HTTP/2) tras
  las pruebas de hoy — se levanta solo pasado un rato. En cuanto se levante,
  toca una única prueba en vivo (`npm run poll-once`) para confirmar que el
  parser del calendario funciona igual en un día cualquiera (solo lo hemos
  podido probar contra una página ya guardada, no en directo).

## Cómo funciona el reconocimiento del captcha

`src/captcha-ocr.js` implementa un clasificador propio (no usa Tesseract ni
ningún servicio de pago):

1. Resta un modelo de fondo (el patrón de cestería de jcaptcha es fijo) para
   quedarse solo con el texto — `bg_model.json`, reconstruido por fase a
   partir de ~100 capturas reales en `build-bg-model-v2.js`.
2. Segmenta los 4 caracteres por componentes conexas.
3. Compara cada uno contra una biblioteca de referencia (`char_reference.json`,
   ~1400 bitmaps: ~100 letras reales leídas a mano × 5 rotaciones) usando
   vecino-más-cercano con una distancia "blanda" (tolera 1px de desajuste).
4. **Aprende solo**: cada login que funciona de verdad (con OCR o con tu
   ayuda por Telegram) añade esos caracteres confirmados a la biblioteca.

Precisión medida por validación cruzada (leave-one-out): **93% por carácter**,
lo que da ~75% de acertar el captcha completo a la primera intentona, y con
los 3 intentos automáticos + aprendizaje continuo, la inmensa mayoría de
logins ya no piden ayuda por Telegram.

Herramientas para seguir mejorando la biblioteca (todas offline salvo
`fetch-more-samples.js`):
- `fetch-more-samples.js N` — descarga N captchas nuevos sin hacer login (pausados 5s entre cada uno).
- `labels.js` — transcripción manual de cada muestra guardada en `bg_samples/` y `bg_samples2/`.
- `build-bg-model-v2.js` — reconstruye `bg_model.json` a partir de todas las muestras.
- `build-reference.js` — reconstruye `char_reference.json` a partir de `labels.js`.
- `validate.js` (`npm run validate-ocr`) — precisión por leave-one-out sin hacer trampa con las rotaciones sintéticas.
- `contact-sheet.js` — hoja de contacto visual de todos los caracteres etiquetados, para auditar a ojo.

## Cómo usarlo

`.env` ya tiene el token/chat_id de Telegram y los 5 campos `DNI_...`
rellenados con los datos del DNI a renovar.

```
npm run debug-login   # prueba solo el login (rápido)
npm run poll-once     # login + un ciclo completo de revisión, imprime lo encontrado, y termina
npm run poll          # el bot de verdad: bucle infinito, avisa por Telegram, pensado para dejarlo corriendo
```

`npm run poll` no termina solo — déjalo en una terminal abierta (o con
`nohup npm run poll &`) mientras quieras que vigile. Por defecto revisa cada
10 minutos (`POLL_INTERVAL_MS` en `.env` para cambiarlo).

## Qué mira cada ciclo

Para cada oficina (Albacete, Torrevieja, Elche, Elda, Alicante capital, en
ese orden): entra a su calendario, mira el día que sale por defecto y hasta
3 días más próximos (con pausas de 5s entre peticiones), y evalúa las horas
de cada uno con `cumpleReglas()`. No navega a meses futuros más allá del
actual — para una renovación urgente (huecos en las próximas 2-3 semanas)
es suficiente; se puede ampliar más adelante si hiciera falta mirar más lejos.

## Notas de seguridad

- Tus datos de DNI se quedan en tu `.env` local, solo se envían a citapreviadnie.es (el sitio oficial).
- El bot de Telegram y el chat_id solo se usan para avisarte y, si hace falta, para que resuelvas el captcha.
- El sitio tiene protección anti-bot activa: las peticiones van siempre espaciadas (segundos, no ráfagas). Si se bloquea (error de framing HTTP/2, `HTTP 000` con curl), hay que parar y esperar — no reintentar en bucle.
