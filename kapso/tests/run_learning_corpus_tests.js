#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  anonymizeText,
  buildAnonymizedCorpus,
  conversationRef,
} from "../scripts/build_learning_corpus.js";

const text =
  "Soy Carlos Pérez, mi teléfono es 3000000018, correo carlos@example.com. Quiero 10 camisetas https://example.com/foto";
const redacted = anonymizeText(text);
assert(!redacted.includes("3000000018"));
assert(!redacted.includes("carlos@example.com"));
assert(!redacted.includes("https://"));
assert(redacted.includes("10 camisetas"));

const firstRef = conversationRef("conversation-1", "test-salt");
assert.equal(firstRef, conversationRef("conversation-1", "test-salt"));
assert.notEqual(firstRef, conversationRef("conversation-2", "test-salt"));

const corpus = buildAnonymizedCorpus(
  [
    {
      id: "conversation-1",
      contact_name: "Carlos Pérez",
      phone: "3000000018",
      is_successful_sale: true,
      history: [
        { sender: "Customer", text, timestamp: 1780665908 },
        { sender: "LifeAgent", text: "Respuesta interna", timestamp: 1780665913 },
      ],
    },
  ],
  "test-salt"
);
assert.equal(corpus.length, 1);
assert.equal(corpus[0].messages.length, 1);
assert.equal(corpus[0].outcome_hint, "possible_sale");
assert(!JSON.stringify(corpus).includes("Carlos Pérez"));
assert(!JSON.stringify(corpus).includes("3000000018"));
console.log("learning corpus tests OK");
