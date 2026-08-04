#!/usr/bin/env node
/**
 * Minería de frases de producto en conversaciones Kapso (rule_classified.json).
 * Uso: node scratch/analyze_kapso_product_phrases.js [--json]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "rule_classified.json");

if (!fs.existsSync(dataPath)) {
  console.error("Missing", dataPath, "— run rule_classifier.js first");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const asJson = process.argv.includes("--json");

const productKw =
  /uniforme|camiseta|camisa|kit|conjunto|pantaloneta|short|media|arquero|portero|buzo|buso|hoodie|sudadera|peto|gorra|bandera|cotiz|precio|cuanto|cuánto|futbol|fútbol|baloncesto|basket|volei|voley|atletismo|microfutbol|futsal|dumonti|dry.?fit|polo|manga/i;

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u0300-\u036f/g, "")
    .trim();
}

const stats = {
  conversations: data.length,
  customer_messages: 0,
  product_messages: 0,
  unique_stems: new Set(),
  sports: { futbol: 0, baloncesto: 0, voleibol: 0, atletismo: 0, other: 0 },
  intents: {
    uniforme: 0,
    camiseta_ambigua: 0,
    cotizar: 0,
    precio_directo: 0,
    visual: 0,
    arquero: 0,
    buzo_peto: 0,
  },
};

const buckets = {
  apertura_cotizar: [],
  deporte_explicito: [],
  cantidad: [],
  solo_pieza: [],
  uniforme_completo: [],
  variante_tecnica: [],
  precio_directo: [],
  referencia_visual: [],
  arquero_mix: [],
  otros_productos: [],
  ambiguo_camiseta: [],
};

function add(bucket, text) {
  const t = String(text).replace(/\n/g, " ").trim();
  if (!t || t.length < 6) return;
  if (buckets[bucket].length < 20) buckets[bucket].push(t.slice(0, 220));
  const stem = norm(t).slice(0, 55);
  stats.unique_stems.add(stem);
}

for (const conv of data) {
  for (const msg of conv.history || []) {
    if (msg.sender !== "Customer") continue;
    stats.customer_messages++;
    const raw = msg.text || "";
    if (!productKw.test(raw)) continue;
    stats.product_messages++;
    const n = norm(raw);

    if (/futbol|microfutbol|futsal/.test(n)) stats.sports.futbol++;
    else if (/baloncesto|basket/.test(n)) stats.sports.baloncesto++;
    else if (/volei|voley/.test(n)) stats.sports.voleibol++;
    else if (/atletismo/.test(n)) stats.sports.atletismo++;
    else if (/futbol|baloncesto|volei|atletismo/.test(n)) stats.sports.other++;

    if (/\buniforme\b/.test(n)) stats.intents.uniforme++;
    if (/\bcamiseta\b|\bcamisa\b/.test(n) && !/\buniforme\b/.test(n))
      stats.intents.camiseta_ambigua++;
    if (/cotiz/.test(n)) stats.intents.cotizar++;
    if (/cuanto|precio|valor|costo|sale/.test(n) && !/cotiz/.test(n))
      stats.intents.precio_directo++;
    if (/image attached|audio attached|foto|imagen|como la foto/.test(n))
      stats.intents.visual++;
    if (/arquero|portero/.test(n)) stats.intents.arquero++;
    if (/buzo|buso|hoodie|peto/.test(n)) stats.intents.buzo_peto++;

    if (/^hola.*cotizar/i.test(raw)) add("apertura_cotizar", raw);
    if (/futbol|baloncesto|basket|volei|voley|atletismo|tenis|microfutbol/i.test(raw))
      add("deporte_explicito", raw);
    if (/\d+\s*(uniforme|camiseta|unidad|kit|peto|buzo)/i.test(raw) || /\d+\s+de\s+campo/i.test(raw))
      add("cantidad", raw);
    if (/solo\s+(camiseta|camisa|la camiseta|pantaloneta|short|medias)/i.test(raw))
      add("solo_pieza", raw);
    if (/uniforme\s+completo|camisa\s+y\s+pantaloneta|kit\s+completo|camiseta\s+y\s+pantaloneta/i.test(raw))
      add("uniforme_completo", raw);
    if (/manga|cuello|polo|dry.?fit|dumonti|lycra|impermeable|mariposa|tela|material|gramaje/i.test(raw))
      add("variante_tecnica", raw);
    if (/cuanto|precio|valor|costo|sale|saldr/i.test(raw) && !/cotizar/i.test(raw))
      add("precio_directo", raw);
    if (/image attached|audio attached|foto|imagen|como la foto|tal cual/i.test(raw))
      add("referencia_visual", raw);
    if (/arquero|portero/i.test(raw)) add("arquero_mix", raw);
    if (/peto|buzo|buso|hoodie|gorra|bandera|sudadera/i.test(raw)) add("otros_productos", raw);
    if (/\bcamiseta\b|\bcamisa\b/i.test(raw) && !/\buniforme\b/i.test(raw))
      add("ambiguo_camiseta", raw);
  }
}

for (const k of Object.keys(buckets)) {
  buckets[k] = [...new Set(buckets[k])];
}

const report = {
  stats: {
    ...stats,
    unique_stems: stats.unique_stems.size,
  },
  buckets,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Conversations:", report.stats.conversations);
  console.log("Product-related customer messages:", report.stats.product_messages);
  console.log("Unique phrase stems:", report.stats.unique_stems);
  console.log("Sports mentions:", report.stats.sports);
  console.log("Intents:", report.stats.intents);
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`\n## ${k} (${v.length})`);
    v.slice(0, 6).forEach((s) => console.log(" -", s.replace(/\s+/g, " ").slice(0, 120)));
  }
}
