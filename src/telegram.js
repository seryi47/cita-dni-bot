'use strict';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TOKEN || !CHAT_ID) {
  throw new Error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en .env');
}

const API = `https://api.telegram.org/bot${TOKEN}`;

async function sendMessage(text) {
  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error('Telegram sendMessage error: ' + JSON.stringify(data));
  return data;
}

async function sendPhoto(buffer, caption) {
  const form = new FormData();
  form.append('chat_id', CHAT_ID);
  if (caption) form.append('caption', caption);
  form.append('photo', new Blob([buffer], { type: 'image/jpeg' }), 'captcha.jpg');

  const res = await fetch(`${API}/sendPhoto`, { method: 'POST', body: form });
  const data = await res.json();
  if (!data.ok) throw new Error('Telegram sendPhoto error: ' + JSON.stringify(data));
  return data;
}

/**
 * Espera un mensaje de texto nuevo del usuario (para recibir la respuesta al captcha).
 * Usa long-polling simple sobre getUpdates. Ignora mensajes anteriores a "afterUpdateId".
 */
async function waitForReply({ timeoutMs = 5 * 60 * 1000, afterUpdateId = 0 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let offset = afterUpdateId + 1;

  while (Date.now() < deadline) {
    const res = await fetch(`${API}/getUpdates?offset=${offset}&timeout=25`);
    const data = await res.json();
    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (msg && String(msg.chat.id) === String(CHAT_ID) && msg.text) {
          return { text: msg.text.trim(), updateId: update.update_id };
        }
      }
    }
  }
  throw new Error('Timeout esperando respuesta por Telegram');
}

async function getLastUpdateId() {
  const res = await fetch(`${API}/getUpdates?offset=-1`);
  const data = await res.json();
  if (data.ok && data.result.length > 0) {
    return data.result[data.result.length - 1].update_id;
  }
  return 0;
}

module.exports = { sendMessage, sendPhoto, waitForReply, getLastUpdateId };
