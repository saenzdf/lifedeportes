#!/usr/bin/env node
/**
 * Dry-run local de la capa Jev en `route-customer-burst-resume`.
 *
 * Carga la function en un sandbox `node:vm` (mismo patrón que los otros tests
 * del repo), inyecta un `fetch` falso que simula la Decisions API de Jev, y
 * verifica que:
 *   1. mode=off      → comportamiento idéntico al actual (baseline).
 *   2. mode=shadow   → mismo next_edge + mismo spam_profile, pero escribe jev_shadow.
 *   3. mode=on       → Jev solo RESCATA leads; nunca convierte lead→spam.
 *   4. Jev caído / sin key → fallback determinista (baseline).
 *
 * Uso: node kapso/scripts/test_jev_guard_shadow.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "functions", "route_customer_burst_resume.js");
const source = fs.readFileSync(SRC, "utf8");

// ── Canned Jev answers por escenario ───────────────────────────────────────
const JEV_ANSWERS = {
  genuine_text: { lead_intent: { type: "choice", choice: "sales_lead", probabilities: { sales_lead: 0.94, ads_prefill_only: 0.02, spam_or_noise: 0.04 }, confidence: 0.9 }, is_real_speech: { type: "noul", noul: 0.98 }, is_insult: { type: "noul", noul: 0.01 } },
  audio_noise: { lead_intent: { type: "choice", choice: "spam_or_noise", probabilities: { sales_lead: 0.03, ads_prefill_only: 0.05, spam_or_noise: 0.92 }, confidence: 0.87 }, is_real_speech: { type: "noul", noul: 0.04 }, is_insult: { type: "noul", noul: 0.02 } },
  audio_rescue: { lead_intent: { type: "choice", choice: "sales_lead", probabilities: { sales_lead: 0.81, ads_prefill_only: 0.1, spam_or_noise: 0.09 }, confidence: 0.72 }, is_real_speech: { type: "noul", noul: 0.9 }, is_insult: { type: "noul", noul: 0.01 } },
  prefill: { lead_intent: { type: "choice", choice: "ads_prefill_only", probabilities: { sales_lead: 0.08, ads_prefill_only: 0.88, spam_or_noise: 0.04 }, confidence: 0.84 }, is_real_speech: { type: "noul", noul: 0.02 }, is_insult: { type: "noul", noul: 0.01 } },
};

function makeSandbox({ answers, throwOnFetch = false, noKey = false }) {
  const sandbox = {};
  sandbox.console = console;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.AbortController = AbortController;
  sandbox.Intl = Intl;
  sandbox.Date = Date;
  sandbox.JSON = JSON;
  sandbox.Promise = Promise;

  class FakeResponse {
    constructor(body, init) {
      this._body = body;
      this.status = init?.status ?? 200;
      this.ok = this.status >= 200 && this.status < 300;
      this.headers = init?.headers || {};
    }
    async json() {
      return JSON.parse(this._body);
    }
    async text() {
      return this._body;
    }
  }
  sandbox.Response = FakeResponse;

  sandbox.fetch = async (url) => {
    if (throwOnFetch) throw new Error("network down");
    return new FakeResponse(
      JSON.stringify({ model: "typesafe/jev-1.13-20260917", answers, usage: { cost: 0.00002 } }),
      { status: 200 }
    );
  };

  const env = { LIFE_JEV_MODE: "off" };
  sandbox.__env = env;
  sandbox.__noKey = noKey;

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: SRC });
  return { handler: sandbox.handler, env, FakeResponse };
}

// ── Fixtures ───────────────────────────────────────────────────────────────
const T = (body) => ({ direction: "inbound", message_type: "text", content: body });
const A = (transcript) => ({ direction: "inbound", message_type: "audio", transcript });

const FIXTURES = [
  {
    name: "lead por texto real",
    answers: "genuine_text",
    messages: [T("Hola, quiero cotizar uniformes de futbol para mi equipo, somos 14")],
    expectBaseline: "lead",
  },
  {
    name: "flood de audio ruido",
    answers: "audio_noise",
    messages: [A("[silence]"), A("musica background noise")],
    expectBaseline: "spam",
  },
  {
    name: "audio corto con 'uniformes' (heurística lo descarta; Jev lo rescata)",
    answers: "audio_rescue",
    messages: [A("uniformes ya"), A("ya uniformes")],
    expectBaseline: "spam",
  },
  {
    name: "prefill Meta Ads",
    answers: "prefill",
    messages: [T("Hola, quiero cotizar uniformes de")],
    expectBaseline: "prefill",
  },
];

function classify(res) {
  const vars = res.vars || {};
  const sp = vars.spam_profile;
  if (sp && sp.is_spam) return "spam";
  if (sp && sp.ads_prefill_only) return "prefill";
  return "lead";
}

async function run(handler, env, fixture, mode, { noKey = false } = {}) {
  env.LIFE_JEV_MODE = mode;
  env.OPENROUTER_API_KEY = noKey ? "" : "sk-or-v1-test";
  const body = {
    available_edges: ["user_input", "ignore", "timeout", "end", "ads_greet"],
    execution_context: { vars: {}, context: { phone_number: "573001112233" } },
    whatsapp_context: {
      conversation: { phone_number: "573001112233" },
      messages: fixture.messages,
    },
    last_resume_reason: "timeout",
  };
  const req = { json: async () => body };
  const res = await handler(req, env);
  const payload = JSON.parse(await res.text());
  return payload;
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name} — ${detail}`);
  }
}

(async () => {
  for (const fx of FIXTURES) {
    console.log(`\n=== ${fx.name} (baseline esperado: ${fx.expectBaseline}) ===`);

    const sb = makeSandbox({ answers: JEV_ANSWERS[fx.answers] });

    // off → baseline
    const off = await run(sb.handler, sb.env, fx, "off");
    const offClass = classify(off);
    check(`off = ${fx.expectBaseline}`, offClass === fx.expectBaseline, `got ${offClass}`);
    check("off no escribe jev_shadow", off.vars.jev_shadow === null, JSON.stringify(off.vars.jev_shadow));

    // shadow → mismo resultado, con jev_shadow
    const shadow = await run(sb.handler, sb.env, fx, "shadow");
    const shadowClass = classify(shadow);
    check(`shadow conserva el edge (${offClass})`, shadowClass === offClass, `got ${shadowClass}`);
    check("shadow no cambia next_edge", shadow.next_edge === off.next_edge, `${shadow.next_edge} vs ${off.next_edge}`);
    check("shadow escribe jev_shadow.applied=false", shadow.vars.jev_shadow?.applied === false, JSON.stringify(shadow.vars.jev_shadow));
    console.log(`    jev: decision=${shadow.vars.jev_shadow?.decision} conf=${shadow.vars.jev_shadow?.confidence} agreement=${shadow.vars.jev_shadow?.agreement} th=${offClass}`);

    // on → solo rescate
    const on = await run(sb.handler, sb.env, fx, "on");
    const onClass = classify(on);
    const applied = on.vars.jev_shadow?.applied === true;
    if (offClass === "spam" && fx.answers === "audio_rescue") {
      check("on rescata el lead (spam→lead)", onClass === "lead" && applied, `got ${onClass} applied=${applied}`);
    } else if (offClass === "lead") {
      check("on NO convierte lead→spam", onClass === "lead", `got ${onClass}`);
    } else {
      check("on no empeora la clase", onClass === "spam" || onClass === "prefill" || applied, `got ${onClass}`);
    }

    // Jev caído → fallback
    const sbDown = makeSandbox({ answers: JEV_ANSWERS[fx.answers], throwOnFetch: true });
    const down = await run(sbDown.handler, sbDown.env, fx, "on");
    check("Jev caído → baseline (fallback)", classify(down) === offClass, `got ${classify(down)}`);
    check("Jev caído → ok=false registrado", down.vars.jev_shadow?.ok === false, JSON.stringify(down.vars.jev_shadow));

    // Sin key → fallback
    const sbNoKey = makeSandbox({ answers: JEV_ANSWERS[fx.answers] });
    const noKey = await run(sbNoKey.handler, sbNoKey.env, fx, "on", { noKey: true });
    check("sin API key → baseline", classify(noKey) === offClass, `got ${classify(noKey)}`);
  }

  console.log(`\n${failures === 0 ? "TODO OK" : failures + " FALLOS"}`);
  process.exitCode = failures === 0 ? 0 : 1;
})();