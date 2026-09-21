'use strict';
require('dotenv').config();
const fs = require('fs');
const { execFileSync } = require('child_process');
const { login } = require('./src/login');
const { cicloCompleto } = require('./src/poller');
const { sendMessage, getLastUpdateId, waitForReply } = require('./src/telegram');
const { formatearAviso } = require('./src/formato');

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '', 10) || 10 * 60 * 1000; // 10 min por defecto
const AVISADOS_PATH = 'avisados.json';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cargarAvisados() {
  try {
    return new Set(JSON.parse(fs.readFileSync(AVISADOS_PATH, 'utf8')));
  } catch {
    return new Set();
  }
}

function guardarAvisados(set) {
  fs.writeFileSync(AVISADOS_PATH, JSON.stringify([...set]));
}

function claveHueco(h) {
  return `${h.lugar}|${h.fecha}|${h.hora}`;
}

// En GitHub Actions cada relevo del job arranca de cero: sin commitear
// avisados.json de vuelta al repo, el bot repetiría el mismo aviso cada
// pocas horas. No lleva datos personales (solo lugar/fecha/hora), así que
// es seguro guardarlo en un repo público.
function commitearAvisadosSiProcede() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GIT_COMMIT_BACK !== '1') return;
  try {
    const run = (...args) => execFileSync('git', args, { encoding: 'utf8' });
    run('config', 'user.email', 'bot@users.noreply.github.com');
    run('config', 'user.name', 'Cita DNI Bot');
    run('add', '-f', AVISADOS_PATH);
    try {
      run('commit', '-m', 'chore: avisados.json actualizado');
    } catch {
      return; // sin cambios que commitear
    }
    const branch = process.env.GITHUB_REF_NAME || 'main';
    run('fetch', 'origin', branch);
    try {
      run('rebase', 'origin/' + branch);
    } catch {
      execFileSync('git', ['rebase', '--abort']);
      console.log('[poll]   [git] conflicto al rebasar; no subo avisados.json (se reintenta el próximo ciclo)');
      return;
    }
    run('push', 'origin', 'HEAD:' + branch);
  } catch (e) {
    console.log('[poll]   [git] no se pudo commitear avisados.json:', e.message);
  }
}

async function cicloConReintentoLogin(fetchS) {
  const r = await cicloCompleto(fetchS);
  if (!r.sesionCaducada) return { ...r, fetchS };

  console.log('[poll] sesión caducada, volviendo a hacer login...');
  const { fetch: nuevoFetch } = await login();
  const r2 = await cicloCompleto(nuevoFetch);
  return { ...r2, fetchS: nuevoFetch };
}

/**
 * Un ciclo completo: revisa todas las oficinas y avisa por Telegram de los
 * huecos que no se hubieran avisado ya. Devuelve el fetch (por si tocó
 * volver a hacer login) y si hubo avisos nuevos.
 */
async function unCiclo(fetchS, avisados) {
  console.log('[poll] Revisando oficinas...');
  const resultado = await cicloConReintentoLogin(fetchS);

  const nuevos = resultado.huecos.filter((h) => !avisados.has(claveHueco(h)));
  console.log(`[poll] Huecos válidos: ${resultado.huecos.length} (${nuevos.length} nuevos)`);

  if (nuevos.length) {
    await sendMessage(formatearAviso(nuevos));
    for (const h of nuevos) avisados.add(claveHueco(h));
    guardarAvisados(avisados);
    commitearAvisadosSiProcede();
  }

  return { fetchS: resultado.fetchS, huboAvisos: nuevos.length > 0 };
}

/**
 * Modo bucle largo (GitHub Actions): corre durante como mucho
 * MAX_RUNTIME_SECONDS, comprobando cada POLL_INTERVAL_MS, atendiendo el
 * comando /parar por Telegram, y termina limpio para que el siguiente
 * relevo del cron continúe justo donde se quedó.
 */
async function modoBucle() {
  const maxRuntimeMs = (parseInt(process.env.MAX_RUNTIME_SECONDS || '', 10) || 20000) * 1000;
  const inicio = Date.now();

  console.log('[poll] Modo BUCLE (nube). Intervalo:', Math.round(POLL_INTERVAL_MS / 1000), 's, máx', Math.round(maxRuntimeMs / 1000), 's');

  let { fetch: fetchS } = await login();
  const avisados = cargarAvisados();
  let ultimoOffset = await getLastUpdateId();
  let ultimaComprobacion = 0;

  while (Date.now() - inicio < maxRuntimeMs) {
    if (Date.now() - ultimaComprobacion >= POLL_INTERVAL_MS) {
      try {
        const r = await unCiclo(fetchS, avisados);
        fetchS = r.fetchS;
      } catch (e) {
        console.error('[poll] ERROR en el ciclo:', e.message);
      }
      ultimaComprobacion = Date.now();
    }

    try {
      const { text, updateId } = await waitForReply({ afterUpdateId: ultimoOffset, timeoutMs: 20000 });
      ultimoOffset = updateId;
      if (/^\/parar\b/i.test(text)) {
        console.log('[poll] /parar recibido, apagando el workflow.');
        await sendMessage('🛑 Bot detenido. Para reactivarlo, vuelve a lanzar el workflow "Vigilar citas" en GitHub Actions.');
        await desactivarWorkflow();
        return;
      }
    } catch {
      // timeout normal esperando mensajes, seguimos
    }
  }
  console.log('[poll] Fin del bucle (relevo al siguiente run).');
}

async function desactivarWorkflow() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const workflowFile = process.env.GITHUB_WORKFLOW_REF?.split('@')[0]?.split('/').pop();
  if (!repo || !token || !workflowFile) return;
  try {
    await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/disable`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
  } catch (e) {
    console.log('[poll] no se pudo desactivar el workflow:', e.message);
  }
}

/** Modo local: bucle infinito de toda la vida, pensado para dejarlo con `npm run poll`. */
async function modoLocal() {
  console.log('[poll] Arrancando (modo local). Intervalo entre ciclos:', Math.round(POLL_INTERVAL_MS / 1000), 's');
  await sendMessage('🤖 Bot de cita DNI arrancado. Vigilando Albacete (lunes/viernes) y la zona de Alicante (cualquier día desde las 13:00).');

  let { fetch: fetchS } = await login();
  const avisados = cargarAvisados();

  for (;;) {
    try {
      const r = await unCiclo(fetchS, avisados);
      fetchS = r.fetchS;
    } catch (e) {
      console.error('[poll] ERROR en el ciclo:', e.message);
      try {
        await sendMessage('⚠️ El bot ha tenido un error revisando citas: ' + e.message);
      } catch {
        // si hasta Telegram falla, no hay nada más que hacer que esperar al siguiente ciclo
      }
    }
    console.log(`[poll] Esperando ${Math.round(POLL_INTERVAL_MS / 1000)}s hasta el próximo ciclo...`);
    await sleep(POLL_INTERVAL_MS);
  }
}

const main = process.argv.includes('--loop') ? modoBucle : modoLocal;

main().catch((e) => {
  console.error('[poll] ERROR fatal:', e);
  process.exit(1);
});
