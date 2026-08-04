/**
 * Parseo unificado de adjuntos lista: Excel (formato life) y Word (tabla familia).
 */

import { compact } from "./order_detail_shared.js";
import { parseLifeExcelBytes } from "./parse_life_excel.js";
import { parseWordDocxBytes } from "./parse_family_day_docx.js";

function isWordListFilename(filename) {
  return /\.docx$/i.test(compact(filename));
}

function isExcelListFilename(filename) {
  return /\.(xlsx|xlsm|xltx|xls|csv)$/i.test(compact(filename));
}

/**
 * @param {Uint8Array} bytes
 * @param {string} filename
 * @param {object} [options] — sheet_name para Excel
 */
export async function parseListAttachmentBytes(bytes, filename = "lista", options = {}) {
  const name = compact(filename) || "lista";

  if (isWordListFilename(name)) {
    return parseWordDocxBytes(bytes, name);
  }

  if (!isExcelListFilename(name) && !options.forceExcel) {
    return {
      ok: false,
      rows: [],
      error: "unsupported_list_format",
      message: "Formato no soportado. Use Excel FORMATO PEDIDO LIFE (.xlsx) o lista Word (.docx).",
    };
  }

  let parsed = await parseLifeExcelBytes(bytes, name, {
    sheetName: compact(options.sheet_name || options.sheetName || ""),
  });

  if (!parsed.ok && parsed.needs_sheet_choice && parsed.sheet_choices?.length) {
    let best = parsed;
    for (const sheetName of parsed.sheet_choices) {
      const attempt = await parseLifeExcelBytes(bytes, name, { sheetName });
      if (attempt.ok && attempt.rows?.length) {
        if (!best.ok || attempt.rows.length > (best.rows?.length || 0)) best = attempt;
      }
    }
    parsed = best;
  }

  return parsed;
}

export { isWordListFilename, isExcelListFilename };
