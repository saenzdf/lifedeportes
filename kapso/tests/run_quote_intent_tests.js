#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseQuoteIntent, extractTranscript, validateTranscript } from "../functions/lib/quote_intent_parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../catalog/life_catalog_semantic_v1.json"), "utf8")
);

let passed = 0;
let failed = 0;

function ok(n) {
  console.log("✓", n);
  passed++;
}
function fail(n, d) {
  console.log("✗", n, d || "");
  failed++;
}
function assert(n, c, d) {
  if (c) ok(n);
  else fail(n, d);
}

assert("extract transcript", extractTranscript("Audio x\nTranscript: hola 12 camisetas")?.includes("12"));
assert("junk transcript", !validateTranscript("[ruido]").valid);
assert("valid transcript", validateTranscript("quiero uniformes de futbol").valid);

const camiseta = parseQuoteIntent({ message_text: "10 camisetas de futbol" }, catalog);
assert("camiseta futbol → sola", camiseta.parsed_intent?.garmentType === "camiseta_sola");
assert("camiseta fase 3", camiseta.phase === 3 && camiseta.ready_for_buscar_producto);

const uniforme = parseQuoteIntent({ message_text: "20 uniformes de futbol" }, catalog);
assert("uniforme → completo", uniforme.parsed_intent?.garmentType === "uniforme_completo");

const junk = parseQuoteIntent({ raw_message: "Audio\nTranscript: [phone ringing]" }, catalog);
assert("junk → pregunta", Boolean(junk.suggested_customer_question));

const polo = parseQuoteIntent(
  {
    message_text: "8 camisetas",
    visual_hints: ["cuello polo sin botones"],
    quantity: 8,
  },
  catalog
);
assert("polo hints", polo.ready_for_buscar_producto);
assert("buscar input", polo.buscar_producto_odoo_input?.product_text);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
