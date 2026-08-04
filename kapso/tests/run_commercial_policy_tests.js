#!/usr/bin/env node
import assert from "assert";
import {
  detectFaqPolicyIntent,
  declinedSportReply,
  FIXED_REPLIES,
} from "../functions/lib/commercial_policy.js";
import { matchProduct } from "../functions/lib/product_match_engine.js";
import { parseQuoteIntent } from "../functions/lib/quote_intent_parser.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../catalog/life_catalog_semantic_v1.json"), "utf8")
);

function ok(name) {
  console.log("✓", name);
}

assert.equal(detectFaqPolicyIntent("hay descuento por 11?").intent, "descuento");
assert.equal(detectFaqPolicyIntent("dónde están?").intent, "direccion");
assert.equal(detectFaqPolicyIntent("me manda el catálogo").intent, "catalogo");
assert.equal(detectFaqPolicyIntent("cómo pago / transferencia").intent, "pago");
assert.equal(detectFaqPolicyIntent("hacen envíos nacionales?").intent, "envios");
assert.equal(detectFaqPolicyIntent("puedo poner logo Nike?").intent, "logo_marca_ropa");
assert.equal(
  detectFaqPolicyIntent("qué incluye el uniforme?").customer_reply_es,
  FIXED_REPLIES.uniforme_incluye
);
ok("FAQ intents detectados");

const ciclismo = matchProduct({ product_text: "uniforme de ciclismo", quantity: 10 }, catalog);
assert.equal(ciclismo.sport_declined, true);
assert.ok(ciclismo.customer_reply_es.includes("ciclismo"));
assert.ok(ciclismo.do_not_search);
ok("match ciclismo → customer_reply_es fija");

const moto = matchProduct({ product_text: "uniformes motociclismo", quantity: 8 }, catalog);
assert.equal(moto.sport_declined, true);
ok("match motociclismo declined");

assert.ok(declinedSportReply("natacion").includes("natación"));

const faqIntent = parseQuoteIntent({ message_text: "hay descuento por cantidad?" }, catalog);
assert.equal(faqIntent.faq_policy_intent, "descuento");
assert.equal(faqIntent.ready_for_buscar_producto, false);
assert.equal(faqIntent.customer_reply_es, FIXED_REPLIES.descuento);
ok("parseQuoteIntent descuento → no buscar");

const declinedIntent = parseQuoteIntent(
  { message_text: "quiero 12 uniformes de ciclismo" },
  catalog
);
assert.equal(declinedIntent.sport_declined, true);
assert.equal(declinedIntent.ready_for_buscar_producto, false);
assert.ok(declinedIntent.customer_reply_es.includes("ciclismo"));
ok("parseQuoteIntent ciclismo → no buscar + frase");

console.log("All commercial_policy / FAQ reinforcement tests passed.");
