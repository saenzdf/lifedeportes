#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const defaultInput = path.join(projectRoot, "scratch/rule_classified.json");
const defaultOutput = path.join(projectRoot, "kapso/learning/out/conversations_anonymized.jsonl");

const PRODUCT_SIGNAL =
  /uniforme|camiseta|camisa|kit|conjunto|pantaloneta|short|media|arquero|portero|buzo|buso|hoodie|sudadera|peto|gorra|bandera|cotiz|precio|valor|f[uú]tbol|baloncesto|basket|volei|voley|atletismo|microf[uú]tbol|futsal|dumonti|dry.?fit|polo|manga|cuello|talla/i;

export function anonymizeText(value) {
  return String(value || "")
    .replace(
      /(?:https?:\/\/|www\.)\S+/gi,
      "[URL_REDACTED]"
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[EMAIL_REDACTED]"
    )
    .replace(
      /(?:\+?57[\s.-]?)?(?:3\d{2})[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
      "[PHONE_REDACTED]"
    )
    .replace(/\b\d{7,}\b/g, "[LONG_NUMBER_REDACTED]")
    .replace(
      /(?:image|audio|document|video|file)\s+attached[\s\S]*?(?=(?:\n|$))/gi,
      "[MEDIA_REDACTED]"
    )
    .replace(
      /\b(?:mi nombre es|soy|me llamo)\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúÑñ'-]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúÑñ'-]+){0,2}/gi,
      "[NAME_REDACTED]"
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function conversationRef(id, salt) {
  return crypto.createHmac("sha256", salt).update(String(id || "")).digest("hex").slice(0, 20);
}

export function buildAnonymizedCorpus(conversations, salt) {
  if (!salt) throw new Error("LIFE_LEARNING_SALT is required");
  const records = [];
  for (const conversation of conversations || []) {
    const messages = (conversation.history || [])
      .filter((message) => message?.sender === "Customer" && PRODUCT_SIGNAL.test(message?.text || ""))
      .map((message) => ({
        sender: "customer",
        text: anonymizeText(message.text),
        timestamp_day: message.timestamp
          ? new Date(Number(message.timestamp) * 1000).toISOString().slice(0, 10)
          : null,
      }))
      .filter((message) => message.text && !message.text.includes("[MEDIA_REDACTED]"));
    if (!messages.length) continue;
    records.push({
      schema_version: "life_learning_conversation_v1",
      conversation_ref: conversationRef(conversation.id, salt),
      messages,
      outcome_hint: conversation.is_successful_sale ? "possible_sale" : "unknown",
      labels: [],
    });
  }
  return records;
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputPath = path.resolve(argValue("--input", defaultInput));
  const outputPath = path.resolve(argValue("--output", defaultOutput));
  const salt = process.env.LIFE_LEARNING_SALT;
  if (!salt) {
    console.error("Set LIFE_LEARNING_SALT before building the anonymized corpus.");
    process.exit(1);
  }
  const conversations = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const records = buildAnonymizedCorpus(conversations, salt);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  console.log(`Wrote ${records.length} anonymized conversations to ${outputPath}`);
}
