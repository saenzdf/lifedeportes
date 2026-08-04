/**
 * Parser determinístico de intención de cotización (texto, transcript, pistas visuales).
 * Usado por interpret-quote-intent (Kapso) y tests locales.
 * Reglas de negocio codificadas — el LLM no debe re-inventarlas.
 */

import {
  normalizeText,
  matchProduct,
} from "./product_match_engine.js";
import { detectFaqPolicyIntent, declinedSportReply } from "./commercial_policy.js";

const JUNK_TRANSCRIPT = [
  "[ruido]",
  "[background noise]",
  "[phone ringing]",
  "[outro jingle]",
  "[music]",
  "[silence]",
];

const TRANSCRIPT_PREFIX = /transcript:\s*/i;

/** Extrae transcript del bloque de mensaje Kapso (audio). */
export function extractTranscript(rawMessage) {
  const raw = String(rawMessage || "");
  const idx = raw.search(/transcript:/i);
  if (idx < 0) return null;
  const after = raw.slice(idx).replace(TRANSCRIPT_PREFIX, "").trim();
  const cut = after.split(/\n\n|audio attached/i)[0];
  return cut.trim() || null;
}

export function validateTranscript(transcript) {
  const t = String(transcript || "").trim();
  if (!t) {
    return { status: "absent", confidence: "none", valid: false };
  }
  const lower = t.toLowerCase();
  if (JUNK_TRANSCRIPT.some((j) => lower.includes(j))) {
    return { status: "junk", confidence: "junk", valid: false };
  }
  if (t.length < 4) {
    return { status: "junk", confidence: "low", valid: false };
  }
  return { status: "valid", confidence: "high", valid: true };
}

function extractQuantity(text) {
  const t = normalizeText(text);
  const m =
    t.match(/(\d+)\s*(uniforme|camiseta|camisa|unidad|u\b|kit|hoodie|buzo|peto)/) ||
    t.match(/(\d+)\s+de\s+campo/);
  if (m) return Math.max(1, parseInt(m[1], 10));
  const docena = /\bdocena\b/.test(t) ? 12 : null;
  return docena;
}

function inferPhase(parsed, quantity, sportDeclined) {
  if (sportDeclined) return 1;
  if (!parsed?.garmentType && !parsed?.productText) return 1;
  if (!quantity || quantity < 6) return 1;
  if (parsed.garmentType && quantity >= 6) return 3;
  return 2;
}

/**
 * @param {object} input
 * @param {string} [input.message_text] — texto escrito del cliente
 * @param {string} [input.transcript] — transcript Kapso (audio)
 * @param {string} [input.raw_message] — mensaje completo (extrae Transcript si falta)
 * @param {string} [input.photo_description] — salida ask_about_file
 * @param {string[]} [input.visual_hints]
 * @param {number} [input.quantity]
 */
