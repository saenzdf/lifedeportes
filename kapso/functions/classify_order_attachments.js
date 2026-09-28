/**
 * Kapso tool: clasificar-adjuntos-pedido
 */
import {
  jsonResponse,
  mergeAttachments,
  patchOrderDraft,
  pickMediaFromContext,
  serviceVars,
} from "./lib/order_detail_shared.js";

async function classifyAttachmentRoleWithJev(env, { filename, mime_type, caption, context_text }) {
  const JEV_MODE = String(env?.LIFE_JEV_MODE || "off").toLowerCase().trim();
  const key = env?.OPENROUTER_API_KEY;

  if (JEV_MODE === "off" || !key) {
    return null;
  }

  const questions = {
    attachment_role: {
      type: "choice",
      instructions:
        "¿Cuál es la naturaleza y propósito comercial de este archivo o imagen enviado por el cliente a Life Deportes según el texto que lo acompaña, nombre de archivo o contexto?",
      criteria: {
        payment_receipt:
          "Comprobante de transferencia bancaria, recibo de consignación, soporte de Nequi/Daviplata/Bancolombia/Davivienda/Bre-B o confirmación de pago.",
        size_roster:
          "Foto de lista, cuaderno o planilla con nombres, números de dorsal y tallas de las prendas para confección.",
        design_reference:
          "Foto de camiseta, boceto deportivo, escudo, logo de patrocinador, uniforme o paleta de colores.",
        other: "Sticker, foto personal irrelevante o documento no comercial.",
      },
    },
    is_payment_proof: {
      type: "choice",
      instructions: "¿El archivo o el mensaje que lo acompaña certifica explícitamente el pago, abono o transferencia de dinero?",
      criteria: {
        yes: "Es un soporte o confirmación de pago / transferencia bancaria.",
        no: "No es un comprobante de pago.",
      },
    },
  };

  const state = {
    filename: filename || null,
    mime_type: mime_type || null,
    caption: caption || null,
    context: context_text ? String(context_text).slice(0, 1000) : null,
  };

  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);

  try {
    const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
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
      return { ok: false, mode: JEV_MODE, reason: `http_${res.status}`, latencyMs };
    }

    const data = await res.json();
    const answers = data?.answers || {};
    const roleChoice = answers.attachment_role?.choice || "other";
    const confidence = Number(answers.attachment_role?.confidence || 0);
    const isPaymentChoice = answers.is_payment_proof?.choice || "no";

    return {
      ok: true,
      mode: JEV_MODE,
      role: roleChoice === "size_roster" ? "detail_list" : roleChoice,
      is_payment_proof: isPaymentChoice === "yes" || roleChoice === "payment_receipt",
      confidence,
      latencyMs,
    };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, mode: JEV_MODE, reason: err?.message || "jev_timeout_or_network", latencyMs: Date.now() - t0 };
  }
}

function suggestTools(attachments) {
  const tools = [];
  const hasPayment = attachments.some(
    (a) => a.role === "payment_receipt" || a.is_payment_proof
  );
  const hasListFile = attachments.some(
    (a) =>
      a.role === "detail_list" &&
      /\.(xlsx|xls|docx)|spreadsheet|wordprocessing/i.test(`${a.filename || ""}${a.mime_type || ""}`)
  );
  const hasListImage = attachments.some(
    (a) => a.role === "detail_list" && /\.(jpe?g|png|webp|pdf)$/i.test(a.filename || "")
  );
  const hasDesign = attachments.some((a) => a.role === "design_reference");

  if (hasPayment) tools.push("notificar_interes_ventas");
  if (hasListFile) tools.push("parsear_lista_excel_pedido");
  if (hasListImage) tools.push("parsear_lista_imagen_pedido");
  if (attachments.length) tools.push("registrar_adjuntos_pedido");
  if (hasDesign && !hasListFile && !hasListImage) tools.push("registrar_adjuntos_pedido");

  return [...new Set(tools)];
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || body?.vars || {};
  const now = new Date().toISOString();

  const { mediaFromMessages } = pickMediaFromContext(body);
  const rawAttachments = mergeAttachments(vars?.order_draft?.attachments, mediaFromMessages);

  const JEV_MODE = String(env?.LIFE_JEV_MODE || "off").toLowerCase().trim();
  const classifiedAttachments = [];
  let jevDecisionLog = null;

  for (const att of rawAttachments) {
    const jevRes = await classifyAttachmentRoleWithJev(env, {
      filename: att.filename,
      mime_type: att.mime_type,
      caption: att.caption,
      context_text: body?.input?.text || vars?.last_user_input || "",
    });

    if (jevRes && jevRes.ok) {
      jevDecisionLog = jevRes;
      if (JEV_MODE === "on") {
        att.role = jevRes.role;
        att.is_payment_proof = jevRes.is_payment_proof;
        att.confidence = jevRes.confidence;
      } else if (JEV_MODE === "shadow") {
        att.jev_shadow = { role: jevRes.role, is_payment_proof: jevRes.is_payment_proof, confidence: jevRes.confidence };
      }
    }
    classifiedAttachments.push(att);
  }

  const suggested_tools = suggestTools(classifiedAttachments);
  const order_draft = patchOrderDraft(vars, { attachments: classifiedAttachments });

  const paymentReceipt = classifiedAttachments.find((a) => a.role === "payment_receipt" || a.is_payment_proof);
  const quotePatch = { ...(vars?.quote || {}) };
  if (paymentReceipt) {
    quotePatch.payment_receipt_detected = true;
    quotePatch.payment_receipt_url = paymentReceipt.url;
    quotePatch.status = quotePatch.status || "pago_recibido_pendiente_verificar";
  }

  return jsonResponse({
    ok: true,
    attachment_count: classifiedAttachments.length,
    attachments: classifiedAttachments,
    payment_receipt_detected: Boolean(paymentReceipt),
    payment_receipt_url: paymentReceipt?.url || null,
    suggested_tools,
    jev: jevDecisionLog,
    vars: {
      order_draft,
      quote: quotePatch,
      ...serviceVars("clasificar_adjuntos_pedido", "ready", now, null),
    },
  });
}

export { handler };
