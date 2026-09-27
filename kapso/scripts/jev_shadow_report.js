#!/usr/bin/env node
/**
 * Reporte de shadow Jev para el guard de cliente.
 *
 * Lee las ejecuciones recientes del workflow, extrae `vars.jev_shadow` (guard)
 * y `vars.spam_profile`, y construye la matriz de confusión heurística × Jev
 * para decidir si Jev puede pasar a modo `on`.
 *
 * Uso:
 *   cd projects/lifedeportes && set -a; source .env; set +a
 *   env -u PYTHONPATH node kapso/scripts/jev_shadow_report.js [--limit 300] [--days 2]
 */
const WF = "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6";

const argv = process.argv.slice(2);
function flag(name, dflt) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
}
const LIMIT = Number(flag("limit", 300));
const DAYS = Number(flag("days", 2));

const BASE = String(process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
const KEY = String(process.env.KAPSO_API_KEY || "").trim();
if (!KEY) {
  console.error("Falta KAPSO_API_KEY en el entorno.");
  process.exit(2);
}

async function kapso(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { "X-API-Key": KEY, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

function classOf(spamProfile) {
  if (!spamProfile) return "lead";
  if (spamProfile.is_spam) return "spam_or_noise";
  if (spamProfile.ads_prefill_only) return "ads_prefill_only";
  return "sales_lead";
}

(async () => {
  const cutoff = Date.now() - DAYS * 24 * 3600 * 1000;
  const list = await kapso(`/platform/v1/workflows/${WF}/executions?limit=${LIMIT}`);
  const execs = list?.data || list?.workflow_executions || [];

  const rows = [];
  for (const e of execs) {
    const id = e.id || e.workflow_execution_id;
    const when = Date.parse(e.created_at || e.started_at || 0);
    if (when && when < cutoff) continue;
    let detail;
    try {
      detail = await kapso(`/platform/v1/workflow_executions/${id}`);
    } catch {
      continue;
    }
    const vars = detail?.data?.execution_context?.vars || {};
    const shadow = vars.jev_shadow;
    if (!shadow || shadow.enabled !== true) continue;
    rows.push({
      id,
      when: new Date(when || Date.now()).toISOString(),
      heuristic: shadow.heuristic,
      jev: shadow.decision,
      confidence: shadow.confidence,
      agreement: shadow.agreement,
      applied: shadow.applied,
      ok: shadow.ok,
      reason: shadow.reason,
      ms: shadow.latency_ms,
      cost: Number(shadow.cost_usd || 0),
      spam_profile: classOf(vars.spam_profile),
    });
  }

  if (rows.length === 0) {
    console.log(`Sin muestras de shadow en los últimos ${DAYS} día(s) (¿ya hay tráfico con LIFE_JEV_MODE=shadow?).`);
    return;
  }

  const classes = ["sales_lead", "ads_prefill_only", "spam_or_noise"];
  const matrix = {};
  for (const c of classes) {
    matrix[c] = Object.fromEntries(classes.map((k) => [k, 0]));
    matrix[c].err = 0;
  }
  for (const r of rows) {
    const h = r.heuristic;
    const j = r.jev;
    if (matrix[h] && j && matrix[h][j] !== undefined) matrix[h][j]++;
    else if (matrix[h]) matrix[h].err++;
  }

  const total = rows.length;
  const ok = rows.filter((r) => r.ok).length;
  const withDecision = rows.filter((r) => r.jev !== null).length;
  const agreed = rows.filter((r) => r.agreement === true).length;
  const rescued = rows.filter((r) => r.applied === true).length;
  const latencies = rows.map((r) => r.ms).filter((n) => typeof n === "number").sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? "-";
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? "-";
  const cost = rows.reduce((a, r) => a + r.cost, 0);

  console.log(`\nShadow Jev — guard de cliente (últimos ${DAYS} días)`);
  console.log(`muestras=${total}  jev_ok=${ok} (${((ok / total) * 100).toFixed(1)}%)  con_decisión=${withDecision}  acuerdo=${agreed} (${((agreed / total) * 100).toFixed(1)}%)`);
  console.log(`latencia p50=${p50}ms p95=${p95}ms   costo acumulado=$${cost.toFixed(5)}`);
  if (rescued) console.log(`rescates aplicados=${rescued}`);
  const errs = rows.filter((r) => !r.ok);
  if (errs.length) {
    const byReason = {};
    for (const r of errs) byReason[r.reason || "?"] = (byReason[r.reason || "?"] || 0) + 1;
    console.log(`fallos por causa: ${JSON.stringify(byReason)}`);
  }

  console.log(`\nMatriz heurística (filas) × Jev (columnas)`);
  console.log("".padEnd(17) + classes.map((c) => c.padStart(17)).join("") + "        err");
  for (const c of classes) {
    console.log(
      c.padEnd(17) + classes.map((k) => String(matrix[c][k]).padStart(17)).join("") + String(matrix[c].err).padStart(11)
    );
  }

  // Casos donde Jev diría "lead" y la heurística dice "spam" → candidatos a rescate.
  const candidates = rows.filter((r) => r.heuristic === "spam_or_noise" && r.jev === "sales_lead");
  console.log(`\nCandidatos a rescate (heur=spam_or_noise, jev=sales_lead): ${candidates.length}`);
  for (const r of candidates.slice(0, 15)) {
    console.log(`  ${r.when}  conf=${r.confidence}  (${r.id})`);
  }
  const threshold = 0.7;
  const above = candidates.filter((r) => (r.confidence ?? 0) >= threshold).length;
  console.log(`  de esos, con conf ≥ ${threshold} (dispararían en modo on): ${above}`);

  console.log(`\nCriterio de avance sugerido: acuerdo ≥ 95% en spam_or_noise y ≥ 98% en sales_lead.`);
})();