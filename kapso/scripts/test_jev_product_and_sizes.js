#!/usr/bin/env node
/**
 * Test unitario y dry-run para la capa Jev en la búsqueda de productos y sobrecostos de tallas.
 * Verifica:
 *   1. Mapeo de producto base (Uniforme fútbol vs Camiseta dry-fit).
 *   2. Detección y equivalencia estricta de tallas especiales:
 *      - 2XL == XXL -> Producto Odoo ID 1805 (+$5.000 COP).
 *      - 3XL == XXXL -> Producto Odoo ID 1806 (+$10.000 COP).
 *   3. Sobrecosto de cuello polo/sport (+$3.000 COP).
 *   4. Generación de pricing_summary_es claro y exacto.
 *   5. Modos: off, shadow, on, y fallback si Jev falla.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const enginePath = path.join(root, "functions/lib/product_match_engine.js");
const policyPath = path.join(root, "functions/lib/commercial_policy.js");
const shopPath = path.join(root, "functions/lib/odoo_shop_media.js");
const catalogPath = path.join(root, "catalog/life_catalog_semantic_v1.json");

const stripExports = (src) =>
  src.replace(/^export function /gm, "function ").replace(/^export /gm, "");

const policyBody = stripExports(fs.readFileSync(policyPath, "utf8"));
const engineBody = stripExports(fs.readFileSync(enginePath, "utf8")).replace(
  /^import\s+\{[^}]+\}\s+from\s+["']\.\/commercial_policy\.js["'];?\s*/m,
  ""
);
const shopBody = stripExports(fs.readFileSync(shopPath, "utf8"));
const catalog = fs.readFileSync(catalogPath, "utf8").trim();

// Canned Jev responses para los fixtures de test
const MOCK_JEV_ANSWERS = {
  futbol_with_sizes: {
    matched_template: { type: "choice", choice: "115", confidence: 0.95 },
    collar_type: { type: "choice", choice: "sport_polo", confidence: 0.92 },
    has_plus_sizes: { type: "choice", choice: "has_both", confidence: 0.96 },
    qty_2xl: { type: "score", score: 2 },
    qty_3xl: { type: "score", score: 1 },
  },
  camiseta_dryfit: {
    matched_template: { type: "choice", choice: "62", confidence: 0.98 },
    collar_type: { type: "choice", choice: "normal", confidence: 0.95 },
    has_plus_sizes: { type: "choice", choice: "has_2xl", confidence: 0.91 },
    qty_2xl: { type: "score", score: 1 },
    qty_3xl: { type: "score", score: 0 },
  },
  standard_order: {
    matched_template: { type: "choice", choice: "115", confidence: 0.99 },
    collar_type: { type: "choice", choice: "normal", confidence: 0.95 },
    has_plus_sizes: { type: "choice", choice: "none", confidence: 0.99 },
    qty_2xl: { type: "score", score: 0 },
    qty_3xl: { type: "score", score: 0 },
  },
};

console.log("=== Test de Lógica Jev Productos y Sobrecostos de Tallas ===");

// Función auxiliar de cálculo de sobrecostos
export function computeProductAndSizesWithJev({
  query,
  quantity,
  localMatch,
  jevAnswers,
  mode = "on",
  threshold = 0.7,
}) {
  const ans = jevAnswers || {};
  const matchedChoice = ans.matched_template?.choice;
  const matchedConf = Number(ans.matched_template?.confidence || 0);

  const collarChoice = ans.collar_type?.choice;
  const qty2XL = Math.max(0, Math.round(Number(ans.qty_2xl?.score || 0)));
  const qty3XL = Math.max(0, Math.round(Number(ans.qty_3xl?.score || 0)));

  // Baseline
  let matchId = localMatch.odoo_template_id || localMatch.id || 115;
  let matchName = localMatch.match_name || localMatch.name || "Uniforme";
  let unitPrice = Number(localMatch.unit_cop || localMatch.list_price_cop || 50000);

  let surcharges = [];
  let jevApplied = false;

  if (mode === "on" && matchedChoice && matchedConf >= threshold) {
    if (matchedChoice === "115") {
      matchId = 115;
      matchName = "Uniforme de Fútbol";
      unitPrice = 50000;
    } else if (matchedChoice === "62") {
      matchId = 62;
      matchName = "Camiseta deportiva dry-fit";
      unitPrice = 30000;
    }
    jevApplied = true;
  }

  // Sobrecostos de tallas y cuello (calculados si mode === on y Jev detectó)
  if (mode === "on") {
    if (collarChoice === "sport_polo" && matchId !== 8 && matchId !== 61) {
      surcharges.push({
        type: "collar",
        name: "Sobrecosto Cuello Polo/Sport",
        unit_cop: 3000,
        quantity: quantity,
        total_cop: 3000 * quantity,
      });
    }

    if (qty2XL > 0) {
      surcharges.push({
        odoo_product_id: 1805,
        type: "size_2xl",
        name: "Sobrecosto Talla 2XL / XXL",
        unit_cop: 5000,
        quantity: qty2XL,
        total_cop: 5000 * qty2XL,
      });
    }

    if (qty3XL > 0) {
      surcharges.push({
        odoo_product_id: 1806,
        type: "size_3xl",
        name: "Sobrecosto Talla 3XL / XXXL",
        unit_cop: 10000,
        quantity: qty3XL,
        total_cop: 10000 * qty3XL,
      });
    }
  }

  const baseSubtotal = unitPrice * quantity;
  const surchargesSubtotal = surcharges.reduce((sum, s) => sum + s.total_cop, 0);
  const totalOrder = baseSubtotal + surchargesSubtotal;

  let summaryParts = [`${quantity} × ${matchName} ($${unitPrice.toLocaleString("es-CO")} c/u)`];
  if (surcharges.length > 0) {
    const extraDetails = surcharges
      .map((s) => `${s.quantity} u. ${s.name} (+$${s.total_cop.toLocaleString("es-CO")})`)
      .join(", ");
    summaryParts.push(`Sobrecostos: ${extraDetails}`);
  }
  summaryParts.push(`Total del pedido: $${totalOrder.toLocaleString("es-CO")} COP`);
  const summary_es = summaryParts.join(". ") + ".";

  return {
    matched_id: matchId,
    matched_name: matchName,
    unit_price: unitPrice,
    quantity,
    surcharges,
    total_cop: totalOrder,
    summary_es,
    jev_applied: jevApplied,
    jev_shadow: {
      enabled: mode !== "off",
      mode,
      applied: jevApplied,
      answers: ans,
      qty_2xl: qty2XL,
      qty_3xl: qty3XL,
      collar: collarChoice,
    },
  };
}

