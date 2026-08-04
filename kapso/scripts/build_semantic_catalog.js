#!/usr/bin/env node
/** Genera kapso/catalog/life_catalog_semantic_v1.json desde catalog_cache.json */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cache = JSON.parse(fs.readFileSync(path.join(root, "catalog_cache.json"), "utf8"));

const product_semantics = {
  "62": {
    garment_type: "camiseta_sola",
    sports: ["futbol", "baloncesto", "voleibol"],
    aliases: [
      "camiseta",
      "camisa",
      "camisetas",
      "camiseta de futbol",
      "camiseta futbol",
      "camiseta normal",
      "camiseta dry fit",
      "camiseta manga corta",
      "camiseta deportiva",
    ],
    operator_label: "Camiseta dry-fit manga corta (sola)",
  },
  "61": {
    garment_type: "camiseta_sola",
    aliases: ["camiseta polo", "polo sin botones", "cuello polo camiseta", "camiseta tipo polo"],
    collar: "polo_sin_botones",
    operator_label: "Camiseta cuello polo sin botones",
  },
  "685": {
    garment_type: "camiseta_sola",
    material: "dumonti",
    aliases: ["camiseta dumonti", "camiseta falcao", "camiseta premium"],
    operator_label: "Camiseta Dumonti / Falcao",
  },
  "115": {
    garment_type: "uniforme_completo",
    sports: ["futbol"],
    aliases: [
      "uniforme de futbol",
      "uniforme futbol",
      "kit futbol",
      "uniforme completo futbol",
      "uniforme microfutbol",
      "uniforme manga corta",
      "uniformes manga corta dry fit",
      "uniforme generico",
      "uniforme impermeable",
      "pantaloneta impermeable uniforme",
      "microfutbol uniforme",
      "uniforme bolsillos",
      "pantaloneta con bolsillos",
    ],
    operator_label:
      "Uniforme completo fútbol (camiseta + pantaloneta + medias semi). Variantes Odoo: manga larga +3k, cuello sport +3k, pant. impermeable +8k, pant. bolsillos +5k, Dumonti +15k, medias pro +7k",
  },
  "23": {
    garment_type: "uniforme_completo",
    sports: ["baloncesto"],
    aliases: ["uniforme baloncesto", "uniforme basketball", "short mariposa"],
    short_style: "mariposa",
    operator_label: "Uniforme baloncesto",
  },
  "31": {
    garment_type: "uniforme_completo",
    sports: ["voleibol"],
    aliases: ["uniforme voleibol", "short lycra voleibol"],
    short_style: "lycra",
    operator_label: "Uniforme voleibol",
  },
  "35": {
    garment_type: "uniforme_completo",
    sports: ["atletismo"],
    sleeves: "manga_sisa",
    aliases: ["uniforme atletismo", "manga sisa", "atletismo"],
    operator_label: "Uniforme atletismo (manga sisa)",
  },
  "1797": {
    garment_type: "camiseta_sola",
    material: "lluvia",
    aliases: ["camiseta lluvia", "camiseta de lluvia", "camiseta impermeable"],
    operator_label: "Camiseta deportiva lluvia",
  },
  "1818": {
    garment_type: "uniforme_completo",
    material: "dumonti",
    aliases: ["uniforme dumonti", "uniforme falcao", "uniforme premium", "uniforme tela dumonti"],
    operator_label: "Uniforme Deportivo Dumonti",
  },
  "1819": {
    garment_type: "uniforme_completo",
    aliases: ["uniforme con bordado", "bordado incluido"],
    operator_label: "Uniforme con bordado incluido",
  },
  "8": {
    garment_type: "uniforme_completo",
    aliases: ["uniforme presentacion", "uniforme de presentacion"],
    operator_label: "Uniforme de presentación",
  },
  "178": {
    garment_type: "arquero",
    aliases: ["conjunto arquero", "uniforme arquero", "portero"],
    operator_label: "Conjunto arquero",
  },
  "113": {
    garment_type: "medias",
    aliases: ["medias semi", "medias semiprofesionales"],
    operator_label: "Medias semi",
  },
  "1807": {
    garment_type: "medias",
    aliases: ["medias pro", "medias profesionales"],
    operator_label: "Medias profesionales",
  },
  "1808": {
    garment_type: "pantaloneta",
    aliases: ["pantaloneta", "short", "pantaloneta standard"],
    operator_label: "Pantaloneta estándar",
  },
  "1188": {
    garment_type: "pantaloneta",
    aliases: ["pantaloneta lycra", "short lycra"],
    operator_label: "Pantaloneta lycra",
  },
  "1809": {
    garment_type: "pantaloneta",
    aliases: ["pantaloneta impermeable", "short impermeable"],
    operator_label: "Pantaloneta impermeable",
  },
  "1811": {
    garment_type: "sudadera_conjunto",
    aliases: ["hoodie", "hoodies", "sudadera algodon", "sudadera con bordado", "sudadera lycrada"],
    operator_label: "Sudadera algodón lycrado con bordados",
  },
  "1795": {
    garment_type: "sudadera_conjunto",
    aliases: ["buso con capota", "buzo con capota", "buso capota", "hoodie con capota", "capota"],
    operator_label: "Buso con capota (Lotto)",
  },
  "66": {
    garment_type: "sudadera_conjunto",
    aliases: ["sudadera orion", "sudadera completa", "chaqueta y pantalon", "conjunto sudadera"],
    operator_label: "Sudadera Chaqueta y Pantalón Orión",
  },
  "68": {
    garment_type: "chaqueta",
    aliases: [
      "rompevientos",
      "rompeviento",
      "chaqueta rompevientos",
      "chaqueta rompeviento",
      "impermeable",
      "chompa lluvia",
      "chaqueta impermeable",
    ],
    operator_label: "Chaqueta Rompevientos (= rompevientos). No confundir con Chaqueta Lotto",
  },
  "69": {
    garment_type: "peto",
    aliases: ["peto", "petos", "pechera", "peto sublimado", "petos sublimados"],
    operator_label: "Peto sublimado Life",
  },
  "1800": {
    garment_type: "chaqueta",
    aliases: ["chaqueta lotto", "algodon lotto", "chaqueta algodon"],
    operator_label: "Chaqueta Lotto (distinta de rompevientos)",
  },
};

