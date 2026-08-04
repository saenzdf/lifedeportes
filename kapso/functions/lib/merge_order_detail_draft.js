/**
 * Fusión y validación de order_draft.detail vs quote comercial.
 */

import {
  buildDetailSummary,
  buildWarnings,
  detailRowsToPeople,
  mergeDetailRows,
  parseStatusFrom,
  peopleToDetailRows,
} from "./order_detail_shared.js";
import {
  hasMultipleProductLines,
  inferCommercialLinesFromDetailRows,
} from "./list_section_products.js";

export function countExpectedQuantity(vars) {
  const commercial = vars?.order_draft?.commercial?.lines;
  if (Array.isArray(commercial) && commercial.length) {
    return commercial.reduce(
      (sum, line) => sum + Math.max(0, Number(line.quantity || line.qty || 0)),
      0
    );
  }
  return Math.max(0, Number(vars?.quote?.quantity || 0));
}

export function mergeOrderDetailDraft(vars, options = {}) {
  const orderDraft = vars?.order_draft || {};
  const mode = options.mode || "replace";
  const incomingRows =
    options.rows ||
    (options.people ? peopleToDetailRows(options.people) : null) ||
    orderDraft.detail?.rows ||
    (orderDraft.detail?.people ? peopleToDetailRows(orderDraft.detail.people) : []);
  const rows = mergeDetailRows(orderDraft.detail?.rows, incomingRows, mode);
  const people = detailRowsToPeople(rows);
  const warnings = buildWarnings(rows);
  if (hasMultipleProductLines(rows)) {
    warnings.push(
      "Lista con varios productos (secciones). Revise líneas comerciales: chaquetas, camisetas y uniformes por separado."
    );
  }
  const expected = countExpectedQuantity(vars);
  if (expected > 0 && rows.length > 0) {
    const delta = Math.abs(rows.length - expected);
    if (delta > Math.max(2, Math.floor(expected * 0.15))) {
      warnings.push(
        `Conteo lista (${rows.length}) difiere de cantidad comercial (${expected}).`
      );
    }
  }

  const blockers = [...(orderDraft.blockers || [])];
  if (parseStatusFrom(rows, warnings) === "needs_review" && !rows.length) {
    if (!blockers.includes("Falta lista de jugadores (Excel, texto o imagen).")) {
      blockers.push("Falta lista de jugadores (Excel, texto o imagen).");
    }
  }

  const detail = {
    ...(orderDraft.detail || {}),
    schema_version: "life_order_people_v1",
    people,
    person_count: people.length,
    rows,
    row_count: rows.length,
    warnings,
    summary_text: buildDetailSummary(rows),
    parse_status: parseStatusFrom(rows, warnings),
    parsed_at: options.now || new Date().toISOString(),
    source: options.source || orderDraft.detail?.source || null,
  };

  const order_draft = {
    ...orderDraft,
    detail,
    blockers,
  };

  if (hasMultipleProductLines(rows)) {
    order_draft.commercial = {
      ...(orderDraft.commercial || {}),
      lines: inferCommercialLinesFromDetailRows(rows),
      multi_product: true,
    };
  }

  return {
    order_draft,
    detail,
    warnings,
    commercial_lines: order_draft.commercial?.lines || null,
  };
}
