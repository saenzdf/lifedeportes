#!/usr/bin/env node
/**
 * Unit tests for route_customer_burst_resume spam / prefill / sales priority.
 * Run: node kapso/tests/test_spam_burst_logic.js
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const codePath = path.resolve(__dirname, "../functions/route_customer_burst_resume.js");
const code = readFileSync(codePath, "utf8");

async function runHandler(payload) {
  const wrapped = `${code}\n; this.__handler = handler;`;
  const ctx = { console, Response };
  vm.createContext(ctx);
  vm.runInContext(wrapped, ctx);
  const req = {
    json: async () => payload,
  };
  const res = await ctx.__handler(req, {});
  return JSON.parse(await res.text());
}

function msg({ direction = "inbound", type = "text", text = "", transcript = null } = {}) {
  const m = {
    direction,
    message_type: type,
    type,
  };
  if (text) m.text = { body: text };
  if (transcript != null) m.transcript = transcript;
  return m;
}

let passed = 0;
let failed = 0;

async function check(name, payload, expect) {
  const out = await runHandler(payload);
  const edge = out.next_edge;
  const spam = out.vars?.spam_profile;
  const okEdge = expect.edge === undefined || edge === expect.edge;
  const okSpam =
    expect.is_spam === undefined || Boolean(spam?.is_spam) === expect.is_spam;
  const okPrefill =
    expect.ads_prefill_only === undefined ||
    Boolean(spam?.ads_prefill_only) === expect.ads_prefill_only;
  if (okEdge && okSpam && okPrefill) {
    passed++;
    console.log(`PASS  ${name} → ${edge}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log("  got:", { edge, spam });
    console.log("  expected:", expect);
  }
}

const edges = ["user_input", "ignore", "timeout", "end", "ads_greet"];

await check(
  "prefill-only → ads_greet",
  {
    available_edges: edges,
    system: { last_resume: { reason: "timeout" } },
    whatsapp_context: {
      conversation: { phone_number: "3000000024" },
      messages: [msg({ text: "Hola, quiero cotizar uniformes de" })],
    },
  },
  { edge: "ads_greet", is_spam: false, ads_prefill_only: true }
);

await check(
  "prefill without comma → ads_greet",
  {
    available_edges: edges,
    system: { last_resume: { reason: "timeout" } },
    whatsapp_context: {
      conversation: { phone_number: "3000000025" },
      messages: [msg({ text: "hola quiero cotizar uniformes de" })],
    },
  },
  { edge: "ads_greet", ads_prefill_only: true }
);

await check(
  "quiero uniformes de → ads_greet",
  {
    available_edges: edges,
    system: { last_resume: { reason: "timeout" } },
    whatsapp_context: {
      conversation: { phone_number: "573111111113" },
      messages: [msg({ text: "quiero uniformes de" })],
    },
  },
  { edge: "ads_greet", ads_prefill_only: true }
);

await check(
  "prefill already greeted → ignore",
  {
    available_edges: edges,
    system: { last_resume: { reason: "timeout" } },
    execution_context: {
      vars: { service: { ads_prefill_greeted: true } },
    },
    whatsapp_context: {
      conversation: { phone_number: "573111111114" },
      messages: [msg({ text: "Hola, quiero cotizar uniformes de" })],
    },
  },
  { edge: "end", ads_prefill_only: true }
);

await check(
  "Ligia-like: prefill + Hola + audio cotización → vendor",
  {
    available_edges: edges,
    system: { last_resume: { reason: "timeout" } },
    whatsapp_context: {
      conversation: { phone_number: "3000000042" },
      messages: [
        msg({ text: "Hola, quiero cotizar uniformes de" }),
        msg({ text: "Hola" }),
        msg({ text: "Hola" }),
        msg({
          type: "audio",
          transcript: {
            text: "Buenas tardes, necesito una cotización de doscientas camisetas entre la talla S y la XL.",
          },
        }),
        msg({ type: "image", text: "" }),
      ],
    },
  },
  { edge: "timeout", is_spam: false }
);

await check(
  "Bordados-like: cotizar futbol + cantidad → vendor",
  {
    available_edges: edges,
    system: { last_resume: { reason: "timeout" } },
    whatsapp_context: {
      conversation: { phone_number: "3000000080" },
      messages: [
        msg({ text: "Hola, quiero cotizar uniformes de fútbol" }),
        msg({ text: "12 uniformes" }),
      ],
    },
  },
  { edge: "timeout", is_spam: false }
);

await check(
  "spam 3007 blacklist → ignore",
  {
    available_edges: edges,
    system: { last_resume: { reason: "timeout" } },
    whatsapp_context: {
      conversation: { phone_number: "3000000003" },
      messages: [
        msg({
          text: "Hola, quiero  unifor cv h vd2 AZ ka da CF gg d ese se  HC gggg tres cz a fr g5tttss5r rerrfçx shh g te fe free QRas chftGmes de",
        }),
        msg({ type: "sticker" }),
      ],
    },
  },
  { edge: "end", is_spam: true }
);

await check(
  "spam 3157 pocket dial mooing/crying → end",
  {
    available_edges: edges,
    system: { last_resume: { reason: "timeout" } },
    whatsapp_context: {
      conversation: { phone_number: "3000000041" },
      messages: [
        msg({ text: "Hola, quiero cotizar uniformes de" }),
        msg({ type: "audio", transcript: { text: "[mooing]" } }),
        msg({ type: "audio", transcript: { text: "[crying]" } }),
        msg({ type: "audio", transcript: { text: "[paper rustling]" } }),
        msg({ type: "audio", transcript: { text: "[mooing]" } }),
      ],
    },
  },
  { edge: "end", is_spam: true }
);

await check(
  "keyboard smash without blacklist → end",
  {
    available_edges: edges,
    system: { last_resume: { reason: "timeout" } },
    whatsapp_context: {
      conversation: { phone_number: "3000000053" },
      messages: [
        msg({
          text: "Hola, quiero  unifor cv h vd2 AZ ka da CF gg d ese se  HC gggg tres cz a fr g5tttss5r rerrfçx shh g te fe free QRas chftGmes de",
        }),
      ],
    },
  },
  { edge: "end", is_spam: true }
);

await check(
  "user_input while waiting → rewait",
  {
    available_edges: edges,
    system: { last_resume: { reason: "user_input" } },
    whatsapp_context: {
      conversation: { phone_number: "3000000024" },
      messages: [msg({ text: "Hola, quiero cotizar uniformes de" })],
    },
  },
  { edge: "user_input" }
);

await check(
  "2x Hola alone without media is gibberish → end",
  {
    available_edges: edges,
    system: { last_resume: { reason: "timeout" } },
    whatsapp_context: {
      conversation: { phone_number: "3000000051" },
      messages: [msg({ text: "Hola" }), msg({ text: "Hola" })],
    },
  },
  { edge: "end", is_spam: true }
);

await check(
  "real speech audio without sports keywords → vendor",
  {
    available_edges: edges,
    system: { last_resume: { reason: "timeout" } },
    whatsapp_context: {
      conversation: { phone_number: "3000000040" },
      messages: [
        msg({ text: "Hola" }),
        msg({ text: "Hola" }),
        msg({
          type: "audio",
          transcript: {
            text: "Buenas tardes, me pueden ayudar por favor, necesito información de ustedes.",
          },
        }),
      ],
    },
  },
  { edge: "timeout", is_spam: false }
);

await check(
  "2x Hola + non-verbal audio only → end (no real speech)",
  {
    available_edges: edges,
    system: { last_resume: { reason: "timeout" } },
    whatsapp_context: {
      conversation: { phone_number: "3000000045" },
      messages: [
        msg({ text: "Hola" }),
        msg({ text: "Hola" }),
        msg({ type: "audio", transcript: { text: "[silence]" } }),
        msg({ type: "audio", transcript: { text: "[mooing]" } }),
      ],
    },
  },
  { edge: "end", is_spam: true }
);

await check(
  "transcript embedded in audio body → vendor",
  {
    available_edges: edges,
    system: { last_resume: { reason: "timeout" } },
    whatsapp_context: {
      conversation: { phone_number: "3000000048" },
      messages: [
        msg({ text: "Hola" }),
        msg({
          type: "audio",
          text: "Audio attached (audio_x.ogg)\n\nTranscript: Buenas, necesito doscientas camisetas tallas S a XL.",
        }),
      ],
    },
  },
  { edge: "timeout", is_spam: false }
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