export function parseQuoteIntent(input = {}, catalog = null) {
  const rawMessage = input.raw_message || "";
  let transcript = input.transcript ?? extractTranscript(rawMessage);
  const transcriptCheck = transcript ? validateTranscript(transcript) : { status: "absent", valid: false };

  const textParts = [
    input.message_text,
    transcriptCheck.valid ? transcript : null,
  ].filter(Boolean);
  const productText = textParts.join(" ").trim();

  const visualHints = []
    .concat(input.visual_hints || [], input.photo_description || [])
    .map(String)
    .filter(Boolean);

  const faqPolicy = detectFaqPolicyIntent(productText);
  // FAQ clara sin intención de producto → respuesta fija; no armar buscar_producto.
  if (faqPolicy && !visualHints.length) {
    const looksLikeProduct =
      /\b(uniforme|camiseta|camisa|peto|rompeviento|chaqueta|sudadera|buzo|hoodie|cotiz|precio|cuanto)\b/i.test(
        productText
      );
    if (!looksLikeProduct || faqPolicy.intent === "descuento" || faqPolicy.intent === "logo_marca_ropa") {
      return {
        ok: true,
        phase: 1,
        transcript_status: transcriptCheck.status,
        transcript_valid: transcriptCheck.valid,
        product_text_combined: productText,
        visual_hints: visualHints,
        quantity: null,
        parsed_intent: {},
        sport_declined: false,
        faq_policy_intent: faqPolicy.intent,
        customer_reply_es: faqPolicy.customer_reply_es,
        do_not_search: true,
        missing_fields: [],
        ready_for_buscar_producto: false,
        buscar_producto_odoo_input: null,
        suggested_customer_question: faqPolicy.customer_reply_es,
        preview_match: null,
      };
    }
  }

  const quantity =
    Number(input.quantity) > 0
      ? Number(input.quantity)
      : extractQuantity(productText) || null;

  const preview = catalog
    ? matchProduct(
        {
          product_text: productText || visualHints.join(" ") || "referencia",
          quantity: quantity || 6,
          visual_hints: visualHints,
          sport: input.sport || null,
          garment_type: input.garment_type || null,
          collar: input.collar || null,
          sleeves: input.sleeves || null,
          material: input.material || null,
        },
        catalog
      )
    : null;

  const parsed = preview?.parsed || {};
  const sportDeclined = Boolean(preview?.sport_declined);
  const phase = inferPhase(parsed, quantity, sportDeclined);

  const missing = [];
  if (transcript && !transcriptCheck.valid && !productText.replace(transcript, "").trim()) {
    missing.push("transcript_claro");
  }
  if (!parsed.garmentType && !visualHints.length) missing.push("tipo_prenda");
  if (!quantity) missing.push("quantity");
  else if (quantity < 6) missing.push("quantity_min_6");
  if (sportDeclined) missing.push("deporte_no_fabricado");

  const readyForSearch =
    phase === 3 &&
    !sportDeclined &&
    quantity >= 6 &&
    Boolean(parsed.garmentType || productText || visualHints.length);

  const buscarInput = readyForSearch
    ? {
        product_text: productText || visualHints.join("; "),
        quantity,
        sport: parsed.sport || input.sport || undefined,
        garment_type: parsed.garmentType || undefined,
        collar: parsed.collar || undefined,
        sleeves: parsed.sleeves || undefined,
        material: parsed.material || undefined,
        visual_hints: visualHints.length ? visualHints : undefined,
        photo_description: input.photo_description || undefined,
      }
    : null;

  let suggestedCustomerQuestion = null;
  if (sportDeclined) {
    suggestedCustomerQuestion =
      preview?.customer_reply_es || declinedSportReply(preview?.sport_detected);
  } else if (transcript && !transcriptCheck.valid && !input.message_text) {
    suggestedCustomerQuestion =
      "Qué pena, no logro entender bien el audio. ¿Me confirma por aquí qué producto necesita y cuántas unidades?";
  } else if (missing.includes("quantity")) {
    suggestedCustomerQuestion = "¿Cuántas unidades necesita del mismo diseño? (Mínimo 6)";
  } else if (missing.includes("quantity_min_6")) {
    suggestedCustomerQuestion =
      "En Life Deportes el pedido mínimo es de 6 unidades del mismo producto. ¿Cuántas unidades serían?";
  } else if (missing.includes("tipo_prenda") && !/camisetas?|camisas?/.test(normalizeText(productText))) {
    suggestedCustomerQuestion =
      "¿Necesita solo la camiseta dry-fit o el uniforme completo (camiseta, pantaloneta y medias)?";
  }

  return {
    ok: true,
    phase,
    transcript_status: transcriptCheck.status,
    transcript_valid: transcriptCheck.valid,
    product_text_combined: productText,
    visual_hints: visualHints,
    quantity,
    parsed_intent: parsed,
    sport_declined: sportDeclined,
    customer_reply_es: sportDeclined
      ? preview?.customer_reply_es || declinedSportReply(preview?.sport_detected)
      : null,
    do_not_search: sportDeclined,
    missing_fields: missing,
    ready_for_buscar_producto: readyForSearch,
    buscar_producto_odoo_input: buscarInput,
    suggested_customer_question: suggestedCustomerQuestion,
    preview_match: preview
      ? {
          found: preview.found,
          match_confidence: preview.match_confidence,
          interpretation_es: preview.interpretation_es || preview.message_es,
          sport_declined: preview.sport_declined || false,
        }
      : null,
  };
}
