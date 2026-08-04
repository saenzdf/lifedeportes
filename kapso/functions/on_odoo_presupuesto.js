/**
 * on_odoo_presupuesto — webhook Odoo (CRM stage Proposition → SO).
 *
 * Odoo crea el SO draft (Plantilla venta) y notifica aquí.
 * Esta function: valida secret, enriquece SO (template, Diseño $0),
 * organiza Excel/Word/PDF → sale.order.note, y crea líneas comerciales
 * desde la lista o el estimado CRM (LIFE_DOSSIER / brief).
 * Lista NUNCA va a crm.lead.description. Teléfono solo en campo phone.
 *
 * Auth: Header X-Life-Webhook-Secret | Query ?secret=
 * Secrets: LIFE_ODOO_WEBHOOK_SECRET, ODOO_* , LIFE_DESIGN_PRODUCT_ID, LIFE_SALE_ORDER_TEMPLATE_ID
 * public_endpoint=true
 *
 * Source ESM — deploy via: node kapso/scripts/bundle_on_odoo_presupuesto.js
 */

import {
  applyListaFromSoAttachments,
  stripPhoneFromHtml,
} from "./lib/apply_lista_so_note.js";
import { ensureSoCommercialLines } from "./lib/ensure_so_commercial_lines.js";
import { compact, digitsOnly, jsonResponse, stripOppPrefix } from "./lib/order_detail_shared.js";

function extractSecret(request, url) {
  return (
    compact(request.headers.get("x-life-webhook-secret")) ||
    compact(request.headers.get("X-Life-Webhook-Secret")) ||
    compact(url.searchParams.get("secret")) ||
    compact(url.searchParams.get("token"))
  );
}

/** Odoo webhook nativo: {_id, _model, _name, phone, order_ids, ...} o payload custom. */
function normalizePayload(raw) {
  const p = raw?.input || raw || {};
  const leadId = Number(p.lead_id || p._id || p.id || 0) || null;
  let orderIds = [];
  if (Array.isArray(p.order_ids)) {
    orderIds = p.order_ids.map((x) => Number(Array.isArray(x) ? x[0] : x)).filter(Boolean);
  } else if (p.so_id) {
    orderIds = [Number(p.so_id)].filter(Boolean);
  }
  const phone =
    digitsOnly(p.partner_phone || p.phone || p.mobile || "") ||
    digitsOnly(Array.isArray(p.partner_id) ? "" : "");
  const partnerName =
    compact(p.partner_name) ||
    compact(p.contact_name) ||
    (Array.isArray(p.partner_id) ? compact(p.partner_id[1]) : "") ||
    null;
  return {
    event: compact(p.event) || "crm.stage.presupuesto",
    lead_id: leadId,
    so_id: orderIds[0] || (Number(p.so_id) || null),
    so_name: compact(p.so_name) || null,
    order_ids: orderIds,
    partner_phone: phone || null,
    partner_name: partnerName,
    order_summary: compact(p.order_summary || p.name) || null,
    description: p.description || null,
    kapso_conversation_id: compact(p.kapso_conversation_id) || null,
    force_lista: Boolean(p.force_lista || p.force),
    raw_keys: Object.keys(p),
  };
}

async function odooAuthenticate(env) {
  const base = compact(env.ODOO_URL).replace(/\/$/, "");
  const db = compact(env.ODOO_DB);
  const login = compact(env.ODOO_USERNAME);
  const password = String(env.ODOO_PASSWORD || "");
  if (!base || !db || !login || !password) {
    return null;
  }
  const authRes = await fetch(`${base}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "common",
        method: "authenticate",
        args: [db, login, password, {}],
      },
      id: 1,
    }),
  });
  const authJson = await authRes.json();
  const uid = authJson?.result;
  if (!uid) return null;

  async function executeKw(model, method, args = [], kwargs = {}) {
    const res = await fetch(`${base}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "object",
          method: "execute_kw",
          args: [db, uid, password, model, method, args, kwargs],
        },
        id: Date.now(),
      }),
    });
    const json = await res.json();
    if (json.error) {
      throw new Error(json.error?.data?.message || JSON.stringify(json.error));
    }
    return json.result;
  }

  return { uid, executeKw };
}

