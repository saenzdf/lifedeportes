/**
 * Parseo determinístico de lista de jugadores desde texto libre o JSON de visión.
 */

import { compact, normalizeBoolean, toDetailRow } from "./order_detail_shared.js";
import { detectListSectionHeader } from "./list_section_products.js";

function splitListParts(raw) {
  if (raw.includes("·")) {
    return raw.split(/\s*·\s*/).map(compact).filter(Boolean);
  }
  return raw
    .split(/\s*(?:,|;|\||\/| - | – | — |\t)\s*/)
    .map(compact)
    .filter(Boolean);
}

export function parseLine(line, section = null) {
  const raw = compact(line).replace(/^\d{1,3}\s*[.)-]\s+/, "");
  if (!raw) return null;
  if (/^(lista|advertencias?)\b/i.test(raw)) return null;

  let parts = splitListParts(raw);
  if (parts.length === 1) {
    const tokens = raw.split(/\s+/).filter(Boolean);
    if (tokens.length >= 3) parts = tokens;
  }

  const parsed = {
    nombre_uniforme: null,
    talla: null,
    numero: null,
    manga: null,
    genero: null,
    camiseta: section?.camiseta ?? false,
    uniforme: section?.uniforme ?? true,
    arquero: false,
    comentario: null,
    rol: section?.rol || null,
    product_line_key: section?.key || null,
    product_text: section?.product_text || null,
    garment_type: section?.garment_type || null,
    category: section?.category || null,
    variant_notes: section?.variant_notes || null,
    raw_text: raw,
  };

  const first = parts[0] || raw;
  if (
    parts.length >= 3 &&
    /^(xs|s|m|l|xl|2xl|3xl|4xl|\d{1,2})$/i.test(parts[1]) &&
    /^#?\d{1,3}$/.test(parts[2])
  ) {
    parsed.nombre_uniforme = first;
    parsed.talla = parts[1].toUpperCase();
    parsed.numero = parts[2].replace("#", "");
    for (const part of parts.slice(3)) applyTailToken(parsed, part);
    if (section?.imprint_note && !parsed.numero) {
      parsed.comentario = parsed.comentario
        ? `${section.imprint_note} · ${parsed.comentario}`
        : section.imprint_note;
    }
    return parsed;
  }

  parsed.nombre_uniforme = first;

  for (const part of parts.slice(1)) {
    if (!parsed.numero && /^#\s*([oO]?\d{1,3}|sin\s+dorsal)$/i.test(part)) {
      const m = part.match(/^#\s*(.+)$/i);
      const val = compact(m?.[1] || "");
      if (!/^sin\s+dorsal$/i.test(val)) parsed.numero = val.replace(/^[oO]/, "");
      continue;
    }
    if (!parsed.talla && /^(xs|s|m|l|xl|2xl|3xl|4xl|\d{1,2})$/i.test(part)) {
      parsed.talla = part.toUpperCase();
      continue;
    }
    if (!parsed.numero && /^#?\d{1,3}$/.test(part)) {
      parsed.numero = part.replace("#", "");
      continue;
    }
    if (/^sin\s+dorsal$/i.test(part)) continue;
    const tallaColor = part.match(/^([A-Za-z0-9\-]+)\s*\(([^)]+)\)\s*(.*)$/);
    if (tallaColor && !parsed.talla) {
      parsed.talla = tallaColor[1].toUpperCase();
      const note = compact(tallaColor[2]);
      if (note) parsed.comentario = parsed.comentario ? `${parsed.comentario}; ${note}` : note;
      if (/(arquer|porter)/i.test(tallaColor[3] || "")) parsed.arquero = true;
      continue;
    }
    applyTailToken(parsed, part);
  }

  if (!parsed.nombre_uniforme) return null;
  if (section?.imprint_note && !parsed.numero) {
    parsed.comentario = parsed.comentario
      ? `${section.imprint_note} · ${parsed.comentario}`
      : section.imprint_note;
  }
  return parsed;
}

