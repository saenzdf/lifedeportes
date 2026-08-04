#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { matchProduct } from "../functions/lib/product_match_engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../catalog/life_catalog_semantic_v1.json"), "utf8")
);

const cases = [
  {
    name: "uniforme futbol explícito → 115",
    input: { product_text: "uniforme de futbol", quantity: 10 },
    assert: (r) => r.found && r.odoo_template_id === 115 && r.match_confidence !== "none",
  },
  {
    name: "Camiseta de futbol → camiseta sola 62",
    input: { product_text: "camiseta de futbol", quantity: 10 },
    assert: (r) => r.found && r.odoo_template_id === 62 && r.parsed?.garmentType === "camiseta_sola",
  },
  {
    name: "camiseta + visual polo → 61",
    input: { product_text: "camiseta normal", visual_hints: ["foto con cuello polo"], quantity: 8 },
    assert: (r) => r.found && r.odoo_template_id === 61,
  },
  {
    name: "uniforme voleibol → 31",
    input: { product_text: "10 uniformes voleibol", quantity: 10 },
    assert: (r) => r.found && r.odoo_template_id === 31,
  },
  {
    name: "baloncesto → 23",
    input: { product_text: "uniforme baloncesto", quantity: 12 },
    assert: (r) => r.found && r.odoo_template_id === 23,
  },
  {
    name: "atletismo → 35",
    input: { product_text: "uniforme atletismo", quantity: 6 },
    assert: (r) => r.found && r.odoo_template_id === 35,
  },
  {
    name: "natacion rechazada",
    input: { product_text: "uniforme natacion", quantity: 10 },
    assert: (r) => r.sport_declined === true,
  },
  {
    name: "uniforme polo → 8 (Presentación)",
    input: { product_text: "uniforme con cuello polo", quantity: 10 },
    assert: (r) => r.found && r.odoo_template_id === 8,
  },
  {
    name: "camiseta sin calificadores → camiseta sola 62",
    input: { product_text: "camiseta", quantity: 10 },
    assert: (r) =>
      r.found &&
      r.odoo_template_id === 62 &&
      r.parsed?.garmentType === "camiseta_sola" &&
      r.commercial_role === "base_product" &&
      r.clarifying_question === null,
  },
  {
    name: "camisa regional → camiseta sola 62",
    input: { product_text: "camisa", quantity: 6 },
    assert: (r) =>
      r.found &&
      r.odoo_template_id === 62 &&
      r.parsed?.garmentType === "camiseta_sola" &&
      r.clarifying_question === null,
  },
  {
    name: "voley sin tilde → voleibol 31",
    input: { product_text: "uniformes de voley", quantity: 10 },
    assert: (r) => r.found && r.odoo_template_id === 31,
  },
  {
    name: "solo camisa → camiseta sola",
    input: { product_text: "solo camisa futbol", quantity: 10 },
    assert: (r) => r.found && r.parsed?.garmentType === "camiseta_sola",
  },
  {
    name: "camiseta y pantaloneta → uniforme completo",
    input: { product_text: "10 uniformes microfutbol camiseta pantaloneta", quantity: 10 },
    assert: (r) =>
      r.found && r.parsed?.garmentType === "uniforme_completo" && r.odoo_template_id === 115,
  },
  {
    name: "hoodie → sudadera 1811",
    input: { product_text: "6 hoodies personalizados", quantity: 6 },
    assert: (r) => r.parsed?.garmentType === "sudadera_conjunto" && r.odoo_template_id === 1811,
  },
  {
    name: "uniforme sin deporte pregunta la dimensión más útil",
    input: { product_text: "quiero 10 uniformes", quantity: 10 },
    assert: (r) =>
      r.missing_dimensions?.includes("sport") &&
      r.clarifying_question === "¿Para qué deporte necesita el uniforme?" &&
      r.candidates?.length > 0 &&
      r.candidates.every((candidate) => Number.isFinite(candidate.score)),
  },
  {
    name: "producto resuelto sin cantidad pregunta cantidad",
    input: { product_text: "uniforme de futbol" },
    assert: (r) =>
      r.odoo_template_id === 115 &&
      r.missing_dimensions?.includes("quantity") &&
      r.clarifying_question === "¿Cuántas unidades necesita?",
  },
  {
    name: "prenda ausente pregunta por prenda antes que otras dimensiones",
    input: { product_text: "necesito algo deportivo", quantity: 10 },
    assert: (r) =>
      r.missing_dimensions?.includes("garment_type") &&
      r.clarifying_question === "¿Qué prenda necesita: camiseta, uniforme completo u otra?",
  },
  {
    name: "rompevientos → Chaqueta Rompevientos 68 (no Lotto)",
    input: { product_text: "rompevientos", quantity: 6 },
    assert: (r) =>
      r.found &&
      r.odoo_template_id === 68 &&
      r.parsed?.garmentType === "chaqueta",
  },
  {
    name: "chaqueta rompevientos → 68",
    input: { product_text: "chaqueta rompevientos", quantity: 6 },
    assert: (r) => r.found && r.odoo_template_id === 68,
  },
  {
    name: "chaqueta lotto → 1800",
    input: { product_text: "chaqueta lotto", quantity: 6 },
    assert: (r) => r.found && r.odoo_template_id === 1800,
  },
  {
    name: "petos → 69",
    input: { product_text: "petos", quantity: 11 },
    assert: (r) =>
      r.found && r.odoo_template_id === 69 && r.parsed?.garmentType === "peto",
  },
];

let passed = 0;
let failed = 0;
for (const tc of cases) {
  const result = matchProduct(tc.input, catalog);
  if (tc.assert(result)) {
    console.log("✓", tc.name);
    passed++;
  } else {
    console.log("✗", tc.name, JSON.stringify(result).slice(0, 200));
    failed++;
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
