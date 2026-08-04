#!/usr/bin/env node
/**
 * Publica SOLO los system_prompt de agentes en Kapso:
 * 1. Descarga grafo vivo (preserva topología / edges de Diego)
 * 2. Embebe prompts desde kapso/prompts/*.md
 * 3. Sube con lock_version actual
 *
 * Uso: node kapso/scripts/publish_prompts_to_kapso.js
 * Requiere: KAPSO_API_BASE_URL, KAPSO_API_KEY (o auth del skill automate-whatsapp)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKFLOW_ID = '8995b14c-d852-4fb3-bceb-8a51a6ccc2c6';
const KAPSO_SCRIPTS = path.join(
  process.env.HOME || '',
  '.agents/skills/automate-whatsapp/scripts'
);
const base = path.join(__dirname, '..');
const livePath = path.join(base, 'workflow_lifedeportes_sales_inbound_v8_session.json');
const embedScript = path.join(__dirname, 'embed_prompts_v8.js');

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function extractGraph(json) {
  const j = typeof json === 'string' ? JSON.parse(json) : json;
  const def =
    j.data?.workflow?.definition ||
    j.data?.definition ||
    j.definition;
  if (def?.nodes) return def;
  if (j.nodes) return j;
  throw new Error('Could not find graph nodes in get-graph response');
}

function extractLock(json) {
  const j = typeof json === 'string' ? JSON.parse(json) : json;
  const lock =
    j.data?.workflow?.lock_version ??
    j.data?.lock_version ??
    j.lock_version;
  if (lock == null) throw new Error('Could not find lock_version in get-graph response');
  return lock;
}

function verifyVendedorPrompt(def) {
  const node = def.nodes.find((n) => n.id === 'agent_orquestador_1745500003000');
  const p = node?.data?.config?.system_prompt || '';
  const checks = {
    len: p.length,
    no_orquestador_ref: !/orquestador v4|catalogo embebido/i.test(p),
    has_engativa: /Engativá/.test(p),
    has_instagram: /instagram\.com\/lifedeportes/.test(p),
    has_facebook: /facebook\.com\/people\/Life-Soluciones-Deportivas/.test(p),
    has_extras: /Extras Frecuentes/.test(p),
    has_53: /5\.3/.test(p) && /Sudaderas en algodón lycrado/.test(p),
    has_fase1: /Fase 1: Recepción/.test(p),
  };
  return { ok: checks.len > 8000 && checks.no_orquestador_ref && checks.has_53, checks, preview: p.slice(0, 150) };
}

try {
  process.env.KAPSO_API_BASE_URL = process.env.KAPSO_API_BASE_URL || 'https://api.kapso.ai';

  console.log('1. Fetching live graph from Kapso...');
  const raw = run(`node "${KAPSO_SCRIPTS}/get-graph.js" ${WORKFLOW_ID}`);
  const lock = extractLock(raw);
  const def = extractGraph(raw);
  fs.writeFileSync(livePath, JSON.stringify(def, null, 2) + '\n');
  console.log(`   lock_version=${lock}, nodes=${def.nodes?.length}`);

  console.log('2. Embedding prompts from kapso/prompts/...');
  run(`node "${embedScript}"`);

  const merged = JSON.parse(fs.readFileSync(livePath, 'utf8'));
  const v = verifyVendedorPrompt(merged);
  console.log('   Vendedor verification:', v.checks);
  if (!v.ok) {
    console.error('ABORT: vendedor prompt failed verification');
    process.exit(1);
  }
  console.log(`   Preview: ${v.preview}...`);

  console.log('3. Validating graph...');
  run(`node "${KAPSO_SCRIPTS}/validate-graph.js" --definition-file "${livePath}"`);

  console.log(`4. Publishing (lock ${lock})...`);
  let out;
  try {
    out = run(
      `node "${KAPSO_SCRIPTS}/update-graph.js" ${WORKFLOW_ID} --expected-lock-version ${lock} --definition-file "${livePath}"`
    );
  } catch (e) {
    const msg = (e.stderr || e.stdout || '') + String(e.message);
    if (/lock/i.test(msg)) {
      console.log('   Lock conflict — refetching...');
      const raw2 = run(`node "${KAPSO_SCRIPTS}/get-graph.js" ${WORKFLOW_ID}`);
      const lock2 = extractLock(raw2);
      const def2 = extractGraph(raw2);
      fs.writeFileSync(livePath, JSON.stringify(def2, null, 2) + '\n');
      run(`node "${embedScript}"`);
      out = run(
        `node "${KAPSO_SCRIPTS}/update-graph.js" ${WORKFLOW_ID} --expected-lock-version ${lock2} --definition-file "${livePath}"`
      );
    } else {
      throw e;
    }
  }
  console.log(out);
  console.log('DONE. Refresh agent node in Kapso UI — vendedor prompt must show section 5 complete.');
} catch (err) {
  console.error(err.stderr || err.stdout || err.message);
  process.exit(1);
}
