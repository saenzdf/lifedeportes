#!/usr/bin/env node
/**
 * Empaqueta quote_intent_parser + product_match_engine en interpret_quote_intent.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const enginePath = path.join(root, "functions/lib/product_match_engine.js");
const policyPath = path.join(root, "functions/lib/commercial_policy.js");
const parserPath = path.join(root, "functions/lib/quote_intent_parser.js");
const catalogPath = path.join(root, "catalog/life_catalog_semantic_v1.json");
const outPath = path.join(root, "functions/interpret_quote_intent.js");

const stripExports = (src) =>
  src.replace(/^export function /gm, "function ").replace(/^export /gm, "");

const policyBody = stripExports(fs.readFileSync(policyPath, "utf8"));
const engineBody = stripExports(fs.readFileSync(enginePath, "utf8")).replace(
  /^import\s+\{[^}]+\}\s+from\s+["']\.\/commercial_policy\.js["'];?\s*/m,
  ""
);
const parserBody = stripExports(fs.readFileSync(parserPath, "utf8"))
  .replace(/^import\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?\s*/gm, "");

const catalog = fs.readFileSync(catalogPath, "utf8").trim();

const handler = `
async function interpretQuoteWithJev(env, merged) {
  const JEV_MODE = String(env?.LIFE_JEV_MODE || "off").toLowerCase().trim();
  const key = env?.OPENROUTER_API_KEY;

  if (JEV_MODE === "off" || !key) return null;

  const questions = {
    quote_readiness: {
      type: "choice",
      instructions:
        "Analiza el mensaje/audio/foto del cliente y determina si contiene los datos mínimos para cotizar en Odoo (producto + cantidad mínima de 6).",
      criteria: {
        ready_to_quote: "Tiene producto identificable y cantidad conocida (>= 6). Listo para buscar precio.",
        missing_quantity: "Tiene producto o deporte claro, pero no ha dicho cuántas unidades.",
        declined_sport: "Pide deportes no fabricados por Life (natación, ciclismo, béisbol, patinaje, etc.).",
        general_inquiry: "Solo saluda o pregunta catálogo general sin prenda específica.",
      },
    },
    detected_garment: {
      type: "choice",
      instructions: "¿Qué tipo de prenda principal desea el cliente?",
      criteria: {
        uniforme_completo: "Conjunto completo (camiseta + pantaloneta + medias).",
        camiseta_sola: "Solo camiseta dry-fit.",
        arquero: "Buzo, pantalón o conjunto de arquero.",
        sudadera_chaqueta: "Chaqueta rompevientos, sudadera o buzo de algodón.",
        otro: "Pantaloneta sola, petos o accesorios.",
      },
    },
    detected_sport: {
      type: "choice",
      instructions: "¿Cuál es el deporte?",
      criteria: {
        futbol: "Fútbol, microfútbol, fútsal.",
        baloncesto: "Baloncesto / básquet.",
        voleibol: "Voleibol / vóley.",
        atletismo: "Atletismo / running.",
        otro_declinado: "Cualquier otro deporte no admitido (ciclismo, patinaje, natación, etc.).",
      },
    },
    is_payment_voucher: {
      type: "choice",
      instructions: "¿El texto o descripción de la imagen indica que es un comprobante de pago o recibo de transferencia?",
      criteria: {
        yes: "Es un soporte de transferencia bancaria, recibo de consignación o comprobante de pago.",
        no: "No es un comprobante de pago.",
      },
    },
  };

  const state = {
    message_text: merged.message_text || null,
    transcript: merged.transcript || null,
    photo_description: merged.photo_description || null,
    visual_hints: (merged.visual_hints || []).length ? merged.visual_hints : null,
    quantity: merged.quantity || null,
  };

  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);

  try {
    const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${key}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "typesafe/jev-1.13",
        state,
        questions,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      return { ok: false, mode: JEV_MODE, reason: \`http_\${res.status}\`, latencyMs };
    }

    const data = await res.json();
    const answers = data?.answers || {};
    return {
      ok: true,
      mode: JEV_MODE,
      quote_readiness: answers.quote_readiness?.choice || "general_inquiry",
      detected_garment: answers.detected_garment?.choice || null,
      detected_sport: answers.detected_sport?.choice || null,
      is_payment_voucher: answers.is_payment_voucher?.choice === "yes",
      confidence: Number(answers.quote_readiness?.confidence || 0),
      latencyMs,
    };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, mode: JEV_MODE, reason: err?.message || "jev_timeout_or_network", latencyMs: Date.now() - t0 };
  }
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const executionVars = body?.execution_context?.vars || body?.vars || {};

  const merged = {
    ...input,
    message_text:
      input.message_text ||
      input.text ||
      executionVars?.quote?.last_customer_text ||
      "",
    quantity: input.quantity || executionVars?.quote?.quantity || null,
    visual_hints: []
      .concat(input.visual_hints || [], executionVars?.media?.visual_hints || [])
      .filter(Boolean),
    photo_description:
      input.photo_description || executionVars?.media?.photo_summary || null,
    transcript: input.transcript || executionVars?.media?.transcript || null,
  };

  const result = parseQuoteIntent(merged, SEMANTIC_CATALOG);
  const JEV_MODE = String(env?.LIFE_JEV_MODE || "off").toLowerCase().trim();
  const jevRes = await interpretQuoteWithJev(env, merged);

  if (jevRes && jevRes.ok) {
    if (JEV_MODE === "on") {
      result.jev = jevRes;

      if (jevRes.is_payment_voucher) {
        result.payment_receipt_detected = true;
        result.ready_for_buscar_producto = false;
        result.phase = 3;
        result.suggested_action = "notificar_interes_ventas";
        result.suggested_customer_question = "¡Recibido el soporte de pago! Voy a pasarlo a confirmación con nuestro asesor para validar en banco.";
      }

      if (jevRes.detected_sport === "otro_declinado" || jevRes.quote_readiness === "declined_sport") {
        result.sport_declined = true;
        result.ready_for_buscar_producto = false;
        result.customer_reply_es = declinedSportReply(jevRes.detected_sport);
        result.suggested_customer_question = result.customer_reply_es;
      }

      if (!result.parsed_intent.garmentType && jevRes.detected_garment) {
        result.parsed_intent.garmentType = jevRes.detected_garment;
      }
      if (!result.parsed_intent.sport && jevRes.detected_sport && jevRes.detected_sport !== "otro_declinado") {
        result.parsed_intent.sport = jevRes.detected_sport;
      }

      if (
        jevRes.quote_readiness === "ready_to_quote" &&
        result.quantity >= 6 &&
        !result.sport_declined &&
        !result.ready_for_buscar_producto
      ) {
        result.ready_for_buscar_producto = true;
        result.phase = 3;
        result.buscar_producto_odoo_input = {
          product_text: result.product_text_combined || merged.photo_description || "prenda deportiva",
          quantity: result.quantity,
          sport: result.parsed_intent.sport,
          garment_type: result.parsed_intent.garmentType,
          collar: result.parsed_intent.collar,
          sleeves: result.parsed_intent.sleeves,
          material: result.parsed_intent.material,
          visual_hints: result.visual_hints?.length ? result.visual_hints : undefined,
          photo_description: merged.photo_description || undefined,
        };
      }
    } else if (JEV_MODE === "shadow") {
      result.jev_shadow = jevRes;
    }
  }

  const quotePatch = result.quantity
    ? {
        quantity: result.quantity,
        product_text: result.product_text_combined,
        ...(result.payment_receipt_detected ? { payment_receipt_detected: true, status: "pago_recibido_pendiente_verificar" } : {})
      }
    : result.payment_receipt_detected
      ? { payment_receipt_detected: true, status: "pago_recibido_pendiente_verificar" }
      : undefined;

  return new Response(
    JSON.stringify({
      status: result.ready_for_buscar_producto ? "ready" : "needs_input",
      message: result.preview_match?.interpretation_es || result.suggested_customer_question || "",
      vars: {
        intent: {
          phase: result.phase,
          transcript_status: result.transcript_status,
          product_text_combined: result.product_text_combined,
          parsed: result.parsed_intent,
          quantity: result.quantity,
          missing_fields: result.missing_fields,
          ready_for_buscar_producto: result.ready_for_buscar_producto,
          buscar_producto_odoo_input: result.buscar_producto_odoo_input,
          sport_declined: result.sport_declined,
          faq_policy_intent: result.faq_policy_intent || null,
          customer_reply_es: result.customer_reply_es || null,
          do_not_search: Boolean(result.do_not_search),
          jev: result.jev || result.jev_shadow || null,
        },
        media: {
          transcript: merged.transcript,
          visual_hints: result.visual_hints,
          photo_summary: merged.photo_description,
          confidence: result.transcript_valid ? "high" : result.transcript_status,
          used_for: "quote_context",
        },
        quote: quotePatch,
        service: {
          last_call_name: "interpretar_intencion_cotizacion",
          last_call_status: result.ready_for_buscar_producto ? "ready" : "needs_input",
          last_call_at: new Date().toISOString(),
        },
      },
      result,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
`;

const out = `// AUTO-GENERATED by scripts/bundle_interpret_quote_intent.js — no editar a mano
const SEMANTIC_CATALOG = ${catalog};

${policyBody}

${engineBody}

${parserBody}

${handler}
`;

fs.writeFileSync(outPath, out);
console.log("Wrote", outPath, `(${out.length} bytes)`);