function applyTailToken(parsed, part) {
  if (!parsed.manga && /(larga|corta|sisa|normal)/i.test(part)) {
    if (/larga/i.test(part)) parsed.manga = "larga";
    else if (/sisa/i.test(part)) parsed.manga = "sisa";
    else if (/corta/i.test(part)) parsed.manga = "corta";
    else parsed.manga = "normal";
    return;
  }
  if (!parsed.genero && /(masculino|hombre|mas\b|femenino|mujer|fem\b)/i.test(part)) {
    parsed.genero = /(femenino|mujer|fem\b)/i.test(part) ? "femenino" : "masculino";
    return;
  }
  if (/(arquer|porter)/i.test(part)) {
    parsed.arquero = true;
    const numInPart = part.match(/\b(\d{1,3})\b/);
    if (!parsed.numero && numInPart) parsed.numero = numInPart[1];
    return;
  }
  const colorMatch = part.match(/^\(([^)]+)\)\s*(.*)$/);
  if (colorMatch) {
    const note = compact(colorMatch[1]);
    if (note) parsed.comentario = parsed.comentario ? `${parsed.comentario}; ${note}` : note;
    if (/(arquer|porter)/i.test(colorMatch[2] || "")) parsed.arquero = true;
    return;
  }
  parsed.comentario = parsed.comentario ? `${parsed.comentario}; ${part}` : part;
}

export function normalizeRawRow(row) {
  if (!row || typeof row !== "object") return null;
  const nombre = compact(
    row.nombre_uniforme || row.nombre || row.name || row["NOMBRE EN UNIFORME"] || row.NOMBRE
  );
  if (!nombre) return null;

  const generoRaw = compact(row.genero || row.GENERO || row.grupo || "");
  const mas = normalizeBoolean(row.mas || row.MAS);
  const fem = normalizeBoolean(row.fem || row.FEM);

  return {
    nombre_uniforme: nombre,
    talla: compact(row.talla || row.TALLA || row.size || "") || null,
    numero: compact(row.numero || row.NUMERO || row.number || row.dorsal || "") || null,
    manga: compact(row.manga || row["Larga/Corta"] || row.MANGA || row.sleeve || "") || null,
    genero:
      generoRaw.toLowerCase() || (fem ? "femenino" : mas ? "masculino" : null),
    arquero: normalizeBoolean(row.arquero || row.ARQUERO),
    rol: compact(row.rol || row.role || row.variante || "") || null,
    product_line_key: row.product_line_key || null,
    product_text: row.product_text || null,
    garment_type: row.garment_type || null,
    category: row.category || null,
    camiseta: row.camiseta,
    uniforme: row.uniforme,
  };
}

export function extractJsonArrayFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;

  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.rows)) return parsed.rows;
    if (Array.isArray(parsed?.detail_rows)) return parsed.detail_rows;
  } catch {
    /* try bracket slice */
  }

  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

export function buildLinesFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];

  const jsonRows = extractJsonArrayFromText(raw);
  if (jsonRows) {
    return jsonRows.map(normalizeRawRow).filter(Boolean).map(toDetailRow).filter(Boolean);
  }

  const rows = [];
  let section = null;

  for (const line of raw.split(/\n+/)) {
    const trimmed = compact(line);
    if (!trimmed) continue;
    if (/^\*\*.*\*\*$/.test(trimmed) && !/^\d/.test(trimmed)) continue;

    const header = detectListSectionHeader(trimmed);
    if (header) {
      section = header;
      continue;
    }

    const parsed = parseLine(trimmed, section);
    if (!parsed) continue;

    const detail = toDetailRow({
      nombre_uniforme: parsed.nombre_uniforme,
      talla: parsed.talla,
      numero: parsed.numero,
      manga: parsed.manga,
      genero: parsed.genero,
      arquero: parsed.arquero,
      camiseta: parsed.camiseta,
      uniforme: parsed.uniforme,
      rol: parsed.rol || parsed.comentario,
      comentario: parsed.comentario,
      product_line_key: parsed.product_line_key,
      product_text: parsed.product_text,
      garment_type: parsed.garment_type,
      category: parsed.category,
      variant_notes: parsed.variant_notes,
    });
    if (detail) rows.push(detail);
  }

  return rows;
}

export function parseTextList(input) {
  const text = String(input.text || input.raw_text || input.vision_text || "").trim();
  const source = compact(input.source || "text").toLowerCase();
  const rows = buildLinesFromText(text);
  return {
    ok: rows.length > 0,
    rows,
    source: source === "image_vision" ? "image_vision" : "text",
    error: rows.length ? null : "no_rows_parsed",
  };
}
