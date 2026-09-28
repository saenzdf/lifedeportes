#!/usr/bin/env node
/**
 * Integración real: ejecuta el guard con fetch REAL contra la Decisions API de
 * Jev y muestra qué decide para fixtures representativos (mode=shadow, no
 * cambia el routing).
 *
 * Uso:
 *   cd projects/lifedeportes && set -a; source .env; set +a
 *   OPENROUTER_API_KEY=... env -u PYTHONPATH node kapso/scripts/test_jev_guard_live.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "functions", "route_customer_burst_resume.js");
const source = fs.readFileSync(SRC, "utf8");

const KEY = String(process.env.OPENROUTER_API_KEY || "").trim();
if (!KEY) {
  console.error("Falta OPENROUTER_API_KEY en el entorno.");
  process.exit(2);
}

const T = (body) => ({ direction: "inbound", message_type: "text", content: body });
const A = (transcript) => ({ direction: "inbound", message_type: "audio", transcript });

const CASES = [
  { name: "lead real (texto)", messages: [T("Hola, quiero cotizar uniformes de futbol para mi equipo, somos 14")] },
  { name: "flood de audio ruido", messages: [A("[silence]"), A("musica background noise")] },
  { name: "audio corto con 'uniformes'", messages: [A("uniformes ya"), A("ya uniformes")] },
  { name: "prefill Meta Ads", messages: [T("Hola, quiero cotizar uniformes de")] },
  { name: "saludo solo", messages: [T("hola")] },
  { name: "sticker flood", messages: [{ direction: "inbound", message_type: "sticker" }, { direction: "inbound", message_type: "sticker" }, { direction: "inbound", message_type: "sticker" }, { direction: "inbound", message_type: "sticker" }] },
  { name: "texto con tamaño sin keyword", messages: [T("hola, necesitamos 12 para el grupo de danza del barrio")] },
  { name: "insulto", messages: [T("malparido dejen de escribir")] },
];

function makeSandbox() {
  const sandbox = {};
  sandbox.console = console;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.AbortController = AbortController;
  sandbox.Intl = Intl;
  sandbox.Date = Date;
  sandbox.JSON = JSON;
  sandbox.Promise = Promise;
  sandbox.fetch = (...args) => fetch(...args); // fetch REAL de Node
  sandbox.Response = Response;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: SRC });
  return sandbox;
}

function classify(payload) {
  const sp = payload.vars?.spam_profile;
  if (sp && sp.is_spam) return "spam";
  if (sp && sp.ads_prefill_only) return "prefill";
  return "lead";
}

(async () => {
  let totalCost = 0;
  console.log("heurística × Jev (mode=shadow, routing sin cambios)\n");
  console.log("fixture".padEnd(36), "heur".padEnd(9), "jev".padEnd(17), "conf".padEnd(6), "agr", " ms   cost");
  console.log("-".repeat(96));

  for (const c of CASES) {
    const sb = makeSandbox();
    const env = { LIFE_JEV_MODE: "shadow", OPENROUTER_API_KEY: KEY };
    const body = {
      available_edges: ["user_input", "ignore", "timeout", "end", "ads_greet"],
      execution_context: { vars: {}, context: { phone_number: "573001112233" } },
      whatsapp_context: { conversation: { phone_number: "573001112233" }, messages: c.messages },
      last_resume_reason: "timeout",
    };
    const payload = JSON.parse(
      await (await sb.handler({ json: async () => body }, env)).text()
    );
    const h = classify(payload);
    const j = payload.vars?.jev_shadow || {};
    totalCost += Number(j.cost_usd || 0);
    console.log(
      c.name.padEnd(36),
      h.padEnd(9),
      String(j.decision ?? `ERR:${j.reason}`).padEnd(17),
      String(j.confidence ?? "-").padEnd(6),
      String(j.agreement),
      ` ${String(j.latency_ms ?? "-").padStart(5)}  $${j.cost_usd ?? "-"}`
    );
  }

  console.log("-".repeat(96));
  console.log(`costo total del barrido: $${totalCost.toFixed(6)}`);
})();