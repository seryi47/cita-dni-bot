'use strict';

// Orden de preferencia de lugares. El poller los recorre en este orden
// y si encuentra hueco válido en uno, no hace falta seguir a los de más abajo
// (aunque igualmente puede avisar de varios si aparecen).
const LUGARES_PRIORIDAD = [
  'Albacete',
  'Torrevieja',
  'Elche',
  'Elda',
  'Alicante', // capital: sin oficina propia Santa Pola/Gran Alacant/El Altet, esta es la más cercana real
  'Santa Pola',
  'Gran Alacant',
  'El Altet',
];

// Cualquier lugar que NO sea Albacete se trata como "zona Alicante" y usa
// la regla horaria de las 13:00 en adelante (Torrevieja, Elche, Elda, Santa
// Pola, Gran Alacant, El Altet, Alicante capital, o cualquier otra oficina
// cercana que aparezca y no esté en la lista explícita de arriba).

// Rango de fechas excluido, salvo la excepción de la tarde del 1 de octubre.
const EXCLUSION_INICIO = '2026-09-28';
const EXCLUSION_FIN = '2026-10-01';
const EXCEPCION_FECHA = '2026-10-01';
const EXCEPCION_HORA_MINIMA = '14:00'; // "por la tarde"

// Límite superior: no interesan citas más allá de esta fecha (inclusive).
const FECHA_LIMITE = '2026-10-07';

// Umbral general de "mediodía" para la preferencia blanda por defecto.
const MEDIODIA_MINUTOS = toMinutos('12:30');

function toMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// fecha: 'YYYY-MM-DD', hora: 'HH:MM' (24h)
function fechaExcluida(fechaISO, horaHHMM) {
  if (fechaISO < EXCLUSION_INICIO || fechaISO > EXCLUSION_FIN) return false;
  if (fechaISO === EXCEPCION_FECHA && toMinutos(horaHHMM) >= toMinutos(EXCEPCION_HORA_MINIMA)) {
    return false; // 1 de octubre por la tarde SÍ vale
  }
  return true; // dentro del rango excluido y no cumple la excepción
}

function diaSemana(fechaISO) {
  // 0 = domingo ... 6 = sábado
  return new Date(fechaISO + 'T12:00:00').getDay();
}

/**
 * Decide si un hueco (lugar, fecha, hora) cumple las reglas duras.
 * Devuelve { ok: boolean, motivo?: string }
 */
function cumpleReglas(lugar, fechaISO, horaHHMM) {
  if (fechaISO > FECHA_LIMITE) {
    return { ok: false, motivo: `después del límite (${FECHA_LIMITE})` };
  }

  if (fechaExcluida(fechaISO, horaHHMM)) {
    return { ok: false, motivo: 'dentro del rango excluido 28-sep a 1-oct (salvo tarde del 1-oct)' };
  }

  const minutos = toMinutos(horaHHMM);
  const dow = diaSemana(fechaISO); // 1=lunes, 5=viernes

  if (lugar.toLowerCase() === 'albacete') {
    if (dow === 5) { // viernes: de cara al mediodía en adelante
      if (minutos < toMinutos('12:00')) {
        return { ok: false, motivo: 'Albacete en viernes: solo desde las 12:00' };
      }
      return { ok: true };
    }
    if (dow === 1) { // lunes: cualquier hora, cuanto más temprano mejor (ver rankScore)
      return { ok: true };
    }
    // Albacete SOLO se considera en lunes y viernes; el resto de días (y findes) quedan
    // fuera de Albacete y solo se buscan en la zona de Alicante.
    return { ok: false, motivo: 'Albacete solo se busca en lunes y viernes' };
  }

  // Cualquier lugar que no sea Albacete (Alicante y alrededores): siempre desde las 13:00.
  if (minutos < toMinutos('13:00')) {
    return { ok: false, motivo: `${lugar}: solo se aceptan citas desde las 13:00` };
  }
  return { ok: true };
}

/**
 * Puntuación para ordenar varios huecos válidos por preferencia
 * (menor score = mejor). Solo afecta al orden, no filtra nada.
 */
function rankScore(lugar, fechaISO, horaHHMM) {
  const prioridadLugar = LUGARES_PRIORIDAD.findIndex(
    (l) => l.toLowerCase() === String(lugar).toLowerCase()
  );
  const pesoLugar = (prioridadLugar === -1 ? LUGARES_PRIORIDAD.length : prioridadLugar) * 100000;

  const dow = diaSemana(fechaISO);
  const minutos = toMinutos(horaHHMM);

  let pesoHora;
  if (lugar.toLowerCase() === 'albacete' && dow === 1) {
    // lunes en Albacete: cuanto más temprano, mejor
    pesoHora = minutos;
  } else {
    // resto: cuanto más cerca del mediodía, mejor
    pesoHora = Math.abs(minutos - MEDIODIA_MINUTOS);
  }

  return pesoLugar + pesoHora;
}

module.exports = {
  LUGARES_PRIORIDAD,
  cumpleReglas,
  rankScore,
  fechaExcluida,
  diaSemana,
};
