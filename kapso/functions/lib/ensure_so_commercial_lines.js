/**
 * Tras Proposition→SO: crear/actualizar líneas comerciales del presupuesto.
 * Fuentes (prioridad):
 *  1) filas parseadas del Excel/lista
 *  2) brief CRM / note (LIFE_DOSSIER qty, «Uniforme × N»)
 *  3) expected_revenue + producto por defecto (uniforme) si solo hay monto
 *
 * Nunca toca la línea Diseño (LIFE_DESIGN_PRODUCT_ID).
 */

import { compact } from "./order_detail_shared.js";
import { inferCommercialLinesFromDetailRows } from "./list_section_products.js";

function designId(env = {}) {
  return Number(env.LIFE_DESIGN_PRODUCT_ID || 504) || 504;
}

function rowUnitQty(row = {}) {
  return Math.max(1, Number(row.cantidad || row.quantity || row.qty || 1) || 1);
}

/** Extrae estimado { product_text, quantity } desde HTML/texto CRM o note. */
export function parseEstimateFromBrief(htmlOrText = "") {
  const text = String(htmlOrText || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

  const candidates = [];
  const dossierQty = text.match(/^\s*qty\s*:\s*(\d{1,4})\b/im);
  const dossierProduct = text.match(
    /^\s*-\s*(.+?)\s*x\s*(\d{1,4})\s*:/im
  );
  if (dossierProduct) {
    candidates.push({
      product_text: compact(dossierProduct[1]),
      quantity: Number(dossierProduct[2]),
      source: "dossier_line",
    });
  } else if (dossierQty) {
    const prod =
      text.match(/Uniforme de [^\n<]+/i)?.[0] ||
      text.match(/Camiseta[^\n<]{0,40}/i)?.[0] ||
      "Uniforme de Fútbol";
    candidates.push({
      product_text: compact(prod),
      quantity: Number(dossierQty[1]),
      source: "dossier_qty",
    });
  }

  const bullet = text.match(
    /(Uniforme[^\n×x]{0,40}|Camiseta[^\n×x]{0,40})\s*[×x]\s*(\d{1,4})/i
  );
  if (bullet) {
    candidates.push({
      product_text: compact(bullet[1]),
      quantity: Number(bullet[2]),
      source: "brief_bullet",
    });
  }

  const units = text.match(
    /(\d{1,4})\s*(?:u(?:nidades?)?)?\s*(uniformes?(?:\s+de\s+\w+)?|camisetas?)/i
  );
  if (units) {
    const kind = units[2];
    candidates.push({
      product_text: /camiseta/i.test(kind)
        ? "Camiseta deportiva dry-fit"
        : /baloncesto/i.test(kind)
          ? "Uniforme de baloncesto"
          : "Uniforme de Fútbol",
      quantity: Number(units[1]),
      source: "brief_units",
    });
  }

  // Prefer highest quantity with a product name
  candidates.sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0));
  const best = candidates.find((c) => c.quantity >= 1 && c.product_text);
  return best || null;
}

export function commercialLinesFromDetailRows(rows = []) {
  const inferred = inferCommercialLinesFromDetailRows(rows || []);
  if (inferred.length) {
    return inferred.map((l) => ({
      product_text: l.product_text || l.name,
      quantity: Math.max(1, Number(l.quantity || 0) || 1),
      category: l.category || null,
      source: "list_detail",
    }));
  }
  // Fallback: count units even if product flags were weak
  const qty = (rows || []).reduce((s, r) => s + rowUnitQty(r), 0);
  if (!qty) return [];
  let camiseta = 0;
  let uniforme = 0;
  for (const r of rows) {
    const q = rowUnitQty(r);
    if (r.camiseta && !r.uniforme) camiseta += q;
    else if (r.uniforme === true) uniforme += q;
    else if (/camiseta/i.test(String(r.product_text || r.rol || ""))) camiseta += q;
    else uniforme += q;
  }
  if (camiseta >= uniforme && camiseta > 0) {
    return [
      {
        product_text: "Camiseta deportiva dry-fit",
        quantity: camiseta,
        category: "camiseta",
        source: "list_detail_flags",
      },
    ];
  }
  return [
    {
      product_text: "Uniforme de Fútbol",
      quantity: uniforme || qty,
      category: "uniforme",
      source: "list_detail_flags",
    },
  ];
}

