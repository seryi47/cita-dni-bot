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

function bloquesPorLugar(huecos) {
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
  return bloques.join('\n\n');
}

/**
 * Formatea el aviso de Telegram: agrupado por lugar, con fechas legibles,
 * ordenado como vengan (ya deberían venir ordenados por rankScore).
 */
function formatearAviso(huecos) {
  const total = huecos.length;
  const cabecera = total === 1
    ? '🎉 <b>Hueco nuevo de cita DNI</b>'
    : `🎉 <b>${total} huecos nuevos de cita DNI</b>`;

  return [
    cabecera,
    '',
    bloquesPorLugar(huecos),
    '',
    '👉 Entra ya a citapreviadnie.es a reservarlo — puede desaparecer en cualquier momento.',
  ].join('\n');
}

/**
 * Resumen periódico (cada N horas): TODOS los huecos válidos que hay ahora
 * mismo, no solo los nuevos. Deja claro que es un resumen, no una alerta.
 */
function formatearResumen(huecos) {
  if (huecos.length === 0) {
    return '📋 <b>Resumen de citas DNI</b>\n\nAhora mismo no hay ningún hueco disponible que cumpla tus reglas. Sigo vigilando cada 15 min.';
  }

  return [
    `📋 <b>Resumen de citas DNI</b> — ${huecos.length} hueco(s) disponible(s) ahora mismo`,
    '',
    bloquesPorLugar(huecos),
    '',
    '(Esto es un resumen periódico, no significa que sean nuevos — ya se avisó de ellos antes si procedía.)',
  ].join('\n');
}

module.exports = { fechaBonita, formatearAviso, formatearResumen };
