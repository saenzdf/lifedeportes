/**
 * Búsqueda y corrección de pedidos staff (sale.order + project.task).
 * Editable mientras la tarjeta NO esté en impresión / fabricación.
 */

import { findPartnerByWaPhone } from "./odoo_partner_phone.js";
import { buildOdooOrderNoteHtml } from "./build_odoo_order_note.js";
import { attachDraftFiles, attachTaskDraftFiles } from "./odoo_attach_from_url.js";
import { toDetailRow } from "./order_detail_shared.js";

/** Etapas donde ya no se puede corregir lista sin costo */
const LOCKED_STAGE_RE =
  /a\s*imprimir|fabricaci[oó]n|sublimaci[oó]n|confecci[oó]n|\bcorte\b|cobro\s*y\s*entrega|\bhecho\b|cancelad|entregad/i;

export const EXCEL_VERIFY_WARNING =
  "Revise bien el Excel o la lista antes de confirmar: una vez el pedido pase a impresión o fabricación, los cambios del cliente tienen costo adicional.";

export function hasOdooCredentials(env = {}) {
  return Boolean(env.ODOO_URL && env.ODOO_DB && env.ODOO_USERNAME && env.ODOO_PASSWORD);
}

export function odooCredentialsError(toolName) {
  return {
    ok: false,
    error: "odoo_unavailable",
    message: `No hay credenciales Odoo en la función ${toolName}.`,
  };
}

/** Número corto del pedido: 2564 desde "2564", "02564", "S02564" */
export function bareOrderNumber(raw) {
  let s = String(raw || "").trim().toUpperCase();
  s = s.replace(/^S0*/i, "").replace(/^S/i, "");
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  return String(parseInt(digits, 10));
}

export function bareOrderNumberFromName(orderName) {
  const m = String(orderName || "").match(/S0*(\d+)/i);
  return m ? String(parseInt(m[1], 10)) : null;
}

export function parseDetailRowsFromNoteHtml(html) {
  const rows = [];
  const body = String(html || "");
  const tbodyMatch = body.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return rows;
  const trs = tbodyMatch[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trs) {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim()
    );
    if (tds.length < 2) continue;
    const nombre = tds[1];
    if (!nombre || /^nombre$/i.test(nombre)) continue;
    rows.push({
      numero: tds[0] === "—" ? "" : tds[0],
      nombre,
      talla: tds[2] === "—" ? "" : tds[2] || "",
      rol: tds[3] || "",
      manga: "",
      grupo: "",
    });
  }
  return rows.map((r) => toDetailRow(r)).filter(Boolean);
}

export function patchDetailRows(existing, changes) {
  const out = (existing || []).map((r) => ({ ...r }));
  for (const raw of changes || []) {
    const ch = toDetailRow(raw);
    if (!ch) continue;
    const idx = out.findIndex(
      (r) =>
        (ch.numero && r.numero === ch.numero) ||
        (ch.nombre && r.nombre.toLowerCase() === ch.nombre.toLowerCase())
    );
    if (idx >= 0) out[idx] = { ...out[idx], ...ch };
    else out.push(ch);
  }
  return out;
}

export function rowProductBucket(row) {
  const r = toDetailRow(row);
  if (!r) return "campo";
  if (r.arquero || /arquer|porter/i.test(r.rol || "")) return "arquero";
  const m = `${r.manga || ""} ${r.rol || ""}`.toLowerCase();
  if (/manga\s*larg|larg[ao]/.test(m)) return "manga_larga";
  if (/manga\s*cort|cort[ao]|sisa/.test(m)) return "manga_corta";
  return "campo";
}

export function countRowsByBucket(rows) {
  const counts = { campo: 0, arquero: 0, manga_larga: 0, manga_corta: 0 };
  for (const row of rows || []) {
    const bucket = rowProductBucket(row);
    counts[bucket] = (counts[bucket] || 0) + 1;
  }
  return counts;
}

export function detectProductMixChanges(oldRows, newRows) {
  return JSON.stringify(countRowsByBucket(oldRows)) !== JSON.stringify(countRowsByBucket(newRows));
}