const intent_defaults = [
  {
    when_sport: "futbol",
    when_garment: "uniforme_completo",
    odoo_id: 115,
    reason_es: "Uniforme fútbol dry-fit por defecto",
  },
  {
    when_sport: "futbol",
    when_garment: "camiseta_sola",
    odoo_id: 62,
    reason_es: "Camiseta dry-fit manga corta (sola) para fútbol",
  },
  {
    when_sport: "baloncesto",
    when_garment: "uniforme_completo",
    odoo_id: 23,
    reason_es: "Uniforme baloncesto por defecto",
  },
  {
    when_sport: "voleibol",
    when_garment: "uniforme_completo",
    odoo_id: 31,
    reason_es: "Uniforme voleibol por defecto",
  },
  {
    when_sport: "atletismo",
    when_garment: "uniforme_completo",
    odoo_id: 35,
    reason_es: "Uniforme atletismo manga sisa",
  },
  {
    when_garment: "camiseta_sola",
    when_text_includes: ["polo"],
    odoo_id: 61,
    reason_es: "Camiseta polo sin botones por mención de polo",
  },
  {
    when_garment: "uniforme_completo",
    when_text_includes: ["polo"],
    odoo_id: 8,
    reason_es: "Uniforme de Presentación (Futbol polo) — único uniforme cuello polo publicado",
  },
  {
    when_garment: "uniforme_completo",
    when_text_includes: ["dumonti", "falcao"],
    odoo_id: 1818,
    reason_es: "Uniforme Deportivo Dumonti (tela premium)",
  },
  {
    when_garment: "chaqueta",
    when_text_includes: ["rompeviento"],
    odoo_id: 68,
    reason_es: "Rompevientos = Chaqueta Rompevientos (68), no Lotto",
  },
  {
    when_garment: "chaqueta",
    when_text_includes: ["lotto"],
    odoo_id: 1800,
    reason_es: "Chaqueta Lotto explícita",
  },
  {
    when_garment: "chaqueta",
    odoo_id: 68,
    reason_es: "Chaqueta genérica → Rompevientos (68) por defecto; Lotto solo si lo nombran",
  },
  {
    when_garment: "peto",
    odoo_id: 69,
    reason_es: "Peto sublimado publicado",
  },
];

const products = cache.products.map((product) =>
  product.category === "camiseta"
    ? {
        ...product,
        commercial_role: "base_product",
        min_qty_standalone: 6,
        allow_without_base: true,
      }
    : product
);

const out = {
  schema_version: "life_catalog_semantic_v1",
  synced_at: cache.synced_at,
  sports_allowed: ["futbol", "baloncesto", "voleibol", "atletismo"],
  sports_declined_examples: [
    "natación",
    "ciclismo",
    "béisbol",
    "hockey",
    "patinaje",
    "motocross",
    "porras",
  ],
  garment_types: {
    uniforme_completo: "Camiseta + pantaloneta (+ medias en fútbol base)",
    camiseta_sola: "Solo camiseta; producto base vendible desde 6 u. del mismo producto/diseño",
    pantaloneta: "Short / pantaloneta suelta",
    medias: "Medias",
    arquero: "Prendas o conjunto arquero",
    sudadera_conjunto: "Sudaderas, buzos, hoodies (no rompevientos)",
    chaqueta: "Chaqueta Rompevientos (68) o Chaqueta Lotto (1800)",
    peto: "Peto sublimado (69)",
  },
  variant_dimensions: {
    collar: ["cuello_v", "cuello_redondo", "polo_sin_botones", "polo_con_botones", "cuello_sport"],
    sleeves: ["manga_corta", "manga_larga", "manga_sisa", "ranglan"],
    material: ["dry_fit", "dumonti", "hidrotec", "lluvia"],
    short_style: ["standard", "lycra", "impermeable", "mariposa", "bolsillos"],
  },
  commercial_rules: {
    ...cache.commercial_rules,
    standalone_product_min_qty: 6,
    standalone_base_role: "base_product",
  },
  families: cache.families,
  products,
  product_semantics,
  intent_defaults,
  colloquial_examples: [
    {
      phrase: "camiseta de futbol",
      likely: "Camiseta dry-fit sola (62) — no preguntar por uniforme",
    },
    {
      phrase: "camiseta normal + foto polo",
      likely: "Camiseta polo sin botones (61) o uniforme polo (947)",
    },
    { phrase: "10 uniformes voleibol", likely: "Uniforme de voleibol (31)" },
    { phrase: "rompevientos", likely: "Chaqueta Rompevientos (68) — no Lotto" },
    { phrase: "petos", likely: "Peto sublimado (69)" },
    { phrase: "natación", likely: "Deporte no ofrecido — rechazar" },
  ],
};

const outPath = path.join(root, "catalog/life_catalog_semantic_v1.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log("Wrote", outPath, "products:", out.products.length);
