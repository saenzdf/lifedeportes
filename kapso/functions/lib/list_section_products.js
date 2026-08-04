/**
 * Secciones de lista staff (ej. PRESEAS): chaquetas papás, camisetas papás, uniformes.
 */

import { compact } from "./order_detail_shared.js";

const SECTION_SPECS = [
  {
    key: "chaqueta",
    test: (t) => /chaqueta/i.test(t),
    product_text: "Chaqueta Rompevientos",
    variant_notes: "con forro",
    garment_type: "chaqueta",
    rol: "Chaqueta",
    uniforme: false,
    camiseta: false,
    category: "otros",
  },
  {
    key: "camiseta_papas",
    test: (t) => /camiseta/i.test(t) && /pap[aá]s?|padre|mam[aá]/i.test(t),
    product_text: "Camiseta deportiva dry-fit",
    commercial_group_key: "camiseta_deportiva",
    garment_type: "camiseta_sola",
    rol: "Camiseta papás",
    uniforme: false,
    camiseta: true,
    category: "camiseta",
  },
  {
    key: "camiseta_profe",
    test: (t) => /camiseta/i.test(t) && /profe|coach/i.test(t),
    product_text: "Camiseta deportiva dry-fit",
    commercial_group_key: "camiseta_deportiva",
    imprint_note: "COACH · sin dorsal",
    garment_type: "camiseta_sola",
    rol: "Camiseta profe",
    uniforme: false,
    camiseta: true,
    category: "camiseta",
  },
  {
    key: "uniforme",
    test: (t) => /uniforme/i.test(t),
    product_text: "Uniforme de Fútbol",
    garment_type: "uniforme_completo",
    rol: "Uniforme",
    uniforme: true,
    camiseta: false,
    category: "uniforme",
  },
];

/**
 * Detecta encabezado de bloque en texto lista (termina en «:» o línea corta sin dorsal).
 */
export function detectListSectionHeader(line) {
  const trimmed = compact(line);
  if (!trimmed) return null;
  if (/^\d{1,3}\s*[.)-]\s+\S/.test(trimmed)) return null;

  const label = trimmed.replace(/^\*+|\*+$/g, "").replace(/:+$/, "").trim();
  if (!label || label.length > 72) return null;

  const t = label.toLowerCase();
  if (!/chaqueta|camiseta|uniforme|profe|coach|pap[aá]/i.test(t)) {
    if (!/:$/.test(trimmed)) return null;
  }

  for (const spec of SECTION_SPECS) {
    if (spec.test(t)) {
      return { ...spec };
    }
  }
  return null;
}

export function productLineKeyFromRow(row) {
  return compact(row?.product_line_key || row?.section_key || "");
}

export function defaultProductTextForRow(row) {
  if (compact(row?.product_text)) return compact(row.product_text);
  const key = productLineKeyFromRow(row);
  const spec = SECTION_SPECS.find((s) => s.key === key);
  if (spec) return spec.product_text;
  if (row?.camiseta && !row?.uniforme) return "Camiseta deportiva dry-fit";
  if (row?.uniforme === true) return "Uniforme de Fútbol";
  // Sin evidencia de sección/producto: no inventar Uniforme de Fútbol
  return null;
}

/**
 * Agrupa filas en líneas comerciales distintas (una por producto).
 */
function commercialLineKeyForRow(raw) {
  const lineKey = productLineKeyFromRow(raw);
  const spec = SECTION_SPECS.find((s) => s.key === lineKey);
  return compact(raw?.commercial_group_key || spec?.commercial_group_key || lineKey || "");
}

export function inferCommercialLinesFromDetailRows(rows) {
  const groups = new Map();
  for (const raw of rows || []) {
    const productText = defaultProductTextForRow(raw);
    if (!productText) continue; // sin evidencia de producto: no inventar línea
    const lineKey = productLineKeyFromRow(raw);
    const spec = SECTION_SPECS.find((s) => s.key === lineKey);
    const key = commercialLineKeyForRow(raw) || productText;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: productText,
        product_text: productText,
        quantity: 0,
        garment_type: raw.garment_type || spec?.garment_type || null,
        variant_notes: compact(raw.variant_notes || spec?.variant_notes || "") || null,
        category:
          raw.category ||
          spec?.category ||
          (raw.camiseta ? "camiseta" : raw.uniforme === true ? "uniforme" : "otros"),
      });
    }
    groups.get(key).quantity += Math.max(
      1,
      Number(raw.cantidad || raw.quantity || raw.qty || 1) || 1
    );
  }
  return [...groups.values()].filter((g) => g.quantity > 0);
}

export function hasMultipleProductLines(rows) {
  const keys = new Set();
  for (const row of rows || []) {
    keys.add(commercialLineKeyForRow(row) || defaultProductTextForRow(row));
  }
  return keys.size > 1;
}