export function summarizeListDiff(oldRows, newRows) {
  const old = (oldRows || []).map((r) => toDetailRow(r)).filter(Boolean);
  const neu = (newRows || []).map((r) => toDetailRow(r)).filter(Boolean);
  const parts = [];
  if (detectProductMixChanges(old, neu)) {
    const ob = countRowsByBucket(old);
    const nb = countRowsByBucket(neu);
    const deltas = [];
    for (const key of Object.keys(nb)) {
      const d = (nb[key] || 0) - (ob[key] || 0);
      if (d) deltas.push(`${key.replace(/_/g, " ")} ${d > 0 ? "+" : ""}${d}`);
    }
    parts.push(`Variantes: ${deltas.join(", ") || "mezcla distinta"}`);
  }
  let detailChanges = 0;
  for (const nr of neu) {
    const match = old.find((o) => o.nombre.toLowerCase() === nr.nombre.toLowerCase());
    if (!match) {
      detailChanges++;
      continue;
    }
    if (match.talla !== nr.talla || match.numero !== nr.numero) detailChanges++;
  }
  if (detailChanges) parts.push(`${detailChanges} fila(s) con talla/número/nombre`);
  return parts.join(" · ") || "Lista actualizada";
}

export function extractTitleFromNoteHtml(html) {
  const m = String(html || "").match(/<h1>([\s\S]*?)<\/h1>/i);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
}

export function extractCommercialSummaryFromNoteHtml(html) {
  const m = String(html || "").match(
    /<h2>Resumen de uniformes<\/h2>[\s\S]*?(?=\n\n<hr>|\n\n<h2>|$)/i
  );
  return m ? m[0].trim() : "";
}

function mangaQtyParts(r) {
  if (Array.isArray(r.manga_parts) && r.manga_parts.length) {
    return r.manga_parts.map((p) => ({
      manga: String(p.manga || "").toLowerCase(),
      qty: Math.max(1, Number(p.qty) || 1),
    }));
  }
  const qty = Math.max(1, Number(r.cantidad || 1) || 1);
  const m = String(r.manga || "").toLowerCase();
  const hasL = /larga/.test(m);
  const hasC = /corta|sisa/.test(m);
  if (hasL && hasC) {
    // Sin desglose numérico: no inventar split; contar qty completa en el primer tipo
    return [{ manga: "larga", qty }];
  }
  if (hasL) return [{ manga: "larga", qty }];
  if (hasC) return [{ manga: "corta", qty }];
  return [{ manga: "corta", qty }];
}

export function countRowsBySoLineBucket(rows) {
  const counts = {
    uniforme_corta: 0,
    uniforme_larga: 0,
    camiseta_corta: 0,
    camiseta_larga: 0,
  };
  for (const row of rows || []) {
    const r = toDetailRow(row);
    if (!r) continue;
    if (r.pantaloneta) continue;
    const isArquero = r.arquero || /arquer|porter/i.test(r.rol || "");
    const parts = mangaQtyParts(r);
    const add = (bucket, q) => {
      counts[bucket] += q;
    };
    for (const part of parts) {
      const q = part.qty;
      const isLarga = part.manga === "larga";
      if (r.camiseta && r.grupo === "femenino") {
        add(isLarga ? "camiseta_larga" : "camiseta_corta", q);
        continue;
      }
      if (isArquero) {
        if (r.grupo === "masculino" && r.uniforme !== false && !r.camiseta) {
          add(isLarga ? "uniforme_larga" : "uniforme_corta", q);
        } else {
          add(isLarga ? "camiseta_larga" : "camiseta_corta", q);
        }
        continue;
      }
      if (r.camiseta) {
        add(isLarga ? "camiseta_larga" : "camiseta_corta", q);
      } else {
        add(isLarga ? "uniforme_larga" : "uniforme_corta", q);
      }
    }
  }
  return counts;
}

function lineBucketFromSoName(name) {
  const n = String(name || "").toLowerCase();
  if (/diseño|diseno/.test(n)) return "design";
  const isCamiseta = /camiseta/.test(n) && !/uniforme/.test(n);
  const isLarga = /manga\s*larg|\blarga\b/.test(n);
  if (isCamiseta) return isLarga ? "camiseta_larga" : "camiseta_corta";
  if (/uniforme/.test(n)) return isLarga ? "uniforme_larga" : "uniforme_corta";
  if (/manga\s*cort|cort[ao]|sisa/.test(n)) return "uniforme_corta";
  return "campo";
}

