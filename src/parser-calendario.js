'use strict';

function limpiar(url) {
  return url.replace(/&amp;/g, '&');
}

/**
 * Parsea una página de calendario (la que sale tras ObtenerFechaCitaEspera
 * o tras pinchar un día/mes): devuelve los meses navegables, los días con
 * hueco del mes mostrado, y las horas del día actualmente mostrado (si hay).
 */
function parseCalendario(html) {
  const meses = [];
  const reMes = /href="(ObtenerFechaCita\.action\?numMes=\d+&amp;nomMes=[^&]+&amp;seleccion=dia)"\s+title="([^"]+)"/g;
  let m;
  while ((m = reMes.exec(html))) {
    meses.push({ nombre: m[2], href: limpiar(m[1]) });
  }

  const dias = [];
  const reDia = /href="(ObtenerFechaCita\.action\?dia=(\d{2}\/\d{2}\/\d{4})&amp;numDia=\d+&amp;seleccion=hora)"\s+title="[^"]*"/g;
  while ((m = reDia.exec(html))) {
    dias.push({ fecha: m[2], href: limpiar(m[1]) });
  }

  let diaActual = null;
  const reCabeceraHoras = /Horas con citas disponibles del\s*<span class="marron">(\d{2}\/\d{2}\/\d{4})\s*\(([^)]+)\)<\/span>/;
  const mCab = html.match(reCabeceraHoras);
  if (mCab) diaActual = { fecha: mCab[1], diaSemana: mCab[2] };

  const horas = [];
  const reHora = /href="(ConfigurarCita_solicitar\.action\?Dia=(\d{2}\/\d{2}\/\d{4})&amp;Hora=(\d{2}:\d{2}))"\s+title="[^"]*"/g;
  while ((m = reHora.exec(html))) {
    horas.push({ fecha: m[2], hora: m[3], href: limpiar(m[1]) });
  }

  return { meses, dias, diaActual, horas };
}

module.exports = { parseCalendario };
