/**
 * sync_order_draft_from_odoo — Kapso ← Odoo (fuente de verdad).
 * Reconstruye resolved_lines + people desde sale.order + spreadsheet.
 */
import {
  attributesFromOdooPtavs,
  buildResolvedLine,
  splitProductDisplayName,
} from "./staff_order_contract.js";
import {
  parsePeopleFromSpreadsheet,
  parsePedidoAttributes,
} from "./sale_order_spreadsheet.js";
import { parseDetailRowsFromNoteHtml } from "./odoo_order_correction.js";

async function odooRpc(env, service, method, args) {
  const resp = await fetch(`${env.ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
    }),
  });
  const json = await resp.json();
  if (json?.error) throw new Error(json.error?.message || "Odoo RPC error");
  return json.result;
}

function decodeSnapshot(b64) {
  if (!b64 || b64 === false) return null;
  try {
    const binary = atob(String(b64));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    try {
      // Node fallback
      const raw = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

export async function syncOrderDraftFromOdoo(env, { orderId, orderName } = {}) {
  if (!env?.ODOO_URL || !env?.ODOO_DB || !env?.ODOO_USERNAME || !env?.ODOO_PASSWORD) {
    return { ok: false, error: "odoo_unavailable" };
  }
  const uid = await odooRpc(env, "common", "authenticate", [
    env.ODOO_DB,
    env.ODOO_USERNAME,
    env.ODOO_PASSWORD,
    {},
  ]);
  if (!uid) return { ok: false, error: "auth_failed" };

  const executeKw = (model, method, positionalArgs = [], kw = {}) =>
    odooRpc(env, "object", "execute_kw", [
      env.ODOO_DB,
      uid,
      env.ODOO_PASSWORD,
      model,
      method,
      positionalArgs,
      kw,
    ]);

  let soId = Number(orderId || 0) || null;
  if (!soId && orderName) {
    const found = await executeKw(
      "sale.order",
      "search_read",
      [[["name", "ilike", String(orderName).replace(/^S0*/i, "")]]],
      { fields: ["id", "name"], limit: 5 }
    );
    const exact = (found || []).find(
      (o) => String(o.name).toUpperCase() === String(orderName).toUpperCase()
    );
    soId = exact?.id || found?.[0]?.id || null;
  }
  if (!soId) return { ok: false, error: "order_not_found" };

  const orders = await executeKw(
    "sale.order",
    "read",
    [[soId]],
    {
      fields: [
        "id",
        "name",
        "state",
        "note",
        "partner_id",
        "order_line",
        "client_order_ref",
        "spreadsheet_ids",
      ],
    }
  );
  const order = orders?.[0];
  if (!order) return { ok: false, error: "order_not_found" };

  const lines = await executeKw(
    "sale.order.line",
    "search_read",
    [[["order_id", "=", soId], ["display_type", "=", false]]],
    {
      fields: [
        "id",
        "name",
        "product_id",
        "product_uom_qty",
        "price_unit",
        "product_template_id",
      ],
    }
  );

  // Lista: staff en tarea = fuente de verdad; fallback note del SO
  const tasks = await executeKw(
    "project.task",
    "search_read",
    [[["sale_order_id", "=", soId]]],
    { fields: ["id", "description", "write_date"], limit: 1, order: "id desc" }
  );
  const task = Array.isArray(tasks) ? tasks[0] : null;
  const taskHtml = String(task?.description || "").trim();
  const noteHtml = String(order.note || "").trim();
  const listaHtml = taskHtml.length >= 40 ? taskHtml : noteHtml;
  const listaSource =
    taskHtml.length >= 40 ? "task.description" : noteHtml ? "sale.order.note" : "none";

  const resolved_lines = [];
  for (let i = 0; i < (lines || []).length; i++) {
    const line = lines[i];
    const productId = line.product_id?.[0];
    if (!productId) continue;
    if (/dise[nñ]o/i.test(line.name || line.product_id?.[1] || "")) continue;

    let ptavs = [];
    const products = await executeKw(
      "product.product",
      "read",
      [[productId]],
      {
        fields: [
          "id",
          "display_name",
          "product_tmpl_id",
          "product_template_attribute_value_ids",
          "list_price",
        ],
      }
    );
    const product = products?.[0];
    if (product?.product_template_attribute_value_ids?.length) {
      ptavs = await executeKw(
        "product.template.attribute.value",
        "read",
        [product.product_template_attribute_value_ids],
        { fields: ["id", "name", "attribute_id"] }
      );
    }
    const split = splitProductDisplayName(product?.display_name || line.name);
    resolved_lines.push(
      buildResolvedLine(
        {
          line_id: `odoo_line_${line.id}`,
          product_text: product?.display_name || line.name,
          product_base: split.product_base,
          product_tmpl_id: product?.product_tmpl_id?.[0] || line.product_template_id?.[0],
          product_variant_id: productId,
          quantity: line.product_uom_qty,
          unit_cop: line.price_unit,
          confidence: "high",
          attributes: {
            ...split.embedded_attrs,
            ...attributesFromOdooPtavs(ptavs),
          },
        },
        i
      )
    );
  }

  let spreadsheetId = null;
  let spreadsheetUrl = null;
  let people = [];
  let pedidoAttrs = [];
  const sheetIds = order.spreadsheet_ids || [];
  if (sheetIds.length) {
    spreadsheetId = sheetIds[sheetIds.length - 1];
    const sheets = await executeKw(
      "sale.order.spreadsheet",
      "read",
      [[spreadsheetId]],
      { fields: ["id", "name", "spreadsheet_snapshot", "order_id"] }
    );
    const sheet = sheets?.[0];
    const snap = decodeSnapshot(sheet?.spreadsheet_snapshot);
    if (snap) {
      people = parsePeopleFromSpreadsheet(snap);
      pedidoAttrs = parsePedidoAttributes(snap);
      // merge pedido attrs into resolved lines by index
      pedidoAttrs.forEach((pa, idx) => {
        if (resolved_lines[idx]) {
          resolved_lines[idx].attributes = {
            ...resolved_lines[idx].attributes,
            ...pa.attributes,
          };
          if (pa.comments) resolved_lines[idx].comments = pa.comments;
          if (pa.product_base) resolved_lines[idx].product_base = pa.product_base;
        }
      });
    }
    spreadsheetUrl = `${env.ODOO_URL}/odoo/sales/${soId}/sale-order-spreadsheet/${spreadsheetId}`;
  }

  const detail = {
    schema_version: "life_order_people_v1",
    source: "odoo_sync",
    lista_source: listaSource,
    parse_status: "ok",
    people,
    person_count: people.length,
    rows: people.map((p) => ({
      nombre: p.identity?.print_name || "",
      numero: p.identity?.number || "",
      talla: p.components?.[0]?.size || "",
      comentario: p.comments || "",
      resolved_line_id: p.resolved_line_id || "",
    })),
  };

  // Si no hay people del spreadsheet, intentar filas desde HTML lista (tarea/note)
  if (!people.length && listaHtml) {
    const rows = parseDetailRowsFromNoteHtml(listaHtml);
    if (rows.length) {
      detail.rows = rows.map((r) => ({
        nombre: r.nombre || "",
        numero: r.numero || "",
        talla: r.talla || "",
        comentario: r.rol || "",
        manga: r.manga || "",
      }));
      detail.person_count = rows.length;
      detail.parse_status = "ok_from_lista_html";
      detail.lista_html_len = listaHtml.length;
    }
  }

  return {
    ok: true,
    order: {
      id: order.id,
      name: order.name,
      state: order.state,
      partner_id: order.partner_id,
    },
    task: task ? { id: task.id, write_date: task.write_date || null } : null,
    lista_source: listaSource,
    order_draft: {
      detail,
      commercial: {
        lines: resolved_lines.map((l) => ({
          product_text: l.product_text,
          quantity: l.quantity,
          category: l.category,
        })),
        resolved_lines,
      },
      spreadsheet: {
        id: spreadsheetId,
        url: spreadsheetUrl,
        status: people.length ? "complete" : "partial",
        source_of_truth: listaSource === "task.description" ? "odoo_task" : "odoo",
      },
      write: {
        status: "ready",
        code: "synced_from_odoo",
        synced_at: new Date().toISOString(),
      },
    },
  };
}

export { syncOrderDraftFromOdoo };