export async function syncSoLinesFromProductMix(executeKw, orderId, newRows, productIdByBucket = {}) {
  const buckets = { ...countRowsBySoLineBucket(newRows) };
  const lines = await executeKw(
    "sale.order.line",
    "search_read",
    [[["order_id", "=", orderId]]],
    { fields: ["id", "name", "product_uom_qty", "product_id"] }
  );
  const updates = [];
  const unmatched = [];

  for (const line of lines || []) {
    const bucket = lineBucketFromSoName(line.name);
    if (bucket === "design") continue;
    const targetQty = buckets[bucket] || 0;
    const currentQty = Number(line.product_uom_qty || 0);
    if (targetQty > 0) {
      if (currentQty !== targetQty) {
        await executeKw("sale.order.line", "write", [[line.id], { product_uom_qty: targetQty }]);
        updates.push({ line_id: line.id, name: line.name, from: currentQty, to: targetQty });
      } else {
        updates.push({ line_id: line.id, name: line.name, matched: true, qty: currentQty });
      }
      buckets[bucket] = 0;
    } else if (currentQty > 0 && bucket !== "campo" && bucket !== "design") {
      await executeKw("sale.order.line", "write", [[line.id], { product_uom_qty: 0 }]);
      updates.push({ line_id: line.id, name: line.name, from: currentQty, to: 0 });
    }
  }

  for (const [bucket, qty] of Object.entries(buckets)) {
    if (qty <= 0) continue;
    const productId = productIdByBucket[bucket];
    if (!productId) {
      unmatched.push({ bucket, qty });
      continue;
    }
    const newLineId = await executeKw("sale.order.line", "create", [
      {
        order_id: orderId,
        product_id: productId,
        product_uom_qty: qty,
      },
    ]);
    updates.push({ created: true, bucket, product_id: productId, qty, line_id: newLineId });
  }

  return { updates, unmatched, expected: countRowsBySoLineBucket(newRows) };
}

