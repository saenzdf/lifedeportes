/**
 * Parser lista Word — formato Día de la Familia (tabla docx).
 *
 * Cada fila = una familia. El producto lo define la COLUMNA, no el texto de la celda:
 *   UNIFORME NIÑOS | CAMISETA DAMA | CAMISETA CABALLERO
 * Una familia puede tener 0–3 productos (uno por columna con contenido).
 */

import { compact, toDetailRow } from "./order_detail_shared.js";

const PRODUCT_SPECS = [
  {
    key: "uniforme_ninos",
    header: /uniforme\s*ni[nñ]os/i,
    grupo: "masculino",
    rol: "Uniforme niños",
    uniforme: true,
    camiseta: false,
  },
  {
    key: "camiseta_dama",
    header: /camiseta\s*dama/i,
    grupo: "femenino",
    rol: "Camiseta dama",
    uniforme: false,
    camiseta: true,
  },
  {
    key: "camiseta_caballero",
    header: /camiseta\s*caballero/i,
    grupo: "masculino",
    rol: "Camiseta caballero",
    uniforme: false,
    camiseta: true,
  },
];

const FALLBACK_COL_INDEX = [1, 2, 3];

function normalizeNumero(raw) {
  return String(raw || "")
    .replace(/^[oO]/, "")
    .trim();
}

function normalizeCellText(text) {
  return compact(text)
    .replace(/talla\s*(?=[0-9])/gi, "talla ")
    .replace(/\s+/g, " ")
    .trim();
}

function familyNombreFallback(label) {
  const l = compact(label);
  if (!l || /^profe$/i.test(l)) return "";
  const lower = l.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Detecta columnas de producto desde la fila de encabezado.
 * @returns {{ index: number, spec: typeof PRODUCT_SPECS[0] }[]}
 */
export function detectFamilyDayProductColumns(headerRow = []) {
  const found = [];
  for (let i = 0; i < headerRow.length; i++) {
    const h = compact(headerRow[i]);
    if (!h) continue;
    const spec = PRODUCT_SPECS.find((s) => s.header.test(h));
    if (spec) found.push({ index: i, spec });
  }
  if (found.length) return found;
  return FALLBACK_COL_INDEX.map((index, i) => ({ index, spec: PRODUCT_SPECS[i] }));
}

function splitCellChunks(text) {
  const normalized = normalizeCellText(text);
  if (!normalized) return [];

  const chunks = [];
  const parenRe = /\(([^)]+)\)/g;
  let m;
  let hasParen = false;
  while ((m = parenRe.exec(normalized)) !== null) {
    hasParen = true;
    const inner = compact(m[1]);
    if (inner) chunks.push(inner);
  }
  if (hasParen) return chunks;

  return [normalized];
}

/**
 * Extrae personas de una celda (puede haber varias en la misma columna).
 * @param {string} cell
 * @param {{ nombreFallback?: string }} [options]
 */
export function parseEntriesFromListCell(cell, options = {}) {
  const nombreFallback = compact(options.nombreFallback || "");
  const entries = [];
  const used = new Set();

  const add = (nombre, numero, talla) => {
    let n = compact(nombre);
    const num = normalizeNumero(numero);
    const t = compact(talla);
    if (!n && nombreFallback) n = nombreFallback;
    if (!n && num) n = `#${num}`;
    if (!n) return;
    const key = `${n.toLowerCase()}|${num}|${t.toLowerCase()}`;
    if (used.has(key)) return;
    used.add(key);
    entries.push({ nombre: n, numero: num, talla: t });
  };

  for (const chunk of splitCellChunks(cell)) {
    const text = normalizeCellText(chunk);
    if (!text) continue;

    const withHash =
      /([A-Za-zÁÉÍÓÚáéíóúñÑ][A-Za-zÁÉÍÓÚáéíóúñÑ\s.]*?)\s*#\s*([oO]?\d+)\s+talla\s+([A-Za-z0-9\-]+)/gi;
    let m;
    while ((m = withHash.exec(text)) !== null) {
      add(m[1], m[2], m[3]);
    }

    const withNum =
      /([A-Za-zÁÉÍÓÚáéíóúñÑ][A-Za-zÁÉÍÓÚáéíóúñÑ\s.]*?)\s+(\d+)\s+talla\s+([A-Za-z0-9\-]+)/gi;
    while ((m = withNum.exec(text)) !== null) {
      add(m[1], m[2], m[3]);
    }

    const hashOnly = /^#\s*([oO]?\d+)\s+talla\s+([A-Za-z0-9\-]+)$/i;
    const ho = text.match(hashOnly);
    if (ho) {
      add(nombreFallback, ho[1], ho[2]);
      continue;
    }

    const noNum = /([A-Za-zÁÉÍÓÚáéíóúñÑ][A-Za-zÁÉÍÓÚáéíóúñÑ\s.]*?)\s+talla\s+([A-Za-z0-9\-]+)/gi;
    while ((m = noNum.exec(text)) !== null) {
      add(m[1], "", m[2]);
    }
  }

  return entries;
}

