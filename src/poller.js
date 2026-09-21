'use strict';

const { fetchResuelto } = require('./navegacion');
const { parseCalendario } = require('./parser-calendario');
const { cumpleReglas, rankScore, diaSemana } = require('./rules');
const { OFICINAS } = require('./oficinas');

const BASE = 'https://www.citapreviadnie.es/citaPreviaDni/';
const MAX_DIAS_EXTRA_POR_OFICINA = 4; // + el día que ya sale "gratis" al entrar
const PAUSA_ENTRE_PETICIONES_MS = 5000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fechaAISO(ddmmyyyy) {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
}

/**
 * Elige qué días "extra" merece la pena consultar (aparte del que ya sale
 * gratis al entrar), sin desperdiciar el cupo en días que las reglas van a
 * rechazar seguro. En Albacete (que ahora solo vale en lunes/viernes) eso
 * significa priorizar esos días de la semana aunque no sean los más
 * próximos cronológicamente; en el resto de sitios (cualquier día vale)
 * simplemente coge los más próximos.
 */
function elegirDiasExtra(lugar, dias) {
  if (lugar.toLowerCase() === 'albacete') {
    const relevantes = dias.filter((d) => {
      const dow = diaSemana(fechaAISO(d.fecha));
      return dow === 1 || dow === 5; // lunes o viernes
    });
    return relevantes.slice(0, MAX_DIAS_EXTRA_POR_OFICINA);
  }
  return dias.slice(0, MAX_DIAS_EXTRA_POR_OFICINA);
}

// La sesión ha caducado si en vez del calendario nos devuelve el formulario de login.
function sesionCaducada(html) {
  return /id="Autentificar"/.test(html);
}

/**
 * Evalúa un bloque {diaActual, horas} de parseCalendario contra las reglas
 * y devuelve los huecos válidos encontrados (puede haber varios por día).
 */
function evaluarHoras(lugar, horas) {
  const validos = [];
  for (const h of horas) {
    const fechaISO = fechaAISO(h.fecha);
    const { ok } = cumpleReglas(lugar, fechaISO, h.hora);
    if (ok) {
      validos.push({
        lugar,
        fecha: h.fecha,
        fechaISO,
        hora: h.hora,
        score: rankScore(lugar, fechaISO, h.hora),
      });
    }
  }
  return validos;
}

/**
 * Revisa una oficina: entra a su calendario, mira el día que sale por
 * defecto y hasta MAX_DIAS_EXTRA_POR_OFICINA días más (los más próximos),
 * evaluando las horas de cada uno contra las reglas. Pausa entre peticiones
 * para no forzar el sitio. Devuelve { encontrados, sesionCaducada }.
 */
async function revisarOficina(fetchS, oficina) {
  const url = `${BASE}ObtenerFechaCitaEspera.action?op=obMeses&equipo=${oficina.equipo}&nombre=${encodeURIComponent(oficina.nombre)}&seleccion=hora&espera=1`;
  const { html } = await fetchResuelto(fetchS, url);

  if (sesionCaducada(html)) return { encontrados: [], sesionCaducada: true };

  const cal = parseCalendario(html);
  const encontrados = [];

  if (cal.diaActual && cal.horas.length) {
    encontrados.push(...evaluarHoras(oficina.lugar, cal.horas));
  }

  const candidatos = cal.dias.filter((d) => !cal.diaActual || d.fecha !== cal.diaActual.fecha);
  const diasExtra = elegirDiasExtra(oficina.lugar, candidatos);

  for (const dia of diasExtra) {
    await sleep(PAUSA_ENTRE_PETICIONES_MS);
    const diaUrl = new URL(dia.href, url).toString();
    const { html: htmlDia } = await fetchResuelto(fetchS, diaUrl);
    if (sesionCaducada(htmlDia)) return { encontrados, sesionCaducada: true };

    const calDia = parseCalendario(htmlDia);
    if (calDia.horas.length) {
      encontrados.push(...evaluarHoras(oficina.lugar, calDia.horas));
    }
  }

  return { encontrados, sesionCaducada: false };
}

/**
 * Recorre todas las oficinas configuradas (en orden de prioridad) y junta
 * los huecos válidos. Para en el momento en que detecta la sesión caducada,
 * devolviendo lo encontrado hasta ese punto.
 */
async function cicloCompleto(fetchS) {
  await fetchS(`${BASE}InicioTramite.action?idDocumento=D`).then((r) => r.text());

  const todos = [];
  for (const oficina of OFICINAS) {
    await sleep(PAUSA_ENTRE_PETICIONES_MS);
    const { encontrados, sesionCaducada } = await revisarOficina(fetchS, oficina);
    todos.push(...encontrados);
    if (sesionCaducada) return { huecos: ordenar(todos), sesionCaducada: true };
  }
  return { huecos: ordenar(todos), sesionCaducada: false };
}

function ordenar(huecos) {
  return huecos.slice().sort((a, b) => a.score - b.score);
}

module.exports = { revisarOficina, cicloCompleto, evaluarHoras };
