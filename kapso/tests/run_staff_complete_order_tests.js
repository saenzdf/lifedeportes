#!/usr/bin/env node
/** Regresiones: contrato staff, spreadsheet fill, cross-check, compile. */
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildOrderLifecycle,
  buildResolvedLine,
  crossCheckPeopleVsLines,
  evaluateStaffWriteReadiness,
  splitProductDisplayName,
  stableFingerprint,
} from "../functions/lib/staff_order_contract.js";
import {
  applyLifeFormularioFill,
  buildMinimalLifeFormularioSnapshot,
  parsePeopleFromSpreadsheet,
  FORMULARIO_HEADERS,
  PEDIDO_HEADERS,
} from "../functions/lib/sale_order_spreadsheet.js";
import { classifyOrderInput } from "../functions/lib/classify_order_input.js";
import { defaultProductTextForRow } from "../functions/lib/list_section_products.js";
import { compileStaffOrderDraft } from "../functions/compile_staff_order_draft.js";

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("ok:", name);
  } catch (err) {
    failed += 1;
    console.error("FAIL:", name, err.message);
  }
}

check("splitProductDisplayName baloncesto", () => {
  const s = splitProductDisplayName("Uniforme de baloncesto (Cuello en V, Dry-fit)");
  assert.equal(s.product_base, "Uniforme de baloncesto");
  assert.ok(s.embedded_attrs.cuello);
  assert.ok(s.embedded_attrs.tela);
});

check("cross-check mismatch personas vs qty", () => {
  const cross = crossCheckPeopleVsLines({
    detail: {
      rows: [
        { nombre: "A", talla: "M" },
        { nombre: "B", talla: "L" },
      ],
    },
    resolvedLines: [
      buildResolvedLine({
        product_text: "Uniforme de Fútbol",
        quantity: 8,
        product_variant_id: 1,
        confidence: "high",
      }),
    ],
  });
  assert.equal(cross.ok, false);
  assert.equal(cross.status, "mismatch");
});

check("pedido comercial sin lista queda draft_partial pero escribible", () => {
  const lines = [
    buildResolvedLine({
      product_text: "Uniforme de Fútbol",
      quantity: 20,
      product_variant_id: 1,
      confidence: "high",
      category: "uniforme",
    }),
  ];
  const cross = crossCheckPeopleVsLines({ detail: {}, resolvedLines: lines });
  const lifecycle = buildOrderLifecycle(
    {
      quote: { customer_display_name: "CLUB DEMO" },
      order_draft: { detail: {}, commercial: { resolved_lines: lines } },
    },
    lines,
    cross
  );
  assert.equal(cross.ok, false);
  assert.equal(lifecycle.state, "draft_partial");
  assert.equal(lifecycle.commercial_quantity, 20);
  assert.equal(lifecycle.detail_quantity, 0);
  assert.ok(lifecycle.missing_fields.includes("lista_personas"));
  assert.equal(lifecycle.confirmation_gate.allowed, false);
});

check("pedido completo habilita revisión previa a confirmar", () => {
  const lines = [
    buildResolvedLine({
      product_text: "Uniforme de Fútbol",
      quantity: 1,
      product_variant_id: 1,
      confidence: "high",
      category: "uniforme",
    }),
  ];
  const detail = {
    people: [
      {
        identity: { print_name: "JUAN", number: "10" },
        components: [{ size: "M" }],
      },
    ],
  };
  const cross = crossCheckPeopleVsLines({ detail, resolvedLines: lines });
  const lifecycle = buildOrderLifecycle(
    {
      quote: { customer_display_name: "CLUB DEMO" },
      order_draft: { detail, commercial: { resolved_lines: lines } },
    },
    lines,
    cross
  );
  assert.equal(lifecycle.state, "draft_ready_for_review");
  assert.equal(lifecycle.confirmation_gate.allowed, true);
});

check("cross-check ok cuando cuadran", () => {
  const cross = crossCheckPeopleVsLines({
    detail: {
      rows: Array.from({ length: 8 }, (_, i) => ({ nombre: `P${i}`, talla: "M" })),
    },
    resolvedLines: [
      buildResolvedLine({
        product_text: "Uniforme",
        quantity: 8,
        product_variant_id: 11,
        confidence: "high",
      }),
    ],
  });
  assert.equal(cross.ok, true);
  assert.equal(cross.status, "complete");
});

