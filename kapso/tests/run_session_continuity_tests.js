#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  mapActiveOrders,
  conversationMatchesPhone,
  parseRecentMessages,
} from "../functions/lib/kapso_session_hydrate.js";
import {
  normalizeQuote,
  mergeQuotes,
  quoteLooksUseful,
  quoteRichnessScore,
  buildDossierText,
  parseDossierFromDescription,
  continuityResumeHint,
  DOSSIER_MARKER,
} from "../functions/lib/life_quote_dossier.js";

function testMapActiveOrders() {
  const mapped = mapActiveOrders(
    [
      { id: 10, name: "S02010", state: "sale" },
      { id: 11, name: "S02011", state: "draft" },
    ],
    [
      {
        id: 99,
        name: "Tarjeta S02010",
        stage_id: [32, "Fabricación"],
        sale_order_id: [10, "S02010"],
      },
    ]
  );
  assert.equal(mapped.length, 2);
  assert.equal(mapped[0].task_stage, "Fabricación");
  assert.equal(mapped[1].task_id, null);
}

function testNormalizeAndLines() {
  const q = normalizeQuote({
    product_text: "Camiseta dry-fit",
    quantity: 35,
    unit_cop: 30000,
    total_cop: 1050000,
  });
  assert.equal(q.lines.length, 1);
  assert.equal(q.lines[0].product_text, "Camiseta dry-fit");
  assert.ok(quoteLooksUseful(q));
}

function testMergeKeepsBothOptions() {
  const a = normalizeQuote({
    product_text: "Camiseta dry-fit",
    quantity: 35,
    unit_cop: 30000,
    total_cop: 1050000,
  });
  const b = {
    lines: [
      {
        product_text: "Uniforme completo dry-fit",
        quantity: 35,
        unit_cop: 50000,
        total_cop: 1750000,
      },
      {
        product_text: "Camiseta dry-fit",
        quantity: 35,
        unit_cop: 30000,
        total_cop: 1050000,
      },
    ],
    variants: { material: "dry-fit", collar: "cuello redondo", sleeves: "manga corta" },
    notes: "colegio · grado e instrumento",
  };
  const m = mergeQuotes(a, b, { bumpRevision: true });
  assert.ok(m.lines.length >= 2);
  assert.ok(quoteRichnessScore(m) > quoteRichnessScore(a));
  assert.match(m.notes, /colegio/);
  assert.ok(m.dossier_text.includes(DOSSIER_MARKER));
}

function testDossierRoundTrip() {
  const q = normalizeQuote({
    lines: [
      {
        product_text: "Uniforme completo dry-fit",
        quantity: 35,
        unit_cop: 50000,
        total_cop: 1750000,
      },
      {
        product_text: "Camiseta dry-fit",
        quantity: 35,
        unit_cop: 30000,
        total_cop: 1050000,
      },
    ],
    variants: { material: "dry-fit", collar: "cuello redondo", sleeves: "manga corta" },
    notes: "nombre, grado e instrumento",
    media_refs: [{ role: "design", summary: "camiseta negra cuello V" }],
    status: "esperando_equipo",
    revision: 2,
  });
  const text = buildDossierText(q, { customer_name: "Yeraldin", customer_phone: "3000000028" });
  assert.match(text, /LIFE_DOSSIER_v1/);
  assert.match(text, /opciones:/);
  const parsed = parseDossierFromDescription(`<p>intro</p><pre>${text}</pre>`);
  assert.ok(parsed);
  assert.ok(parsed.lines.length >= 1);
  assert.equal(parsed.status, "esperando_equipo");
  const hint = continuityResumeHint(parsed);
  assert.ok(hint && hint.length > 5);
}

function testConversationMatchesPhone() {
  assert.equal(
    conversationMatchesPhone({ phone_number: "3000000067" }, "3000000067"),
    true
  );
  assert.equal(
    conversationMatchesPhone({ phone_number: "3000000067" }, "3000000067"),
    true
  );
  assert.equal(
    conversationMatchesPhone({ phone_number: "3000000064" }, "3000000067"),
    false
  );
  assert.equal(conversationMatchesPhone({ phone_number: "" }, "3000000067"), false);
}

function testParseRecentMessagesStaffAndCustomer() {
  const raw = [
    {
      id: "wamid_1",
      direction: "inbound",
      text: { body: "Buenas tardes, cuánto cuesta un uniforme de fútbol?" },
      created_at: "2026-09-22T14:00:00Z",
    },
    {
      id: "wamid_2",
      direction: "outbound",
      origin: "workflow",
      text: { body: "Buenas tardes, uniforme completo dry-fit sale en $50.000..." },
      created_at: "2026-09-22T14:00:30Z",
    },
    {
      id: "wamid_3",
      direction: "inbound",
      text: { body: "Tienen disponibilidad para la próxima semana?" },
      created_at: "2026-09-22T14:02:00Z",
    },
    {
      id: "wamid_4",
      direction: "outbound",
      origin: "business_app",
      text: { body: "Hola, habla Paola de Life. Sí tenemos cupos, para iniciar requerimos el 50% de abono." },
      created_at: "2026-09-22T14:10:00Z",
    },
    {
      id: "wamid_5",
      direction: "inbound",
      text: { body: "Listo, a qué cuenta puedo consignar?" },
      created_at: "2026-09-22T14:15:00Z",
    },
  ];

  const parsed = parseRecentMessages(raw, { currentMessageId: "wamid_5" });
  assert.equal(parsed.has_prior_conversation, true);
  assert.equal(parsed.staff_participated, true);
  assert.match(parsed.last_staff_message, /habla Paola/);
  assert.match(parsed.recent_thread_summary, /\[STAFF\]: Hola, habla Paola/);
  assert.match(parsed.recent_thread_summary, /\[CLIENTE\]: Buenas tardes/);
  // wamid_5 must be excluded
  assert.ok(!parsed.recent_thread_summary.includes("a qué cuenta puedo consignar"));
}

function testParseRecentMessagesOnlyBot() {
  const raw = [
    {
      id: "wamid_10",
      direction: "inbound",
      text: { body: "Hola" },
      created_at: "2026-09-22T10:00:00Z",
    },
    {
      id: "wamid_11",
      direction: "outbound",
      origin: "workflow",
      text: { body: "Buenas, qué uniforme necesita?" },
      created_at: "2026-09-22T10:00:15Z",
    },
  ];
  const parsed = parseRecentMessages(raw);
  assert.equal(parsed.has_prior_conversation, true);
  assert.equal(parsed.staff_participated, false);
  assert.equal(parsed.last_staff_message, null);
  assert.match(parsed.recent_thread_summary, /\[BOT\]/);
}

testMapActiveOrders();
testNormalizeAndLines();
testMergeKeepsBothOptions();
testDossierRoundTrip();
testConversationMatchesPhone();
testParseRecentMessagesStaffAndCustomer();
testParseRecentMessagesOnlyBot();
console.log("OK session continuity + life_quote_dossier + recent messages thread");

