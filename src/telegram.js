'use strict';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// Admite uno o varios chat_id separados por coma (ej. "5239651695,-5217406960")
// para mandar avisos y recibir respuestas tanto del chat privado como de un grupo.
const CHAT_IDS = (process.env.TELEGRAM_CHAT_ID || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!TOKEN || CHAT_IDS.length === 0) {
  throw new Error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en .env');
}

const API = `https://api.telegram.org/bot${TOKEN}`;

async function sendMessage(text) {
  const resultados = await Promise.all(
    CHAT_IDS.map(async (chatId) => {
      const res = await fetch(`${API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
      const data = await res.json();
      if (!data.ok) console.error(`Telegram sendMessage error (chat ${chatId}):`, JSON.stringify(data));
      return data;
    })
  );
  if (resultados.every((d) => !d.ok)) throw new Error('Telegram sendMessage falló en todos los chats');
  return resultados;
}

async function sendPhoto(buffer, caption) {
  const resultados = await Promise.all(
    CHAT_IDS.map(async (chatId) => {
      const form = new FormData();
      form.append('chat_id', chatId);
      if (caption) form.append('caption', caption);
      form.append('photo', new Blob([buffer], { type: 'image/jpeg' }), 'captcha.jpg');

      const res = await fetch(`${API}/sendPhoto`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.ok) console.error(`Telegram sendPhoto error (chat ${chatId}):`, JSON.stringify(data));
      return data;
    })
  );
  if (resultados.every((d) => !d.ok)) throw new Error('Telegram sendPhoto falló en todos los chats');
  return resultados;
}

/**
 * Espera un mensaje de texto nuevo del usuario (para recibir la respuesta al captcha
 * o el comando /parar). Acepta el mensaje desde CUALQUIERA de los CHAT_IDS configurados
 * (chat privado o grupo). Usa long-polling simple sobre getUpdates.
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
        if (msg && CHAT_IDS.includes(String(msg.chat.id)) && msg.text) {
          return { text: msg.text.trim(), updateId: update.update_id, chatId: String(msg.chat.id) };
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