check("spreadsheet fill principales + otros atributos + rename", () => {
  const val = (c) => (c && typeof c === "object" ? c.content : c);
  const base = buildMinimalLifeFormularioSnapshot();
  const { snapshot, filled } = applyLifeFormularioFill(base, {
    detail: {
      people: [
        {
          person_id: "p1",
          identity: { print_name: "JUAN", number: "10", group: "masculino" },
          color_medias: "Negro",
          components: [{ size: "M", comment: "Arquero", goalkeeper: true }],
        },
      ],
    },
    resolvedLines: [
      buildResolvedLine({
        product_text: "Uniforme de baloncesto (Cuello en V, Dry-fit, Edición 2026)",
        product_base: "Uniforme de baloncesto",
        quantity: 1,
        product_variant_id: 12505,
        confidence: "high",
        attributes: { cuello: "Cuello en V", tela: "Dry-fit", tipo_pantalon: "Pantaloneta" },
        comments: "sisa",
      }),
    ],
  });
  assert.equal(filled, 1);
  const form = snapshot.sheets[0];
  assert.equal(val(form.cells.C1), FORMULARIO_HEADERS.C);
  assert.equal(val(form.cells.F1), FORMULARIO_HEADERS.F);
  assert.equal(val(form.cells.G1), FORMULARIO_HEADERS.G);
  assert.equal(val(form.cells.J1), FORMULARIO_HEADERS.J);
  assert.equal(val(form.cells.K1), FORMULARIO_HEADERS.K);
  assert.equal(val(form.cells.L1), FORMULARIO_HEADERS.L);
  assert.equal(val(form.cells.C2), "JUAN");
  assert.equal(val(form.cells.E2), "Tallas: M");
  assert.equal(val(form.cells.L2), "Negro");
  assert.equal(val(form.cells.F2), "Cuello en V");
  assert.equal(val(form.cells.G2), "");
  assert.equal(val(form.cells.H2), "masculino");
  assert.ok(String(val(form.cells.J2)).includes("Tela: Dry-fit"));
  assert.ok(String(val(form.cells.J2)).includes("Pantaloneta"));
  assert.ok(String(val(form.cells.K2)).includes("Arquero"));
  const pedido = snapshot.sheets[1];
  assert.equal(pedido.name, "Productos del pedido");
  assert.equal(val(pedido.cells.I1), PEDIDO_HEADERS.I);
  assert.equal(val(pedido.cells.N1), "Otros atributos");
  assert.equal(val(pedido.cells.O1), "Comentario");
  assert.equal(val(pedido.cells.I2), "Uniforme de baloncesto");
  assert.equal(val(pedido.cells.J2), "Cuello en V");
  assert.ok(String(val(pedido.cells.N2)).includes("Tela: Dry-fit"));
  assert.ok(String(val(pedido.cells.O2)).includes("Edición 2026"));
  form.cells.A2 = "=SEQUENCE(1)";
  form.cells.B2 = "=XLOOKUP(1,Pedido!F:F,Pedido!A:A)";
  const again = applyLifeFormularioFill(snapshot, {
    detail: { people: [{ identity: { print_name: "JUAN" }, components: [{ size: "M" }] }] },
    resolvedLines: [
      buildResolvedLine({
        product_text: "Uniforme de baloncesto (Cuello en V, Dry-fit)",
        quantity: 1,
        product_variant_id: 1,
        confidence: "high",
      }),
    ],
  }).snapshot;
  assert.ok(String(val(again.sheets[0].cells.A2)).startsWith("="));
  assert.ok(String(val(again.sheets[0].cells.B2)).startsWith("="));
  assert.equal(again.sheets[1].name, "Productos del pedido");
  const people = parsePeopleFromSpreadsheet(snapshot);
  assert.equal(people.length, 1);
  assert.equal(people[0].identity.print_name, "JUAN");
});

check("splitProductDisplayName con descripción ecommerce tras )", () => {
  const s = splitProductDisplayName(
    "Uniforme de Fútbol (Medias Semiprofesionales, Cuello en V, Corta, Pantaloneta, Dry-fit) Uniforme deportivo profesional compuesto por camiseta"
  );
  assert.equal(s.product_base, "Uniforme de Fútbol");
  assert.equal(s.embedded_attrs.cuello, "Cuello en V");
  assert.equal(s.embedded_attrs.manga, "Corta");
  assert.equal(s.embedded_attrs.tela, "Dry-fit");
  assert.equal(s.embedded_attrs.medias, "Medias Semiprofesionales");
  assert.equal(s.embedded_attrs.tipo_pantalon, "Pantaloneta");
});

check("no inventar Uniforme sin evidencia", () => {
  assert.equal(defaultProductTextForRow({ nombre: "X", talla: "M" }), null);
  assert.equal(defaultProductTextForRow({ uniforme: true }), "Uniforme de Fútbol");
});

check("classify excel vs conversation", () => {
  const excel = classifyOrderInput([
    {
      direction: "inbound",
      content: "SUBIR",
      document: { url: "https://x/a.xlsx", filename: "lista.xlsx" },
    },
  ]);
  assert.equal(excel.format, "excel_unknown_layout");
  const conv = classifyOrderInput([
    { direction: "inbound", content: "el pedido raro de ayer" },
  ]);
  assert.equal(conv.mode, "agent_normalize");
});

