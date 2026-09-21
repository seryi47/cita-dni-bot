'use strict';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// fechaISO: 'YYYY-MM-DD' -> "Martes 6 de octubre"
function fechaBonita(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const dow = new Date(fechaISO + 'T12:00:00').getDay();
  return `${DIAS[dow]} ${d} de ${MESES[m - 1]}`;
}

/**
 * Formatea el aviso de Telegram: agrupado por lugar, con fechas legibles,
 * ordenado como vengan (ya deberían venir ordenados por rankScore).
 */
function formatearAviso(huecos) {
  const porLugar = new Map();
  for (const h of huecos) {
    if (!porLugar.has(h.lugar)) porLugar.set(h.lugar, []);
    porLugar.get(h.lugar).push(h);
  }

  const bloques = [];
  for (const [lugar, items] of porLugar) {
    const lineas = items.map((h) => `   •  ${fechaBonita(h.fechaISO)} — <b>${h.hora}</b>`);
    bloques.push(`📍 <b>${lugar}</b>\n${lineas.join('\n')}`);
  }

  const total = huecos.length;
  const cabecera = total === 1
    ? '🎉 <b>Hueco nuevo de cita DNI</b>'
    : `🎉 <b>${total} huecos nuevos de cita DNI</b>`;

  return [
    cabecera,
    '',
    bloques.join('\n\n'),
    '',
    '👉 Entra ya a citapreviadnie.es a reservarlo — puede desaparecer en cualquier momento.',
  ].join('\n');
}

module.exports = { fechaBonita, formatearAviso };