async function enrichSaleOrder(odoo, payload, env) {
  const designProductId = Number(env.LIFE_DESIGN_PRODUCT_ID || 504);
  const templateId = Number(env.LIFE_SALE_ORDER_TEMPLATE_ID || 1);
  const { executeKw } = odoo;

  let orderId = payload.so_id || null;
  let orderName = payload.so_name || null;

  if (!orderId && payload.lead_id) {
    const found = await executeKw(
      "sale.order",
      "search_read",
      [[["opportunity_id", "=", payload.lead_id], ["state", "in", ["draft", "sent"]]]],
      { fields: ["id", "name", "note", "sale_order_template_id"], limit: 1, order: "id desc" }
    );
    if (found?.length) {
      orderId = found[0].id;
      orderName = found[0].name;
    }
  }

  if (!orderId) {
    return { enriched: false, reason: "no_so", order_id: null, order_name: null };
  }

  const orders = await executeKw(
    "sale.order",
    "read",
    [[orderId]],
    {
      fields: [
        "id",
        "name",
        "note",
        "sale_order_template_id",
        "order_line",
        "opportunity_id",
        "x_studio_nombre_del_pedido",
        "partner_id",
      ],
    }
  );
  const order = orders?.[0];
  if (!order) {
    return { enriched: false, reason: "so_missing", order_id: orderId, order_name: null };
  }
  orderName = order.name;

  const writes = {};
  if (templateId && !order.sale_order_template_id) {
    writes.sale_order_template_id = templateId;
  }

  // Brief CRM → note solo si note vacía Y aún no hay lista (provisional).
  // Sin teléfono. Si luego hay Excel, applyLista reemplaza con lista organizada.
  const noteEmpty = !compact(String(order.note || "").replace(/<[^>]+>/g, ""));
  if (noteEmpty && payload.lead_id) {
    const leads = await executeKw(
      "crm.lead",
      "read",
      [[payload.lead_id]],
      { fields: ["description"] }
    );
    const desc = stripPhoneFromHtml(leads?.[0]?.description || "");
    if (compact(String(desc || "").replace(/<[^>]+>/g, ""))) {
      writes.note = desc;
    }
  } else if (order.note) {
    const scrubbed = stripPhoneFromHtml(order.note);
    if (scrubbed !== String(order.note || "").trim()) {
      writes.note = scrubbed;
    }
  }

  if (Object.keys(writes).length) {
    await executeKw("sale.order", "write", [[orderId], writes]);
  }

  const lines = await executeKw(
    "sale.order.line",
    "search_read",
    [[["order_id", "=", orderId]]],
    { fields: ["id", "product_id"], limit: 80 }
  );
  const hasDesign = (lines || []).some(
    (l) => Number(Array.isArray(l.product_id) ? l.product_id[0] : l.product_id) === designProductId
  );
  if (!hasDesign && designProductId) {
    await executeKw("sale.order.line", "create", [
      {
        order_id: orderId,
        product_id: designProductId,
        name: "Diseño",
        product_uom_qty: 1,
        price_unit: 0,
      },
    ]);
  }

  const title =
    stripOppPrefix(
      compact(order.x_studio_nombre_del_pedido) ||
        (Array.isArray(order.partner_id) ? compact(order.partner_id[1]) : "") ||
        compact(payload.partner_name) ||
        compact(payload.order_summary) ||
        compact(payload.opportunity_name) ||
        compact(payload.lead_name) ||
        orderName ||
        ""
    ) || orderName;

  // Sincronizar adjuntos (archivos WhatsApp / ir.attachment crm.lead) a la sale.order
  let mediaSync = { synced: [], errors: [] };
  try {
    mediaSync = await syncAttachmentsToOdoo(odoo, payload, env);
  } catch (err) {
    mediaSync = { synced: [], errors: [String(err?.message || err).slice(0, 200)] };
  }

  let lista = { applied: false, reason: "not_attempted" };
  try {
    lista = await applyListaFromSoAttachments(odoo, {
      orderId,
      title,
      force: Boolean(payload.force_lista),
    });
  } catch (err) {
    lista = {
      applied: false,
      reason: "lista_error",
      error: String(err?.message || err).slice(0, 300),
    };
  }

  // Líneas comerciales: desde Excel parseado o estimado CRM (LIFE_DOSSIER / brief).
  let commercial = { created: [], updated: [], skipped: true, reason: "not_attempted" };
  try {
    commercial = await ensureSoCommercialLines(odoo, {
      orderId,
      leadId: payload.lead_id || null,
      detailRows: lista.detail_rows || [],
      designProductId,
      env,
    });
  } catch (err) {
    commercial = {
      created: [],
      updated: [],
      skipped: true,
      reason: "commercial_error",
      error: String(err?.message || err).slice(0, 300),
    };
  }

  return {
    enriched: true,
    order_id: orderId,
    order_name: orderName,
    wrote_note: Boolean(writes.note),
    wrote_template: Boolean(writes.sale_order_template_id),
    design_line: !hasDesign,
    media_sync: mediaSync,
    lista,
    commercial,
  };
}

