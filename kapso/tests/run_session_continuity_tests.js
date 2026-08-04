#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  mapActiveOrders,
  conversationMatchesPhone,
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
  const text = buildDossierText(q, { customer_name: "Yeraldin", customer_phone: "573117582648" });
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
    conversationMatchesPhone({ phone_number: "573222658395" }, "573222658395"),
    true
  );
  assert.equal(
    conversationMatchesPhone({ phone_number: "573222658395" }, "3222658395"),
    true
  );
  assert.equal(
    conversationMatchesPhone({ phone_number: "573218323265" }, "573222658395"),
    false
  );
  assert.equal(conversationMatchesPhone({ phone_number: "" }, "573222658395"), false);
}

testMapActiveOrders();
testNormalizeAndLines();
testMergeKeepsBothOptions();
testDossierRoundTrip();
testConversationMatchesPhone();
console.log("OK session continuity + life_quote_dossier");