check("readiness: diseño primero sin lista → needs HAZ PRESUPUESTO (no blocked)", () => {
  const r = evaluateStaffWriteReadiness({
    quote: { order_kind: "design_exploration", product_text: "Diseño", quantity: 1 },
    order_draft: {
      commercial: {
        lines: [{ product_text: "Diseño", quantity: 1, commercial_role: "design" }],
      },
      attachments: [{ filename: "mockup.png", role: "design_reference" }],
    },
    staff: { has_order_attachments: true },
  });
  assert.equal(r.status, "needs_staff_confirmation");
  assert.equal(r.code, "needs_presupuesto_intent_sin_lista");
  assert.equal(r.lista_pending, true);
});

check("readiness: estimado sin lista → needs HAZ PRESUPUESTO (no blocked)", () => {
  const r = evaluateStaffWriteReadiness({
    order_draft: {
      commercial: {
        lines: [
          {
            product_text: "Uniforme de Fútbol",
            quantity: 24,
            category: "uniforme",
            product_variant_id: 12409,
            confidence: "high",
          },
        ],
      },
    },
  });
  assert.equal(r.status, "needs_staff_confirmation");
  assert.equal(r.code, "needs_presupuesto_intent_sin_lista");
});

check("readiness: legacy commercial lines → ready", () => {
  const r = evaluateStaffWriteReadiness({
    user: { role: "staff" },
    order_draft: {
      commercial: {
        lines: [
          { product_text: "Uniforme de Fútbol", quantity: 8, category: "uniforme" },
          { product_text: "Chaqueta", quantity: 4, category: "otros" },
        ],
      },
    },
  });
  assert.equal(r.status, "ready");
});

check("readiness: low confidence → needs confirmation", () => {
  const r = evaluateStaffWriteReadiness({
    order_draft: {
      commercial: {
        resolved_lines: [
          buildResolvedLine({
            product_text: "Uniforme",
            quantity: 8,
            product_variant_id: 1,
            confidence: "low",
            category: "uniforme",
          }),
        ],
      },
    },
  });
  assert.equal(r.status, "needs_staff_confirmation");
  assert.ok(r.fingerprint);
});

check("readiness: confirmation fingerprint unlocks", () => {
  const lines = [
    buildResolvedLine({
      product_text: "Uniforme",
      quantity: 8,
      product_variant_id: 1,
      confidence: "medium",
      category: "uniforme",
    }),
  ];
  const fp = stableFingerprint({ resolved_lines: lines, detail: {}, partner_key: "" });
  const r = evaluateStaffWriteReadiness({
    staff: { confirmation_fingerprint: fp },
    order_draft: { commercial: { resolved_lines: lines } },
  });
  assert.equal(r.status, "ready");
});

// async compile + variant priority
try {
  const { matchProduct } = await import("../functions/lib/product_match_engine.js");
  const catalog = JSON.parse(
    fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../catalog/life_catalog_semantic_v1.json"), "utf8")
  );
  const explicit = matchProduct(
    {
      product_text: "uniforme futbol cuello redondo manga corta",
      photo_description: "cuello en V manga larga",
      quantity: 10,
    },
    catalog
  );
  assert.equal(explicit.parsed.collar, "cuello_redondo");
  assert.equal(explicit.attr_sources.collar, "text");
  assert.equal(explicit.parsed.sleeves, "manga_corta");
  assert.equal(explicit.attr_sources.sleeves, "text");
  console.log("ok: variante texto gana a foto");

  const fromPhoto = matchProduct(
    {
      product_text: "uniforme de futbol 12 unidades",
      photo_description: "referencia cuello en V manga corta dry fit",
      quantity: 12,
    },
    catalog
  );
  assert.equal(fromPhoto.parsed.collar, "cuello_v");
  assert.equal(fromPhoto.attr_sources.collar, "photo");
  assert.equal(fromPhoto.parsed.sleeves, "manga_corta");
  assert.equal(fromPhoto.attr_sources.sleeves, "photo");
  console.log("ok: variante foto llena faltantes");

  const compiled = await compileStaffOrderDraft(
    {
      user: { role: "staff" },
      order_draft: {
        commercial: {
          lines: [{ product_text: "Uniforme de Fútbol dry-fit", quantity: 10, category: "uniforme" }],
        },
      },
    },
    {}
  );
  assert.ok(compiled.order_draft.commercial.resolved_lines.length >= 1);
  assert.ok(
    compiled.order_draft.commercial.resolved_lines[0].product_base ||
      compiled.order_draft.commercial.resolved_lines[0].product_text
  );
  assert.ok(compiled.order_draft.write.fingerprint);
  console.log("ok: compile produces resolved_lines");
} catch (err) {
  failed += 1;
  console.error("FAIL: variant priority / compile", err.message);
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall staff complete-order tests passed");