function guessMimetype(filename, mimeType) {
  const mime = compact(mimeType);
  if (mime) return mime;
  const name = compact(filename).toLowerCase();
  if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (name.endsWith(".xls")) return "application/vnd.ms-excel";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpeg") || name.endsWith(".jpg")) return "image/jpeg";
  if (name.endsWith(".ps")) return "application/postscript";
  if (name.endsWith(".ogg")) return "audio/ogg";
  return "application/octet-stream";
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function syncAttachmentsToOdoo(odoo, payload, env) {
  const { executeKw } = odoo;
  const orderId = payload.so_id || null;
  const leadId = payload.lead_id || null;
  if (!orderId) return { synced: [], errors: [] };

  const synced = [];
  const errors = [];

  // 1. Copiar adjuntos existentes de crm.lead a sale.order
  if (leadId) {
    try {
      const leadAtts = await executeKw(
        "ir.attachment",
        "search_read",
        [[["res_model", "=", "crm.lead"], ["res_id", "=", leadId]]],
        { fields: ["id", "name", "datas", "mimetype"] }
      );
      for (const att of leadAtts || []) {
        if (!att.name || !att.datas) continue;
        const existing = await executeKw(
          "ir.attachment",
          "search",
          [[["res_model", "=", "sale.order"], ["res_id", "=", orderId], ["name", "=", att.name]]],
          { limit: 1 }
        );
        if (existing?.length) continue;

        const newId = await executeKw("ir.attachment", "create", [
          {
            name: att.name,
            res_model: "sale.order",
            res_id: orderId,
            type: "binary",
            mimetype: att.mimetype || "application/octet-stream",
            datas: att.datas,
          },
        ]);
        synced.push({ source: "crm.lead", name: att.name, id: newId });
      }
    } catch (err) {
      errors.push(`lead_copy_error: ${err?.message || err}`);
    }
  }

  // 2. Consultar adjuntos WhatsApp por teléfono desde la API de Kapso
  const phone = digitsOnly(payload.partner_phone || "");
  const baseUrl = compact(env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const apiKey = compact(env.KAPSO_API_KEY || "");

  if (phone && baseUrl && apiKey) {
    try {
      const res = await fetch(`${baseUrl}/platform/v1/whatsapp/messages?phone_number=${phone}&per_page=30`, {
        headers: { "X-API-Key": apiKey, "User-Agent": "Mozilla/5.0" },
      });
      if (res.ok) {
        const json = await res.json();
        const msgs = json.data || json.messages || [];
        for (const m of msgs) {
          if (m.kapso?.direction !== "inbound") continue;

          let mediaUrl = null;
          let filename = null;
          let mime = null;

          const kMedia = m.kapso?.media_data || {};
          const msgId = String(m.id || "").slice(-8);

          if (kMedia.url) {
            mediaUrl = kMedia.url;
            filename = kMedia.filename;
            mime = kMedia.content_type;
          } else if (m.document?.link) {
            mediaUrl = m.document.link;
            filename = m.document.filename;
            mime = m.document.mime_type;
          } else if (m.image?.link) {
            mediaUrl = m.image.link;
            filename = `imagen_${msgId}.jpeg`;
            mime = "image/jpeg";
          } else if (m.audio?.link) {
            mediaUrl = m.audio.link;
            filename = `audio_${msgId}.ogg`;
            mime = "audio/ogg";
          }

          if (!mediaUrl) continue;
          filename = compact(filename) || "adjunto_wa";

          // Verificar si ya existe en la sale.order
          const existingSO = await executeKw(
            "ir.attachment",
            "search",
            [[["res_model", "=", "sale.order"], ["res_id", "=", orderId], ["name", "=", filename]]],
            { limit: 1 }
          );
          if (existingSO?.length) continue;

          // Descargar los bytes de la imagen / archivo
          const fRes = await fetch(mediaUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
          if (!fRes.ok) continue;
          const bytes = new Uint8Array(await fRes.arrayBuffer());
          if (!bytes.length) continue;
          const b64 = bytesToBase64(bytes);

          // Subir a sale.order
          const attSoId = await executeKw("ir.attachment", "create", [
            {
              name: filename,
              res_model: "sale.order",
              res_id: orderId,
              type: "binary",
              mimetype: guessMimetype(filename, mime),
              datas: b64,
            },
          ]);

          // Subir también a crm.lead si existe
          if (leadId) {
            const existingLead = await executeKw(
              "ir.attachment",
              "search",
              [[["res_model", "=", "crm.lead"], ["res_id", "=", leadId], ["name", "=", filename]]],
              { limit: 1 }
            );
            if (!existingLead?.length) {
              await executeKw("ir.attachment", "create", [
                {
                  name: filename,
                  res_model: "crm.lead",
                  res_id: leadId,
                  type: "binary",
                  mimetype: guessMimetype(filename, mime),
                  datas: b64,
                },
              ]);
            }
          }

          synced.push({ source: "whatsapp_media", name: filename, id: attSoId });
        }
      }
    } catch (err) {
      errors.push(`kapso_media_error: ${err?.message || err}`);
    }
  }

  return { synced, errors };
}

async function handler(request, env) {
  const url = new URL(request.url);
  const expected = compact(env.LIFE_ODOO_WEBHOOK_SECRET);
  const got = extractSecret(request, url);
  if (expected && got !== expected) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const payload = normalizePayload(body);
  const now = new Date().toISOString();

  let enrich = { enriched: false, reason: "skipped_no_odoo_env" };
  try {
    const odoo = await odooAuthenticate(env);
    if (odoo) {
      enrich = await enrichSaleOrder(odoo, payload, env);
    }
  } catch (error) {
    enrich = {
      enriched: false,
      reason: "odoo_error",
      error: String(error?.message || error).slice(0, 300),
    };
  }

  const lista = enrich.lista || {};
  let noteMsg =
    "Presupuesto notificado. Sin WhatsApp al cliente. Staff puede subir listas/fotos al SO por WA.";
  if (lista.applied) {
    noteMsg = `Lista organizada desde ${lista.filename} (${lista.rows} filas) → nota del presupuesto ${enrich.order_name}.`;
  } else if (lista.reason === "needs_ocr") {
    noteMsg =
      "Presupuesto OK; PDF de lista sin texto embebido. Staff: ask_about_file (visión) para organizar la lista.";
  } else if (lista.reason === "no_list_attachment" || lista.reason === "no_excel_or_docx") {
    noteMsg =
      "Presupuesto OK sin lista aún. Cuando envíen Excel/PDF/foto/texto de lista, se organiza y pasa a la nota del SO.";
  }

  return jsonResponse({
    ok: true,
    event: payload.event,
    lead_id: payload.lead_id,
    so_id: enrich.order_id || payload.so_id,
    so_name: enrich.order_name || payload.so_name,
    partner_phone: payload.partner_phone,
    partner_name: payload.partner_name,
    at: now,
    enrich,
    vars: {
      quote: {
        status: "presupuesto",
        order_summary: payload.order_summary,
        so_name: enrich.order_name || payload.so_name,
        so_id: enrich.order_id || payload.so_id,
        odoo_lead_id: payload.lead_id,
        presupuesto_at: now,
        lista_applied: Boolean(lista.applied),
        lista_rows: lista.rows || null,
      },
      order_state: {
        stage: "presupuesto",
        source: "odoo_webhook",
        at: now,
        lead_id: payload.lead_id,
        so_id: enrich.order_id || payload.so_id,
        so_name: enrich.order_name || payload.so_name,
        lista: lista,
      },
    },
    note: noteMsg,
  });
}

export { handler };
