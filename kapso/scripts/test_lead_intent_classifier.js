#!/usr/bin/env node
/* Test local de classifyLeadIntent (3 capas) sin enviar WA. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "functions", "notify_sales_interest.js"), "utf8");

// Encontrar el inicio de la IIFE y su cierre balanceado.
const startMarker = "const { shouldSeedCrmOpportunity, seedCrmOpportunityFromQuote, classifyLeadIntent } = (() => {";
const start = src.indexOf(startMarker);
if (start < 0) { console.error("start marker not found"); process.exit(1); }
// El cierre es el primer "})();" después del start.
const end = src.indexOf("})();", start);
if (end < 0) { console.error("end marker not found"); process.exit(1); }

// Construir una expresión que exponga el objeto retornado en globalThis.
// Reemplazamos "const { ... } = (() => {" por "globalThis.__clf = (() => {" y cerramos igual.
const head = src.slice(start, start + startMarker.length).replace(
  "const { shouldSeedCrmOpportunity, seedCrmOpportunityFromQuote, classifyLeadIntent } = (() => {",
  "globalThis.__clf = (() => {"
);
const body = src.slice(start + startMarker.length, end);
const expr = head + body + "})();";

const sandbox = { console };
vm.createContext(sandbox);
try {
  vm.runInContext(expr, sandbox);
} catch (e) {
  console.error("vm error:", e.message);
  process.exit(1);
}
const api = sandbox.__clf;
if (!api || typeof api.classifyLeadIntent !== "function") {
  console.error("classifyLeadIntent not exposed; keys:", api && Object.keys(api));
  process.exit(1);
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { console.log("✓", name); pass++; }
  else { console.log("✗", name); fail++; }
}

const classify = (opts) => api.classifyLeadIntent(opts);

// 1. sales: qty>=6 + producto
check("sales: qty 8 + producto", classify({ quote: { product_text: "8 uniformes fútbol", quantity: 8, total_cop: 400000 } }) === "sales");
// 2. sales: aceptación clara + payload
check("sales: 'Dale' + abono", classify({ quote: { product_text: "uniforme", quantity: 6 }, lastCustomerText: "dale, me pasas el número para abono" }) === "sales");
// 3. needs_human: cliente pide asesor
check("needs_human: 'quisiera hablar con un asesor'", classify({ quote: {}, lastCustomerText: "si por favor. o quisiera hablar con un asesor" }) === "needs_human");
check("needs_human: 'me llame un asesor'", classify({ quote: {}, lastCustomerText: "por favor que me llame un asesor" }) === "needs_human");
check("needs_human: 'necesito hablar con alguien'", classify({ quote: {}, lastCustomerText: "necesito hablar con alguien de ventas" }) === "needs_human");
// 4. hot_lead_doubt: caliente pero sin qty>=6 ni aceptación/status cerrable (negociando diseño)
check("hot_lead: producto + media sin qty ni precio (cotizando)", classify({ quote: { product_text: "uniforme", media_refs: [{ summary: "diseño" }], status: "cotizando" } }) === "hot_lead_doubt");
// producto + precio + status interes_confirmado => es vendible (sales), no duda
check("sales: producto + precio + status interes_confirmado", classify({ quote: { product_text: "camisetas", unit_cop: 30000, status: "interes_confirmado" } }) === "sales");
// 5. none: consulta simple
check("none: solo pregunta precio", classify({ quote: { product_text: "uniforme" }, lastCustomerText: "a que precio sale" }) === "none");
check("none: prefill ads", classify({ quote: {}, lastCustomerText: "hola, quiero cotizar uniformes de" }) === "none");
check("none: follow-up contra entrega", classify({ quote: { product_text: "uniformes", quantity: 12, status: "interes_confirmado" }, lastCustomerText: "Y si se puede pagar contra entrega" }) === "none");
check("none: follow-up cuánto tiempo", classify({ quote: { product_text: "uniformes", quantity: 20 }, lastCustomerText: "En cuánto tiempo más o menos están listos?" }) === "none");
check("needs_human gana sobre follow-up", classify({ quote: { product_text: "uniformes", quantity: 10 }, lastCustomerText: "ya pagamos, quiero hablar con un asesor" }) === "needs_human");
// 6. needs_human gana sobre sales (pide asesor aunque haya qty)
check("needs_human gana sobre sales", classify({ quote: { product_text: "uniformes", quantity: 10 }, lastCustomerText: "quisiera hablar con un asesor" }) === "needs_human");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