export function parseFamilyDayDocxGrid(grid) {
  const rows = [];
  if (!grid?.length) return rows;

  const productCols = detectFamilyDayProductColumns(grid[0]);
  const familyColIdx = productCols[0]?.index > 0 ? 0 : 0;

  for (let ri = 1; ri < grid.length; ri++) {
    const row = grid[ri] || [];
    const label = compact(row[familyColIdx]);
    if (!label || /^total/i.test(label)) break;

    const nombreFallback = familyNombreFallback(label);

    for (const { index, spec } of productCols) {
      const cell = row[index] || "";
      if (!compact(cell)) continue;

      for (const entry of parseEntriesFromListCell(cell, { nombreFallback })) {
        let nombre = entry.nombre;
        if (/^profe$/i.test(label) && !/profe/i.test(nombre)) {
          nombre = `Profe ${nombre}`.trim();
        }
        const detail = toDetailRow({
          nombre,
          numero: entry.numero,
          talla: entry.talla,
          grupo: spec.grupo,
          rol: spec.rol,
          manga: "Corta",
          uniforme: spec.uniforme,
          camiseta: spec.camiseta,
          comentario: label && !/^profe$/i.test(label) ? `Familia ${label}` : "",
        });
        if (detail) rows.push(detail);
      }
    }
  }
  return rows;
}

async function readDocxXml(bytes) {
  const decoder = new TextDecoder();
  const entries = [];
  const sig = [0x50, 0x4b, 0x03, 0x04];
  for (let i = 0; i < bytes.length - 30; i++) {
    if (!sig.every((b, j) => bytes[i + j] === b)) continue;
    let p = i + 30;
    const fnLen = bytes[i + 26] | (bytes[i + 27] << 8);
    const exLen = bytes[i + 28] | (bytes[i + 29] << 8);
    const name = decoder.decode(bytes.slice(p, p + fnLen));
    p += fnLen + exLen;
    const comp = bytes[i + 8] | (bytes[i + 9] << 8);
    const csize = bytes[i + 18] | (bytes[i + 19] << 8) | (bytes[i + 20] << 16) | (bytes[i + 21] << 24);
    entries.push({ name: name.replace(/\\/g, "/"), comp, data: bytes.slice(p, p + csize) });
  }
  const doc = entries.find((e) => e.name === "word/document.xml");
  if (!doc?.data) return "";
  let xmlBytes = doc.data;
  if (doc.comp === 8 && typeof DecompressionStream !== "undefined") {
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([xmlBytes]).stream().pipeThrough(ds);
    xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return new TextDecoder().decode(xmlBytes);
}

function decodeXmlText(s) {
  return String(s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function cellTextFromTc(tcXml) {
  const parts = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)/g;
  let m;
  while ((m = re.exec(tcXml)) !== null) {
    parts.push(decodeXmlText(m[1]));
  }
  return parts.join("").trim();
}

function parseDocxTable(xml) {
  const rows = [];
  const trRe = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/gi;
  let trM;
  while ((trM = trRe.exec(xml)) !== null) {
    const cells = [];
    const tcRe = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/gi;
    let tcM;
    while ((tcM = tcRe.exec(trM[1])) !== null) {
      cells.push(cellTextFromTc(tcM[1]));
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

async function parseFamilyDayDocxBytesImpl(bytes) {
  const xml = await readDocxXml(bytes);
  if (!xml) return { ok: false, rows: [], error: "docx_xml_not_found" };
  const grid = parseDocxTable(xml);
  if (!grid.length) return { ok: false, rows: [], error: "docx_table_empty" };
  const rows = parseFamilyDayDocxGrid(grid);
  const counts = {
    uniforme_ninos: rows.filter((r) => /uniforme niños/i.test(r.rol)).length,
    camiseta_dama: rows.filter((r) => /camiseta dama/i.test(r.rol)).length,
    camiseta_caballero: rows.filter((r) => /caballero/i.test(r.rol)).length,
    total: rows.length,
  };
  return {
    ok: rows.length > 0,
    rows,
    layout: "family_day_docx_v1",
    sheet_name: "docx",
    sheetName: "docx",
    parse_report: {
      summary_text: `Lista Word · ${counts.total} filas · ${counts.uniforme_ninos} uniforme niños · ${counts.camiseta_dama} camiseta dama · ${counts.camiseta_caballero} camiseta caballero`,
      counts,
    },
    error: rows.length ? null : "no_rows_parsed",
  };
}

export async function parseWordDocxBytes(bytes, _filename = "lista.docx") {
  return parseFamilyDayDocxBytesImpl(bytes);
}

/** @deprecated use parseWordDocxBytes */
export const parseFamilyDayDocxBytes = parseWordDocxBytes;