async function resolveProductByText(executeKw, productText) {
  const needle = compact(productText);
  if (!needle) return null;
  const terms = [];
  if (/baloncesto/i.test(needle)) terms.push("Uniforme de baloncesto");
  if (/camiseta/i.test(needle)) terms.push("Camiseta deportiva");
  if (/uniforme/i.test(needle) && /f[uú]tbol|dry/i.test(needle)) {
    terms.push("Uniforme de Fútbol");
  }
  if (/chaqueta|rompe/i.test(needle)) terms.push("Chaqueta");
  terms.push(needle.split(/\s+/).slice(0, 3).join(" "));

  for (const term of [...new Set(terms.filter(Boolean))]) {
    const rows =
      (await executeKw(
        "product.product",
        "search_read",
        [[["sale_ok", "=", true], ["name", "ilike", term]]],
        { fields: ["id", "name", "list_price"], limit: 8 }
      )) || [];
    if (!rows.length) continue;
    if (/baloncesto/i.test(needle)) {
      const hit = rows.find((p) => /baloncesto/i.test(p.name));
      if (hit) return hit;
    }
    if (/camiseta/i.test(needle)) {
      const hit = rows.find((p) => /camiseta/i.test(p.name) && !/uniforme/i.test(p.name));
      if (hit) return hit;
    }
    if (/uniforme/i.test(needle)) {
      const hit = rows.find((p) => /uniforme/i.test(p.name));
      if (hit) return hit;
    }
    return rows[0];
  }
  return null;
}

/**
 * @param {{ executeKw: Function }} odoo
 * @param {{
 *   orderId: number,
 *   leadId?: number,
 *   detailRows?: array,
 *   designProductId?: number,
 *   env?: object,
 * }} opts
 */
export async function ensureSoCommercialLines(odoo, opts = {}) {
  const orderId = Number(opts.orderId || 0);
  if (!orderId) return { created: [], updated: [], skipped: true, reason: "no_order_id" };

  const { executeKw } = odoo;
  const designProductId = Number(opts.designProductId || designId(opts.env || {}));

  const existing =
    (await executeKw(
      "sale.order.line",
      "search_read",
      [[["order_id", "=", orderId]]],
      { fields: ["id", "product_id", "product_uom_qty", "price_unit", "name"], limit: 80 }
    )) || [];

  const hasCommercial = existing.some((l) => {
    const pid = Number(Array.isArray(l.product_id) ? l.product_id[0] : l.product_id) || 0;
    return pid && pid !== designProductId && Number(l.product_uom_qty || 0) > 0;
  });

  let wanted = commercialLinesFromDetailRows(opts.detailRows || []);

  if (!wanted.length) {
    // CRM / note brief
    let brief = "";
    if (opts.leadId) {
      const leads = await executeKw(
        "crm.lead",
        "read",
        [[opts.leadId]],
        { fields: ["description", "expected_revenue", "name"] }
      );
      brief = leads?.[0]?.description || "";
      const est = parseEstimateFromBrief(brief);
      if (est) wanted = [{ ...est, category: /camiseta/i.test(est.product_text) ? "camiseta" : "uniforme" }];
      // If only revenue and no qty text, skip inventing qty
    }
    if (!wanted.length) {
      const orders = await executeKw(
        "sale.order",
        "read",
        [[orderId]],
        { fields: ["note"] }
      );
      const est = parseEstimateFromBrief(orders?.[0]?.note || "");
      if (est) wanted = [{ ...est, category: /camiseta/i.test(est.product_text) ? "camiseta" : "uniforme" }];
    }
  }

  if (!wanted.length) {
    return {
      created: [],
      updated: [],
      skipped: true,
      reason: hasCommercial ? "already_has_commercial" : "no_estimate_or_lista",
      existing_commercial: hasCommercial,
    };
  }

  const created = [];
  const updated = [];

  for (const line of wanted) {
    const qty = Math.max(1, Number(line.quantity || 0) || 1);
    const product = await resolveProductByText(executeKw, line.product_text);
    if (!product?.id) {
      created.push({
        error: "product_not_found",
        product_text: line.product_text,
        quantity: qty,
        source: line.source,
      });
      continue;
    }
    if (product.id === designProductId) continue;

    const match = existing.find(
      (l) => Number(Array.isArray(l.product_id) ? l.product_id[0] : l.product_id) === product.id
    );
    if (match) {
      const cur = Number(match.product_uom_qty || 0);
      if (cur !== qty) {
        await executeKw("sale.order.line", "write", [
          [match.id],
          { product_uom_qty: qty },
        ]);
        updated.push({
          line_id: match.id,
          product_id: product.id,
          from: cur,
          to: qty,
          source: line.source,
        });
      } else {
        updated.push({
          line_id: match.id,
          product_id: product.id,
          matched: true,
          qty,
          source: line.source,
        });
      }
      continue;
    }

    // If SO already has another commercial product and this is estimate fallback, still add
    const lineId = await executeKw("sale.order.line", "create", [
      {
        order_id: orderId,
        product_id: product.id,
        product_uom_qty: qty,
        price_unit: Number(line.unit_cop || product.list_price || 0) || 0,
        name: compact(line.product_text) || product.name,
      },
    ]);
    created.push({
      line_id: lineId,
      product_id: product.id,
      quantity: qty,
      product_name: product.name,
      source: line.source,
    });
  }

  return {
    created,
    updated,
    skipped: false,
    reason: "ok",
    wanted,
  };
}