export function normalizeStageName(stageName) {
  return String(stageName || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function isStageEditable(stageName) {
  const s = normalizeStageName(stageName);
  if (!s) return true;
  return !LOCKED_STAGE_RE.test(s);
}

export function changeTypeLabel(changeType) {
  const map = {
    cliente: "Cambio solicitado por el cliente",
    error_interno: "Corrección error interno Life (sin costo al cliente)",
    error_diseno: "Corrección error de diseño Life (sin costo al cliente)",
  };
  return map[changeType] || "Corrección de pedido";
}

export function buildCorrectionChatterHtml({
  changeType,
  changeSummary,
  staffLabel,
  orderName,
  rowCount,
  productMixChanged,
  revisionNumber,
}) {
  const label = changeTypeLabel(changeType);
  const who = staffLabel || "Staff WhatsApp";
  const summary = String(changeSummary || "").trim() || "Actualización de lista.";
  const rows = rowCount ? `<p>Filas: <strong>${rowCount}</strong>.</p>` : "";
  const soNote = productMixChanged
    ? "<p>SO actualizada (cambió variante/producto).</p>"
    : "<p>SO sin cambios (solo lista en tarea).</p>";
  const revision = revisionNumber
    ? `<p>Revisión estructurada: <strong>V${String(revisionNumber).padStart(4, "0")}</strong>.</p>`
    : "";

  return `<p><strong>${label}</strong> — ${orderName || ""}</p>
<p>${who}</p>
<p>${summary}</p>
${rows}
${soNote}
${revision}`;
}

function jsonToBase64(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2));
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function archiveOrderRevision(executeKw, {
  order,
  task,
  beforeLines,
  changeType,
  changeSummary,
  staffLabel,
  listMode,
  productMixChanged,
  rowCount,
}) {
  const existing = await executeKw(
    "ir.attachment",
    "search_read",
    [[
      ["res_model", "=", "sale.order"],
      ["res_id", "=", order.id],
      ["name", "ilike", "life-order-revision-v"],
    ]],
    { fields: ["id", "name"], limit: 200, order: "id asc" }
  );
  const maxRevision = (existing || []).reduce((max, attachment) => {
    const match = String(attachment.name || "").match(/revision-v(\d+)/i);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0);
  const number = maxRevision + 1;
  const ordersAfter = await executeKw("sale.order", "read", [[order.id]], {
    fields: ["id", "name", "state", "note", "amount_total", "write_date"],
  });
  const orderAfter = Array.isArray(ordersAfter) ? ordersAfter[0] : {};
  const tasksAfter = task?.id
    ? await executeKw("project.task", "read", [[task.id]], {
        fields: ["id", "name", "stage_id", "description", "write_date"],
      })
    : [];
  const taskAfter = Array.isArray(tasksAfter) ? tasksAfter[0] : null;
  const linesAfter = await executeKw(
    "sale.order.line",
    "search_read",
    [[["order_id", "=", order.id]]],
    {
      fields: ["id", "product_id", "name", "product_uom_qty", "price_unit", "write_date"],
      limit: 200,
      order: "id asc",
    }
  );
  const createdAt = new Date().toISOString();
  const snapshot = {
    schema_version: "life_order_revision_v1",
    revision_number: number,
    created_at: createdAt,
    order_id: order.id,
    order_name: order.name,
    order_state: order.state,
    change: {
      type: changeType,
      summary: changeSummary,
      requested_by: staffLabel,
      list_mode: listMode,
      product_mix_changed: Boolean(productMixChanged),
      row_count: Number(rowCount || 0),
    },
    before: {
      order: {
        note: order.note || "",
        amount_total: Number(order.amount_total || 0),
        write_date: order.write_date || null,
      },
      task: task
        ? {
            id: task.id,
            stage_id: task.stage_id || null,
            description: task.description || "",
            write_date: task.write_date || null,
          }
        : null,
      lines: beforeLines || [],
    },
    after: {
      order: orderAfter,
      task: taskAfter,
      lines: linesAfter || [],
    },
  };
  const name = `life-order-revision-v${String(number).padStart(4, "0")}.json`;
  const attachmentId = await executeKw("ir.attachment", "create", [
    {
      name,
      res_model: "sale.order",
      res_id: order.id,
      type: "binary",
      mimetype: "application/json",
      raw: jsonToBase64(snapshot),
    },
  ]);
  return { number, name, attachment_id: attachmentId, created_at: createdAt };
}

export async function createOdooClient(env) {
  const rpc = async (service, method, args) => {
    const resp = await fetch(`${env.ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args } }),
    });
    const json = await resp.json();
    if (json?.error) throw new Error(json.error?.message || "Odoo RPC error");
    return json.result;
  };
  const uid = await rpc("common", "authenticate", [
    env.ODOO_DB,
    env.ODOO_USERNAME,
    env.ODOO_PASSWORD,
    {},
  ]);
  if (!uid) throw new Error("Odoo authentication failed");
  const executeKw = (model, method, positionalArgs = [], kw = {}) =>
    rpc("object", "execute_kw", [
      env.ODOO_DB,
      uid,
      env.ODOO_PASSWORD,
      model,
      method,
      positionalArgs,
      kw,
    ]);
  return { uid, executeKw };
}

function mapOrderRow(order, task) {
  const stage = Array.isArray(task?.stage_id) ? task.stage_id[1] : null;
  const editable = isStageEditable(stage);
  return {
    order_id: order.id,
    order_name: order.name,
    order_state: order.state,
    partner_name: Array.isArray(order.partner_id) ? order.partner_id[1] : null,
    partner_id: Array.isArray(order.partner_id) ? order.partner_id[0] : order.partner_id,
    amount_total: Number(order.amount_total || 0),
    date_order: order.date_order || null,
    task_id: task?.id || null,
    task_name: task?.name || null,
    task_stage: stage,
    editable,
    lock_reason: editable
      ? null
      : `Etapa «${stage}»: el pedido ya está en impresión o fabricación. Los cambios del cliente tienen costo.`,
  };
}

export async function loadOrderBundle(executeKw, orderId) {
  const orders = await executeKw("sale.order", "read", [[orderId]], {
    fields: ["id", "name", "state", "partner_id", "amount_total", "date_order", "note", "write_date"],
  });
  const order = Array.isArray(orders) ? orders[0] : null;
  if (!order?.id) return null;

  const tasks = await executeKw(
    "project.task",
    "search_read",
    [[["sale_order_id", "=", orderId]]],
    {
      fields: ["id", "name", "stage_id", "description", "write_date"],
      limit: 1,
      order: "id desc",
    }
  );
  const task = Array.isArray(tasks) ? tasks[0] : null;
  return { order, task, mapped: mapOrderRow(order, task) };
}

/**
 * Lista HTML: staff en la tarea es fuente de verdad.
 * Preferir project.task.description; si falta, sale.order.note.
 */
export function resolveListaHtmlFromBundle(bundle) {
  const taskHtml = String(bundle?.task?.description || "").trim();
  const noteHtml = String(bundle?.order?.note || "").trim();
  if (taskHtml.length >= 40) return { html: taskHtml, source: "task.description" };
  if (noteHtml.length >= 40) return { html: noteHtml, source: "sale.order.note" };
  return { html: taskHtml || noteHtml || "", source: taskHtml ? "task.description" : noteHtml ? "sale.order.note" : "empty" };
}

/** Texto plano de un mensaje WhatsApp (Kapso / Cloud API). */
export function waMessageText(msg) {
  if (!msg || typeof msg !== "object") return "";
  const direct = msg.content ?? msg.body;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const nested = msg.text;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  if (nested && typeof nested === "object") {
    const body = nested.body ?? nested.text;
    if (typeof body === "string" && body.trim()) return body.trim();
  }
  if (typeof msg.caption === "string" && msg.caption.trim()) return msg.caption.trim();
  return "";
}

export function extractOrderNumberFromText(text) {
  const s = String(text || "");
  const soMatch = s.match(/\bS0*(\d{3,6})\b/i);
  if (soMatch) return bareOrderNumber(soMatch[0]);
  const pedidoMatch = s.match(/(?:pedido|orden|presupuesto|so|n[°º]?)\s*#?\s*0*(\d{3,6})\b/i);
  if (pedidoMatch) return bareOrderNumber(pedidoMatch[1]);
  const corrMatch = s.match(/(?:corregir|actualizar|modificar|update)\s+(?:el\s+)?(?:pedido\s+)?#?\s*0*(\d{3,6})\b/i);
  if (corrMatch) return bareOrderNumber(corrMatch[1]);
  const looseNum = s.match(/\b0*(\d{4,6})\b/);
  if (looseNum && /actualizar|corregir|modificar|pedido|lista/i.test(s)) {
    return bareOrderNumber(looseNum[1]);
  }
  return null;
}

export function extractCustomerNameFromText(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const afterNum = s.match(/\b0*\d{3,6}\b\s+([A-Za-zÁÉÍÓÚáéíóúñÑ][\w\sÁÉÍÓÚáéíóúñÑ.-]{2,40})/);
  if (afterNum) return afterNum[1].trim();
  const deMatch = s.match(/(?:de|para|cliente)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ][\w\sÁÉÍÓÚáéíóúñÑ.-]{2,40})/i);
  if (deMatch) return deMatch[1].trim();
  return null;
}

/** Une input explícito + vars persistidas + texto reciente del hilo WhatsApp. */
export function resolveStaffOrderSearchInput(body = {}) {
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const messages = Array.isArray(body?.whatsapp_context?.messages)
    ? body.whatsapp_context.messages
    : [];

  const fromInput = bareOrderNumber(
    input.order_number || input.order_name || input.numero_pedido || ""
  );

  const sessionBare =
    bareOrderNumber(vars.order_session?.order_name) ||
    bareOrderNumber(vars.order_correction?.target_order_name) ||
    bareOrderNumber(vars.order?.name) ||
    null;
  const sessionId =
    Number(vars.order_session?.order_id || vars.order_correction?.target_order_id || vars.order?.id || 0) ||
    0;

  // Número en el hilo que difiere de la sesión → cambio de pedido (no reusar el anterior).
  let threadNumber = null;
  let threadName = "";
  for (const msg of [...messages].reverse()) {
    if (msg.direction && msg.direction !== "inbound") continue;
    const text = waMessageText(msg);
    if (!text) continue;
    if (!threadNumber) threadNumber = extractOrderNumberFromText(text);
    if (!threadName) threadName = extractCustomerNameFromText(text) || "";
    if (threadNumber) break;
  }

  const requestedBare = fromInput || threadNumber || null;
  const isSwitchAway =
    Boolean(sessionId) &&
    Boolean(requestedBare) &&
    Boolean(sessionBare) &&
    requestedBare !== sessionBare;

  if (!isSwitchAway && vars.order_correction?.target_order_id) {
    const n =
      fromInput ||
      bareOrderNumber(vars.order_correction.target_order_name || "") ||
      bareOrderNumber(vars.order?.name || "");
    return {
      order_number: n,
      order_id: vars.order_correction.target_order_id,
      customer_phone: input.customer_phone || input.phone || "",
      customer_name: input.customer_name || threadName || "",
      source: fromInput ? "input" : "vars.order_correction",
      already_resolved: true,
      session_switch: false,
    };
  }

  if (!isSwitchAway && vars.order?.id) {
    const n = fromInput || bareOrderNumber(vars.order.name || "");
    if (n) {
      return {
        order_number: n,
        order_id: vars.order.id,
        customer_phone: input.customer_phone || input.phone || "",
        customer_name: input.customer_name || threadName || "",
        source: fromInput ? "input" : "vars.order",
        already_resolved: true,
        session_switch: false,
      };
    }
  }

  let orderNumber = fromInput || (isSwitchAway ? requestedBare : null);
  let source = fromInput ? "input" : isSwitchAway ? "session_switch" : null;

  if (!orderNumber) {
    orderNumber = bareOrderNumber(vars.order_correction?.target_order_name || "");
    if (orderNumber) source = "vars.order_correction";
  }

  let customerName = String(input.customer_name || input.partner_name || "").trim() || threadName;

  if (!orderNumber || !customerName) {
    for (const msg of [...messages].reverse()) {
      if (msg.direction && msg.direction !== "inbound") continue;
      const text = waMessageText(msg);
      if (!text) continue;
      if (!orderNumber) {
        const found = extractOrderNumberFromText(text);
        if (found) {
          orderNumber = found;
          source = source || "whatsapp_thread";
        }
      }
      if (!customerName) {
        const name = extractCustomerNameFromText(text);
        if (name) customerName = name;
      }
      if (orderNumber && customerName) break;
    }
  }

  return {
    order_number: orderNumber,
    order_id: null,
    customer_phone: input.customer_phone || input.phone || "",
    customer_name: customerName,
    source,
    already_resolved: false,
    session_switch: isSwitchAway,
    previous_session_order_id: isSwitchAway ? sessionId : null,
  };
}

export function orderNameCandidates(bareNumber) {
  const n = parseInt(String(bareNumber || ""), 10);
  if (!n) return [];
  return [...new Set([`S0${String(n).padStart(4, "0")}`, `S0${n}`, `S${n}`])];
}

/** Dominio Odoo OR en notación polaca: ['|', '|', A, B, C] */
export function odooOrDomain(conditions) {
  const items = (conditions || []).filter(Boolean);
  if (!items.length) return [];
  if (items.length === 1) return items;
  return [...Array(items.length - 1).fill("|"), ...items];
}

export async function searchStaffOrders(executeKw, input = {}) {
  const orderNumber = bareOrderNumber(
    input.order_number || input.order_name || input.numero_pedido || ""
  );
  const customerPhone = String(input.customer_phone || input.phone || "").trim();
  const customerName = String(input.customer_name || input.partner_name || "").trim();
  const limit = Math.min(Math.max(Number(input.limit || 5), 1), 10);

  const orderFields = ["id", "name", "state", "partner_id", "amount_total", "date_order", "write_date"];

  if (!orderNumber) {
    return {
      orders: [],
      partner_id: null,
      note: "Indique el número del pedido (solo dígitos, ej. 2564).",
      order_number: null,
    };
  }

  const nameCandidates = orderNameCandidates(orderNumber);
  const nameOr = odooOrDomain(nameCandidates.map((name) => ["name", "ilike", name]));

  let domain = ["&", ["state", "in", ["draft", "sent", "sale"]], ...nameOr];

  let resolvedPartnerId = 0;
  if (customerPhone) {
    const lookup = await findPartnerByWaPhone(executeKw, customerPhone, {
      fields: ["id", "name"],
    });
    resolvedPartnerId = lookup.partner?.id || 0;
    if (resolvedPartnerId) {
      domain = ["&", ["partner_id", "=", resolvedPartnerId], ...domain];
    }
  } else if (customerName) {
    domain = ["&", ["partner_id.name", "ilike", customerName], ...domain];
  }

  const rows = await executeKw("sale.order", "search_read", [domain], {
    fields: orderFields,
    limit: 20,
    order: "id desc",
  });

  let matched = (rows || []).filter(
    (o) => bareOrderNumberFromName(o.name) === orderNumber
  );

  if (!matched.length) {
    matched = await searchStaffOrdersViaTask(executeKw, orderNumber, customerName, orderFields);
  }

  return {
    orders: await enrichOrdersWithTasks(executeKw, matched.slice(0, limit)),
    partner_id:
      (Array.isArray(matched[0]?.partner_id) ? matched[0].partner_id[0] : null) ||
      resolvedPartnerId ||
      null,
    note: matched.length ? null : `No encontré pedido ${orderNumber}${customerName ? ` (${customerName})` : ""}.`,
    order_number: orderNumber,
  };
}

async function searchStaffOrdersViaTask(executeKw, orderNumber, customerName, orderFields) {
  const nameCandidates = orderNameCandidates(orderNumber);
  const taskNameConds = [
    ...nameCandidates.map((name) => ["name", "ilike", name]),
    ["name", "ilike", orderNumber],
  ];
  let taskDomain = odooOrDomain(taskNameConds);
  if (customerName) {
    taskDomain = ["&", ["partner_id.name", "ilike", customerName], ...taskDomain];
  }

  const tasks = await executeKw("project.task", "search_read", [taskDomain], {
    fields: ["id", "name", "stage_id", "sale_order_id", "partner_id"],
    limit: 10,
    order: "id desc",
  });

  const orderIds = [];
  const seen = new Set();
  for (const task of tasks || []) {
    const soId = Array.isArray(task.sale_order_id) ? task.sale_order_id[0] : task.sale_order_id;
    const soName = Array.isArray(task.sale_order_id) ? task.sale_order_id[1] : "";
    const taskName = String(task.name || "");
    const numOk =
      bareOrderNumberFromName(soName) === orderNumber ||
      bareOrderNumberFromName(taskName) === orderNumber ||
      taskName.includes(orderNumber);
    if (!soId || !numOk || seen.has(soId)) continue;
    seen.add(soId);
    orderIds.push(soId);
  }

  if (!orderIds.length) return [];

  const orders = await executeKw("sale.order", "read", [orderIds], { fields: orderFields });
  return (orders || []).filter((o) => bareOrderNumberFromName(o.name) === orderNumber);
}

async function enrichOrdersWithTasks(executeKw, orders) {
  const out = [];
  for (const order of orders) {
    const tasks = await executeKw(
      "project.task",
      "search_read",
      [[["sale_order_id", "=", order.id]]],
      { fields: ["id", "name", "stage_id"], limit: 1, order: "id desc" }
    );
    const task = Array.isArray(tasks) ? tasks[0] : null;
    out.push(mapOrderRow(order, task));
  }
  return out;
}

export function resolveCorrectionNoteHtml(vars = {}, input = {}, options = {}) {
  const orderDraft = vars.order_draft || {};
  let detailRows = orderDraft.detail?.rows || input.detail_rows || [];
  const listMode = options.listMode || input.list_mode || "full";
  const existingHtml = options.existingNoteHtml || "";
  const productMixChanged = Boolean(options.productMixChanged);

  if (listMode === "patch" && detailRows.length && existingHtml) {
    const existingRows = parseDetailRowsFromNoteHtml(existingHtml);
    detailRows = patchDetailRows(existingRows, detailRows);
  }

  if (!detailRows.length) return null;

  const preservedCommercial = extractCommercialSummaryFromNoteHtml(existingHtml);
  const preservedTitle = extractTitleFromNoteHtml(existingHtml);

  const commercialLines =
    productMixChanged && orderDraft.commercial?.lines?.length
      ? orderDraft.commercial.lines
      : productMixChanged && vars.quote?.product_text
        ? [
            {
              name: vars.quote.product_text,
              quantity: vars.quote.quantity,
              variant_notes: orderDraft.commercial?.variant_notes || "",
            },
          ]
        : [];

  return {
    html: buildOdooOrderNoteHtml({
      title:
        preservedTitle ||
        orderDraft.title ||
        vars.quote?.order_or_team_name_for_billing ||
        "Pedido",
      commercialSummaryHtml:
        productMixChanged && commercialLines.length ? "" : preservedCommercial,
      commercialLines: productMixChanged && commercialLines.length ? commercialLines : [],
      detailRows,
      listLayout: orderDraft.detail?.excel_layout || orderDraft.detail?.layout || null,
      projectName: orderDraft.project?.name || null,
      blockers: productMixChanged ? orderDraft.blockers || [] : [],
      referenceFiles: (orderDraft.attachments || [])
        .filter((a) => a.role === "design_reference")
        .map((a) => a.filename || a.url),
      designNotes: orderDraft.design_notes || null,
    }),
    rowCount: detailRows.length,
    productMixChanged,
  };
}

export async function applyOrderCorrection(executeKw, {
  orderId,
  orderNoteHtml,
  changeType,
  changeSummary,
  staffLabel,
  attachments,
  rowCount,
  listMode,
  attachmentsOnly,
  productMixChanged,
  newRows,
}) {
  const bundle = await loadOrderBundle(executeKw, orderId);
  if (!bundle) throw new Error("order_not_found");

  const { order, task, mapped } = bundle;
  if (!mapped.editable) {
    return {
      ok: false,
      error: "order_locked",
      message: mapped.lock_reason,
      order: mapped,
    };
  }

  const hasList = orderNoteHtml && orderNoteHtml.length >= 40;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  const beforeLines = await executeKw(
    "sale.order.line",
    "search_read",
    [[["order_id", "=", order.id]]],
    {
      fields: ["id", "product_id", "name", "product_uom_qty", "price_unit", "write_date"],
      limit: 200,
      order: "id asc",
    }
  );

  if (!hasList && !attachmentsOnly) {
    return {
      ok: false,
      error: "missing_list",
      message: "Falta lista (organización de datos) o adjuntos.",
      order: mapped,
    };
  }

  if (hasList && task?.id) {
    // Tarea = fuente de verdad de la lista (staff puede editar description).
    await executeKw("project.task", "write", [[task.id], { description: orderNoteHtml }]);
  }

  // Presupuesto SO: espejo de la lista cuando el SO existe.
  let soLineUpdates = { updates: [], unmatched: [] };
  if (hasList) {
    await executeKw("sale.order", "write", [[order.id], { note: orderNoteHtml }]);
    if (productMixChanged) {
      soLineUpdates = await syncSoLinesFromProductMix(executeKw, order.id, newRows || []);
    }
  }

  const revision = await archiveOrderRevision(executeKw, {
    order,
    task,
    beforeLines,
    changeType,
    changeSummary,
    staffLabel,
    listMode: listMode || (hasList ? "full" : "attachments_only"),
    rowCount: hasList ? rowCount || 0 : 0,
    productMixChanged,
  });
  const chatterBody = buildCorrectionChatterHtml({
    changeType,
    changeSummary,
    staffLabel,
    orderName: order.name,
    rowCount: hasList ? rowCount || 0 : 0,
    productMixChanged,
    revisionNumber: revision.number,
  });

  try {
    await executeKw(
      "sale.order",
      "message_post",
      [[order.id]],
      {
        body: chatterBody,
        message_type: "comment",
        subtype_xmlid: "mail.mt_note",
      }
    );
  } catch (_e) {
    await executeKw("sale.order", "message_post", [[order.id]], {
      body: chatterBody,
      message_type: "comment",
    });
  }

  let attachResult = { uploaded: [], errors: [] };
  if (hasAttachments) {
    // Adjuntos al presupuesto (SO); también a tarea si existe.
    const soAttach = await attachDraftFiles(executeKw, "sale.order", order.id, attachments);
    let taskAttach = { uploaded: [], errors: [] };
    if (task?.id) {
      taskAttach = await attachTaskDraftFiles(executeKw, task.id, attachments);
    }
    const seen = new Set();
    const uploaded = [];
    for (const u of [...(soAttach.uploaded || []), ...(taskAttach.uploaded || [])]) {
      const key = `${u.name || ""}:${u.id || u.skipped || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uploaded.push(u);
    }
    attachResult = {
      uploaded,
      errors: [...(soAttach.errors || []), ...(taskAttach.errors || [])],
    };
  }

  const summaryParts = [`${order.name}`];
  if (hasList) summaryParts.push(`${rowCount || 0} filas en nota/lista`);
  if (attachResult.uploaded.length) summaryParts.push(`${attachResult.uploaded.length} adjunto(s)`);
  summaryParts.push(
    productMixChanged ? "SO líneas actualizadas" : hasList ? "SO nota actualizada" : "SO sin cambios de líneas"
  );
  summaryParts.push(`revisión V${String(revision.number).padStart(4, "0")}`);

  return {
    ok: true,
    order: mapped,
    summary: summaryParts.join(" · "),
    attachments_uploaded: attachResult.uploaded.length,
    attachments_errors: attachResult.errors,
    list_mode: listMode || (hasList ? "full" : "attachments_only"),
    product_mix_changed: productMixChanged,
    so_line_updates: soLineUpdates.updates,
    so_line_unmatched: soLineUpdates.unmatched,
    revision,
    excel_warning: EXCEL_VERIFY_WARNING,
  };
}
