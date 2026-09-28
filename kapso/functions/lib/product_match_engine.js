/**
 * Motor de match producto Life — catálogo semántico + scoring.
 * Usado por odoo_search_product_price (bundled) y tests locales.
 */

import {
  SPORT_DECLINED_TERMS,
  declinedSportReply,
} from "./commercial_policy.js";

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/dry-fit/g, "dry fit")
    .replace(/[.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SPORT_ALIASES = {
  futbol: ["futbol", "football", "soccer", "microfutbol", "micro futbol", "futsal", "futbol sala"],
  baloncesto: ["baloncesto", "basket", "basketball"],
  voleibol: ["voleibol", "voley", "volei", "volley", "volleyball"],
  atletismo: ["atletismo", "track", "pista", "manga sisa"],
};

function detectSport(text) {
  const t = normalizeText(text);
  for (const [sport, aliases] of Object.entries(SPORT_ALIASES)) {
    if (aliases.some((a) => t.includes(normalizeText(a)))) return sport;
  }
  for (const d of SPORT_DECLINED_TERMS) {
    if (t.includes(d)) return `declined:${d}`;
  }
  return null;
}

function detectGarmentType(text, explicit) {
  if (explicit) return explicit;
  const t = normalizeText(text);
  if (/\b(solo|solamente|unicamente)\s+(la\s+)?(camiseta|camisa)\b/.test(t)) return "camiseta_sola";
  if (/\buniformes?\b/.test(t)) return "uniforme_completo";
  if (/\b(conjunto|kit)\b/.test(t) && !/polo y pantalon/.test(t)) return "uniforme_completo";
  if (
    (/\bcamiseta\b|\bcamisa\b/.test(t) && /\bpantaloneta\b|\bshort\b|\bpantalonetas\b/.test(t)) ||
    /\buniforme\s+completo\b/.test(t)
  ) {
    return "uniforme_completo";
  }
  if (/\bcamisetas?\b|\bcamisas?\b/.test(t) && !/\buniforme\b/.test(t)) return "camiseta_sola";
  if (/\bpantaloneta\b|\bshort\b/.test(t)) return "pantaloneta";
  if (/\bmedia\b/.test(t)) return "medias";
  if (/\barquero\b|\bportero\b/.test(t)) return "arquero";
  if (/\brompevientos?\b|\bimpermeable\b/.test(t) && !/\bcamiseta\b|\bpantaloneta\b/.test(t))
    return "chaqueta";
  if (/\bchaquetas?\b/.test(t) && !/\bsudadera\b|\borion\b|\bbuzo\b/.test(t)) return "chaqueta";
  if (/\bsudadera\b|\bbuzo\b|\bbuso\b|\bhoodies?\b/.test(t) && !/\buniforme\b/.test(t))
    return "sudadera_conjunto";
  if (/\bpeto\b|\bpetos\b|\bpechera\b/.test(t)) return "peto";
  if (/\bgorra\b/.test(t)) return "gorra";
  if (/\bbandera\b/.test(t)) return "bandera";
  return null;
}

function inferCollar(text, explicit) {
  if (explicit) return explicit;
  const t = normalizeText(text);
  if (t.includes("polo") && t.includes("boton")) return "polo_con_botones";
  if (t.includes("polo")) return "polo_sin_botones";
  if (t.includes("cuello v") || t.includes("en v")) return "cuello_v";
  if (t.includes("cuello normal")) return "cuello_v";
  if (t.includes("redondo")) return "cuello_redondo";
  if (t.includes("sport")) return "cuello_sport";
  return null;
}

function inferSleeves(text, explicit) {
  if (explicit) return explicit;
  const t = normalizeText(text);
  if (t.includes("manga larga") || t.includes("manga largo")) return "manga_larga";
  if (t.includes("manga sisa") || t.includes("manga siza")) return "manga_sisa";
  if (t.includes("manga china")) return "manga_china";
  if (t.includes("manga corta") || t.includes("manga normal")) return "manga_corta";
  if (t.includes("ranglan") || t.includes("raglan")) return "ranglan";
  return null;
}

function inferMaterial(text, explicit) {
  if (explicit) return explicit;
  const t = normalizeText(text);
  if (t.includes("dumonti") || t.includes("falcao")) return "dumonti";
  if (t.includes("hidrotec")) return "hidrotec";
  if (t.includes("lluvia")) return "lluvia";
  if (t.includes("dry fit") || t.includes("dryfit")) return "dry_fit";
  return null;
}

function inferLining(text, explicit) {
  if (explicit) return explicit;
  const t = normalizeText(text);
  if (/\bcon\s+forro\b/.test(t)) return "con_forro";
  if (/\bsin\s+forro\b/.test(t)) return "sin_forro";
  return null;
}

/**
 * Variantes faltantes: explícito > texto del pedido > foto/referencia.
 * Si la persona lo pidió explícito, gana sobre la foto.
 * Si no hay pedido claro / no especificó, tomar de la foto.
 *
 * @param {{ explicit?: string|null, textBlob?: string, visualBlob?: string, infer: (blob: string, explicit: null) => string|null }} opts
 * @returns {{ value: string|null, source: 'explicit'|'text'|'photo'|null }}
 */
export function resolveVariantAttr({ explicit = null, textBlob = "", visualBlob = "", infer }) {
  if (explicit) return { value: explicit, source: "explicit" };
  const fromText = infer(String(textBlob || ""), null);
  if (fromText) return { value: fromText, source: "text" };
  const fromPhoto = infer(String(visualBlob || ""), null);
  if (fromPhoto) return { value: fromPhoto, source: "photo" };
  return { value: null, source: null };
}

function inferShortType(text, sport) {
  const t = normalizeText(text);
  if (t.includes("lycra")) return "lycra";
  if (t.includes("impermeable") || t.includes("microfutbol")) return "impermeable";
  if (t.includes("mariposa") || (sport === "baloncesto" && t.includes("baloncesto"))) return "mariposa";
  if (t.includes("bolsillo")) return "bolsillos";
  return "standard";
}

function materialAliases(material) {
  const m = normalizeText(material);
  if (!m) return [];
  if (m.includes("dumonti") || m.includes("falcao")) return ["dumonti", "falcao"];
  if (m.includes("dry")) return ["dry_fit"];
  return [m.replace(/\s+/g, "_")];
}

function productById(catalog, id) {
  return (catalog?.products || []).find((p) => p.odoo_id === id) || null;
}

function defaultProductForIntent(ctx, catalog) {
  const rules = catalog?.intent_defaults || [];
  const key = [
    ctx.garmentType || "",
    ctx.sport || "",
    ctx.collar || "",
    ctx.sleeves || "",
    ctx.shortType || "",
  ].join("|");
  for (const rule of rules) {
    if (rule.when_sport && ctx.sport !== rule.when_sport) continue;
    if (rule.when_garment && ctx.garmentType !== rule.when_garment) continue;
    if (rule.when_collar && ctx.collar !== rule.when_collar) continue;
    if (rule.when_text_includes?.length) {
      const t = normalizeText(ctx.combinedText);
      if (!rule.when_text_includes.every((x) => t.includes(normalizeText(x)))) continue;
    }
    const p = productById(catalog, rule.odoo_id);
    if (p) return { product: p, reason: rule.reason_es };
  }
  return null;
}

function scoreProduct(product, ctx, catalog) {
  let score = 0;
  const name = normalizeText(product.name);
  const combined = normalizeText(ctx.combinedText);
  const tokens = combined.split(" ").filter((t) => t.length > 2);

  const semantic = (catalog?.product_semantics || {})[String(product.odoo_id)] || {};
  if (semantic.requires_text?.length) {
    const missing = semantic.requires_text.every(
      (req) => !combined.includes(normalizeText(req))
    );
    if (missing) return 0;
  }
  const hasSinCapota = /\bsin\s+capota\b/.test(combined);
  for (const alias of semantic.aliases || []) {
    const a = normalizeText(alias);
    if (hasSinCapota && a.includes("capota")) continue;
    if (a && combined.includes(a)) score += 22;
  }

  if (combined && name.includes(combined)) score += 40;
  if (combined && name.length >= 8 && combined.includes(name)) score += 35;
  for (const token of tokens) {
    if (name.includes(token)) score += 6;
  }

  if (ctx.garmentType === "uniforme_completo" && product.category === "uniforme") score += 25;
  if (ctx.garmentType === "camiseta_sola" && product.category === "camiseta") score += 25;
  if (ctx.garmentType === "camiseta_sola" && product.category === "uniforme") score -= 20;
  if (ctx.garmentType === "uniforme_completo" && product.category === "camiseta") score -= 15;
  if (ctx.garmentType === "sudadera_conjunto") {
    if (name.includes("sudadera") || name.includes("buzo") || name.includes("buso") || name.includes("hoodie"))
      score += 30;
    if (hasSinCapota && name.includes("capota")) score -= 50;
    if (hasSinCapota && (name.includes("sudadera") || name.includes("algodon"))) score += 25;
    if (name.includes("pantalon") && !combined.includes("pantalon") && !name.includes("sudadera")) score -= 25;
    if (name.includes("arquero") && !combined.includes("arquero") && !combined.includes("portero"))
      score -= 50;
    if (product.commercial_role === "extra" && name.includes("chaqueta")) score -= 25;
    if (product.category === "uniforme") score -= 15;
  }
  if (ctx.garmentType === "chaqueta") {
    if (name.includes("chaqueta") && !name.includes("extra") && !name.includes("sudadera")) score += 38;
    if (name.includes("rompeviento") || name.includes("impermeable") || name.includes("lluvia")) score += 12;
    if (/\brompevientos?\b/.test(combined) && name.includes("rompeviento")) score += 40;
    if (/\brompevientos?\b/.test(combined) && name.includes("lotto")) score -= 35;
    if (name.includes("sudadera") && name.includes("pantalon")) score -= 35;
    if (product.category === "uniforme") score -= 25;
    if (product.category === "camiseta") score -= 15;
    const desc = normalizeText(product.description_sale || "");
    if (ctx.withLining === "con_forro" && desc.includes("forro")) score += 14;
    if (ctx.withLining === "sin_forro" && desc.includes("sin forro")) score += 10;
  }
  if (ctx.garmentType === "peto") {
    if (name.includes("peto")) score += 40;
    if (product.category === "uniforme" || product.category === "camiseta") score -= 25;
  }

  if (ctx.sport && (semantic.sports || []).includes(ctx.sport)) score += 18;
  if (ctx.sport === "futbol" && name.includes("futbol")) score += 20;
  if (ctx.sport && product.category === "uniforme" && name.includes(ctx.sport)) score += 15;
  if (ctx.sport === "futbol" && product.category === "uniforme" && !name.includes("futbol")) {
    score -= 10;
  }

  if (ctx.collar === "polo_sin_botones" && product.variant === "polo_sin_botones") score += 20;
  if (ctx.collar === "polo_sin_botones" && product.variant === "polo") score += 15;
  if (ctx.collar?.includes("polo") && name.includes("polo")) score += 15;

  if (ctx.sleeves === "manga_larga" && (name.includes("manga larga") || semantic.sleeves === "manga_larga"))
    score += 15;
  if (ctx.sleeves === "manga_sisa" && (name.includes("atletismo") || ctx.sport === "atletismo")) score += 12;
  if (ctx.sleeves === "manga_corta" && product.variant === "manga_corta") score += 12;

  if (ctx.material) {
    const mats = materialAliases(ctx.material);
    if (mats.includes(product.material) || (ctx.material === "dumonti" && name.includes("dumonti")))
      score += 12;
  }

  if (ctx.shortType === "lycra" && product.variant === "lycra") score += 18;
  if (ctx.shortType === "impermeable" && product.variant === "impermeable") score += 18;
  if (ctx.shortType === "bolsillos" && product.variant === "bolsillos") score += 18;

  for (const cue of ctx.visualCues || []) {
    const c = normalizeText(cue);
    if (c.includes("polo") && name.includes("polo")) score += 25;
    if (c.includes("manga larga") && name.includes("manga larga")) score += 15;
    if (c.includes("voleibol") && name.includes("voleibol")) score += 15;
    if (c.includes("baloncesto") && name.includes("baloncesto")) score += 15;
    if (c.includes("dry fit") && product.material === "dry_fit") score += 8;
  }

  if (semantic.garment_type && ctx.garmentType && semantic.garment_type === ctx.garmentType) score += 10;

  if (product.is_published) score += 10;

  return score;
}

function collectMissingDimensions(ctx) {
  const missing = [];
  if (!ctx.garmentType) missing.push("garment_type");
  if (ctx.garmentType === "uniforme_completo" && !ctx.sport) missing.push("sport");
  if (!ctx.quantityProvided) missing.push("quantity");
  return missing;
}

function buildClarifyingQuestion(ctx, top, second, missingDimensions) {
  if (missingDimensions.includes("garment_type")) {
    return "¿Qué prenda necesita: camiseta, uniforme completo u otra?";
  }
  if (missingDimensions.includes("sport")) {
    return "¿Para qué deporte necesita el uniforme?";
  }
  if (missingDimensions.includes("quantity")) {
    return "¿Cuántas unidades necesita?";
  }
  if (
    ctx.garmentType === "camiseta_sola" &&
    /\bcamisetas?\b|\bcamisas?\b/.test(normalizeText(ctx.productText)) &&
    !/\buniforme\b/.test(normalizeText(ctx.productText))
  ) {
    return null;
  }
  if (ctx.garmentType === "camiseta_sola" && ctx.sport === "futbol") {
    return null;
  }
  if (ctx.collar?.includes("polo") && ctx.garmentType !== "uniforme_completo" && ctx.garmentType !== "camiseta_sola") {
    return "¿La operaria pide camiseta polo sola o uniforme completo con cuello polo?";
  }
  if (top && second && top.score - second.score < 8) {
    return `¿Confirma ${top.product.name} o prefiere ${second.product.name}?`;
  }
  return null;
}

function confidenceFromScores(top, second) {
  if (!top) return "none";
  if (top.score >= 45 && (!second || top.score - second.score >= 12)) return "high";
  if (top.score >= 28 && (!second || top.score - second.score >= 8)) return "medium";
  return "low";
}

/**
 * @param {object} input
 * @param {object} catalog — life_catalog_semantic_v1 (+ products from cache)
 */
export function matchProduct(input, catalog) {
  const productText = String(input.product_text || "").trim();
  const variantNotes = String(input.variant_notes || input.comments || "").trim();
  const textBlob = [productText, variantNotes].filter(Boolean).join(" ");
  const visualHints = []
    .concat(input.visual_hints || [], input.photo_description || [], input.reference_notes || [])
    .map(String)
    .filter(Boolean);
  const visualBlob = visualHints.join(" ");
  // combined = texto + foto (para deporte / scoring amplio); attrs usan prioridad.
  const combinedText = [textBlob, visualBlob].filter(Boolean).join(" ");

  const sportRaw =
    input.sport ||
    detectSport(textBlob) ||
    detectSport(visualBlob) ||
    detectSport(combinedText) ||
    null;
  if (sportRaw?.startsWith("declined:")) {
    const sport_detected = sportRaw.replace("declined:", "");
    const customer_reply_es = declinedSportReply(sport_detected);
    return {
      ok: false,
      found: false,
      sport_declined: true,
      sport_detected,
      do_not_search: true,
      message_es: customer_reply_es,
      customer_reply_es,
      agent_hint_es:
        "Política clara: responde ya con customer_reply_es. Prohibido cotizar, buscar_producto_odoo o posponer con el equipo.",
      match_confidence: "none",
      alternatives: [],
    };
  }

  const garmentRes = resolveVariantAttr({
    explicit: input.garment_type || null,
    textBlob,
    visualBlob,
    infer: (blob) => detectGarmentType(blob, null),
  });
  const collarRes = resolveVariantAttr({
    explicit: input.collar || null,
    textBlob,
    visualBlob,
    infer: (blob) => inferCollar(blob, null),
  });
  const sleevesRes = resolveVariantAttr({
    explicit: input.sleeves || null,
    textBlob,
    visualBlob,
    infer: (blob) => inferSleeves(blob, null),
  });
  const materialRes = resolveVariantAttr({
    explicit: input.material || null,
    textBlob,
    visualBlob,
    infer: (blob) => inferMaterial(blob, null),
  });
  const liningRes = resolveVariantAttr({
    explicit: input.with_lining || input.lining || null,
    textBlob,
    visualBlob,
    infer: (blob) => inferLining(blob, null),
  });

  const ctx = {
    productText,
    combinedText,
    quantity: Math.max(1, Number(input.quantity || 1)),
    quantityProvided:
      input.quantity !== undefined &&
      input.quantity !== null &&
      String(input.quantity).trim() !== "",
    sport: sportRaw,
    garmentType: garmentRes.value,
    collar: collarRes.value,
    sleeves: sleevesRes.value,
    material: materialRes.value || "dry_fit",
    withLining: liningRes.value,
    shortType: inferShortType(textBlob || visualBlob, sportRaw),
    visualCues: visualHints,
    attr_sources: {
      garment: garmentRes.source,
      collar: collarRes.source,
      sleeves: sleevesRes.source,
      material: materialRes.source || (materialRes.value ? null : null),
      lining: liningRes.source,
    },
  };
  if (!materialRes.value) ctx.attr_sources.material = materialRes.source || "default";

  const products = catalog?.products || [];
  let scored = products
    .map((product) => ({ product, score: scoreProduct(product, ctx, catalog) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.product.list_price_cop - b.product.list_price_cop);

  const defaultPick = defaultProductForIntent(ctx, catalog);
  if (defaultPick && (!scored[0] || scored[0].score < 30)) {
    scored = [{ product: defaultPick.product, score: 38, reason: defaultPick.reason }, ...scored];
  }

  const top = scored[0] || null;
  const second = scored[1] || null;
  const match_confidence = confidenceFromScores(top, second);
  const missing_dimensions = collectMissingDimensions(ctx);
  const clarifying_question = buildClarifyingQuestion(ctx, top, second, missing_dimensions);

  function fmtAttr(label, value, source) {
    if (!value) return null;
    const src =
      source === "photo"
        ? " (foto)"
        : source === "explicit"
          ? " (explícito)"
          : source === "text"
            ? ""
            : source === "default"
              ? " (default)"
              : "";
    return `${label}: ${String(value).replace(/_/g, " ")}${src}`;
  }

  const interpretationParts = [
    ctx.sport ? `deporte: ${ctx.sport}` : null,
    fmtAttr("tipo", ctx.garmentType, ctx.attr_sources.garment),
    fmtAttr("cuello", ctx.collar, ctx.attr_sources.collar),
    fmtAttr("manga", ctx.sleeves, ctx.attr_sources.sleeves),
    fmtAttr("tela", ctx.material, ctx.attr_sources.material),
    fmtAttr("forro", ctx.withLining, ctx.attr_sources.lining),
  ].filter(Boolean);

  const alternatives = scored.slice(0, 5).map((row, idx) => ({
    rank: idx + 1,
    odoo_id: row.product.odoo_id,
    name: row.product.name,
    list_price_cop: row.product.list_price_cop,
    score: row.score,
    reason_es: row.reason || null,
  }));
  const candidates = alternatives.slice(0, 3);

  if (!top) {
    return {
      ok: true,
      found: false,
      match_confidence: "none",
      interpretation_es: interpretationParts.length
        ? `Entendí ${interpretationParts.join(", ")} pero no encontré producto Odoo cercano.`
        : "No encontré producto cercano en catálogo.",
      clarifying_question:
        buildClarifyingQuestion(ctx, null, null, missing_dimensions) ||
        "¿Cómo describe la prenda que necesita?",
      missing_dimensions,
      parsed: ctx,
      attr_sources: ctx.attr_sources,
      candidates: [],
      alternatives: [],
    };
  }

  return {
    ok: true,
    found: true,
    match_confidence,
    odoo_id: top.product.odoo_id,
    odoo_template_id: top.product.odoo_id,
    match_name: top.product.name,
    name: top.product.name,
    category: top.product.category,
    variant: top.product.variant,
    commercial_role: top.product.commercial_role,
    list_price_cop: top.product.list_price_cop,
    unit_cop: top.product.list_price_cop,
    total_cop: top.product.list_price_cop * ctx.quantity,
    interpretation_es: `Propongo: ${top.product.name}${interpretationParts.length ? ` (${interpretationParts.join("; ")})` : ""}.`,
    clarifying_question,
    missing_dimensions,
    parsed: ctx,
    attr_sources: ctx.attr_sources,
    candidates,
    alternatives: alternatives.filter((a) => a.odoo_id !== top.product.odoo_id).slice(0, 4),
  };
}