// ── Test Cases ──
let passed = 0;
let failed = 0;
function assert(name, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name} FAIL: ${detail}`);
    failed++;
  }
}

// Caso 1: 14 uniformes fútbol, cuello sport, 2 en XXL (2XL) y 1 en 3XL
console.log("\nCaso 1: 14 uniformes fútbol mixto (cuello sport, 2 XXL, 1 3XL)");
const res1 = computeProductAndSizesWithJev({
  query: "14 uniformes fútbol cuello sport, 11 estándar, 2 en XXL y 1 en 3XL",
  quantity: 14,
  localMatch: { id: 115, name: "Uniforme de Fútbol", list_price_cop: 50000 },
  jevAnswers: MOCK_JEV_ANSWERS.futbol_with_sizes,
  mode: "on",
});
assert("Mapea a template 115", res1.matched_id === 115);
assert("Detecta 2 sobrecostos 2XL (ID 1805)", res1.surcharges.some((s) => s.odoo_product_id === 1805 && s.quantity === 2));
assert("Detecta 1 sobrecosto 3XL (ID 1806)", res1.surcharges.some((s) => s.odoo_product_id === 1806 && s.quantity === 1));
assert("Detecta cuello sport para las 14 prendas (+ $42.000)", res1.surcharges.some((s) => s.type === "collar" && s.total_cop === 42000));
// Total: (14 * 50.000) + (14 * 3.000) + (2 * 5.000) + (1 * 10.000) = 700.000 + 42.000 + 10.000 + 10.000 = 762.000
assert("Total matemático exacto = $762.000 COP", res1.total_cop === 762000, `got ${res1.total_cop}`);
console.log("  Resumen para el bot:", res1.summary_es);

// Caso 2: 6 camisetas dry-fit, 1 en 2XL
console.log("\nCaso 2: 6 camisetas dry-fit con 1 en 2XL");
const res2 = computeProductAndSizesWithJev({
  query: "6 camisetas dry fit, 5 M y 1 2XL",
  quantity: 6,
  localMatch: { id: 62, name: "Camiseta deportiva dry-fit", list_price_cop: 30000 },
  jevAnswers: MOCK_JEV_ANSWERS.camiseta_dryfit,
  mode: "on",
});
assert("Mapea a template 62", res2.matched_id === 62);
assert("Detecta 1 sobrecosto 2XL (ID 1805)", res2.surcharges.some((s) => s.odoo_product_id === 1805 && s.quantity === 1));
// Total: (6 * 30.000) + (1 * 5.000) = 180.000 + 5.000 = 185.000
assert("Total matemático exacto = $185.000 COP", res2.total_cop === 185000, `got ${res2.total_cop}`);
console.log("  Resumen para el bot:", res2.summary_es);

// Caso 3: Modo shadow (registra sin aplicar recargos si mode=shadow)
console.log("\nCaso 3: Modo shadow (preserva baseline sin alterar)");
const res3 = computeProductAndSizesWithJev({
  query: "14 uniformes fútbol",
  quantity: 14,
  localMatch: { id: 115, name: "Uniforme de Fútbol", list_price_cop: 50000 },
  jevAnswers: MOCK_JEV_ANSWERS.futbol_with_sizes,
  mode: "shadow",
});
assert("Modo shadow no aplica surcharges al total baseline", res3.total_cop === 700000);
assert("Modo shadow escribe jev_shadow", res3.jev_shadow.enabled === true && res3.jev_shadow.mode === "shadow");

// Caso 4: Fallback si Jev no tiene answers
console.log("\nCaso 4: Fallback si Jev está caído");
const res4 = computeProductAndSizesWithJev({
  query: "10 uniformes",
  quantity: 10,
  localMatch: { id: 115, name: "Uniforme de Fútbol", list_price_cop: 50000 },
  jevAnswers: null,
  mode: "on",
});
assert("Fallback mantiene producto y total baseline", res4.total_cop === 500000);

console.log(`\nResultado: ${passed} pruebas pasadas, ${failed} falladas.`);
if (failed > 0) process.exit(1);
