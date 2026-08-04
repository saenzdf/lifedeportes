/**
 * HTML para sale.order.note y project.task.description (sin cliente ni precios).
 * Usado en build-quote-payload y odoo-create-lead-and-so.
 */

import { toDetailRow, compact, stripOppPrefix } from "./order_detail_shared.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeMangaGroup(manga) {
  const m = compact(manga).toLowerCase();
  const hasLarga = /larga/.test(m);
  const hasCorta = /corta|sisa/.test(m);
  if (hasLarga && hasCorta) return "mixta";
  if (hasLarga) return "larga";
  if (hasCorta) return "corta";
  return "otra";
}

/** Unidades por tipo de manga desde cantidad / «2 LARGA+1 CORTA». */
function unitPartsForRow(raw) {
  const row = toDetailRow(raw) || raw;
  if (Array.isArray(row?.manga_parts) && row.manga_parts.length) {
    return row.manga_parts.map((p) => ({
      manga: compact(p.manga).toLowerCase() || "otra",
      qty: Math.max(1, Number(p.qty) || 1),
    }));
  }
  const qty = Math.max(1, Number(row?.cantidad || raw?.cantidad || 1) || 1);
  const g = normalizeMangaGroup(raw?.manga || row?.manga);
  if (g === "mixta") return [{ manga: "mixta", qty }];
  return [{ manga: g === "otra" ? "otra" : g, qty }];
}

/** Quita manga duplicada del rol cuando la tabla ya va agrupada por manga. */
function stripMangaFromRol(rolVariante) {
  return compact(rolVariante)
    .split(" · ")
    .filter(
      (p) =>
        p &&
        !/^(corta|larga|manga\s*cort|manga\s*larg|sisa)$/i.test(p.trim()) &&
        !/^manga\s/i.test(p) &&
        !/^\d+\s*LARGA(\s*\+\s*\d+\s*CORTA)?$/i.test(p.trim()) &&
        !/^\d+\s*CORTA$/i.test(p.trim())
    )
    .join(" · ");
}

/** Quita etiqueta de producto cuando el título de tabla ya dice Uniforme/Camiseta. */
function stripProductFromRol(rolVariante) {
  return compact(rolVariante)
    .split(" · ")
    .filter((p) => p && !/^(uniforme|camiseta|conjunto)$/i.test(p.trim()))
    .join(" · ");
}

/**
 * Tipo de prenda para agrupar tablas: uniforme (conjunto) | camiseta | pantaloneta | otro.
 */
export function productKindFromRow(raw) {
  const row = toDetailRow(raw) || raw || {};
  if (row.pantaloneta || raw?.pantaloneta) return "pantaloneta";
  if (row.camiseta || raw?.camiseta) return "camiseta";
  if (row.uniforme === false && !row.camiseta) return "otro";
  if (row.uniforme || raw?.uniforme) return "uniforme";
  const rol = compact(row.rol || raw?.rol || "");
  if (/pantaloneta|short/i.test(rol)) return "pantaloneta";
  if (/camiseta/i.test(rol)) return "camiseta";
  if (/uniforme|conjunto/i.test(rol)) return "uniforme";
  return "uniforme";
}

const PRODUCT_LABEL = {
  uniforme: "Uniforme (conjunto)",
  camiseta: "Camiseta",
  pantaloneta: "Pantaloneta",
  otro: "Otro",
};

const PRODUCT_ORDER = ["uniforme", "camiseta", "pantaloneta", "otro"];
const MANGA_ORDER = ["corta", "larga", "mixta", "otra"];

export function countVariantSummary(rows) {
  const summary = {
    manga_corta: 0,
    manga_larga: 0,
    arquero: 0,
    uniforme_corta: 0,
    uniforme_larga: 0,
    camiseta_corta: 0,
    camiseta_larga: 0,
    pantaloneta: 0,
    total: 0,
    filas: 0,
  };
  for (const raw of rows || []) {
    const row = normalizeDetailRow(raw);
    if (!row) continue;
    summary.filas += 1;
    const parts = unitPartsForRow(raw);
    const rowQty = parts.reduce((s, p) => s + p.qty, 0);
    summary.total += rowQty;
    if (raw.pantaloneta) {
      summary.pantaloneta += rowQty;
      continue;
    }
    const isArquero = raw.arquero || /arquer/i.test(row.rol_variante);
    if (isArquero) summary.arquero += 1;
    // Preferir flags del parser (X Uniforme/Camiseta). No inferir «camiseta» solo porque
    // el comentario liste prendas («Camiseta, Pantaloneta, Pantalon…»).
    const isCamiseta = Boolean(raw.camiseta);
    const isUniforme = Boolean(raw.uniforme) || (!isCamiseta && raw.uniforme !== false);
    const mascArqueroUniforme =
      isArquero && row.grupo === "masculino" && raw.uniforme !== false && !raw.camiseta;

    for (const part of parts) {
      const manga = part.manga === "mixta" ? "otra" : part.manga;
      const q = part.qty;
      if (manga === "larga") summary.manga_larga += q;
      else if (manga === "corta") summary.manga_corta += q;

      if (mascArqueroUniforme) {
        if (manga === "larga") summary.uniforme_larga += q;
        else if (manga === "corta") summary.uniforme_corta += q;
        continue;
      }
      if (isArquero) {
        if (manga === "larga") summary.camiseta_larga += q;
        else if (manga === "corta") summary.camiseta_corta += q;
        continue;
      }
      if (isCamiseta) {
        if (manga === "larga") summary.camiseta_larga += q;
        else if (manga === "corta") summary.camiseta_corta += q;
      } else if (isUniforme) {
        if (manga === "larga") summary.uniforme_larga += q;
        else if (manga === "corta") summary.uniforme_corta += q;
      }
    }
  }
  return summary;
}

function buildVariantSummaryHtml(rows) {
  const s = countVariantSummary(rows);
  if (!s.total) return "";
  const items = [];
  if (s.uniforme_corta) items.push(`<li><strong>Uniforme manga corta:</strong> ${s.uniforme_corta} u.</li>`);
  if (s.uniforme_larga) items.push(`<li><strong>Uniforme manga larga:</strong> ${s.uniforme_larga} u.</li>`);
  if (s.camiseta_corta) items.push(`<li><strong>Camiseta manga corta:</strong> ${s.camiseta_corta} u.</li>`);
  if (s.camiseta_larga) items.push(`<li><strong>Camiseta manga larga:</strong> ${s.camiseta_larga} u.</li>`);
  if (s.pantaloneta) {
    items.push(`<li><strong>Pantaloneta / short:</strong> ${s.pantaloneta} u. <em>(solo pantaloneta, ver comentario en lista)</em></li>`);
  }
  if (s.arquero) {
    items.push(
      `<li><strong>Arquero:</strong> ${s.arquero} u. <em>(comentario en lista; mismo precio camiseta/uniforme, sin cargo adicional)</em></li>`
    );
  }
  if (!items.length) return "";
  return `<h2>Resumen por producto y manga</h2>
<ul>
  ${items.join("\n  ")}
</ul>`;
}

function isNoiseCommentFrag(frag) {
  const f = compact(frag);
  if (!f) return true;
  if (/^(campo|camiseta|uniforme|pantaloneta|conjunto|producto)$/i.test(f)) return true;
  if (/^solo\s*pantaloneta$/i.test(f)) return true;
  if (/^familia\s/i.test(f)) return true;
  if (/^×\d+$/i.test(f)) return true;
  return false;
}

/** Comentario de fila para la tabla: Arquero solo si viene del Excel; sin inventar «Campo». */
function buildRowComment(canonical) {
  const parts = [];
  if (canonical.arquero) parts.push("Arquero");

  const comentario = compact(canonical.comentario);
  if (comentario) {
    for (const frag of comentario.split(" · ").map((s) => s.trim()).filter(Boolean)) {
      if (isNoiseCommentFrag(frag)) continue;
      if (/arquer|porter/i.test(frag) && canonical.arquero) continue;
      if (parts.some((p) => p.toLowerCase() === frag.toLowerCase())) continue;
      parts.push(frag);
    }
  }

  // No copiar rol genérico (Campo / Camiseta / Uniforme) a la tabla.
  const rol = compact(canonical.rol);
  if (rol) {
    for (const frag of rol.split(" · ").map((s) => s.trim()).filter(Boolean)) {
      if (isNoiseCommentFrag(frag)) continue;
      if (/arquer|porter/i.test(frag)) {
        if (!canonical.arquero && !parts.some((p) => /arquer/i.test(p))) parts.push("Arquero");
        continue;
      }
      if (parts.some((p) => p.toLowerCase() === frag.toLowerCase())) continue;
      parts.push(frag);
    }
  }

  if (canonical.nombre_vacio_impresion && !compact(canonical.nombre)) {
    parts.push("sin nombre en uniforme");
  }
  return parts.join(" · ");
}

function normalizeDetailRow(row) {
  if (!row || typeof row !== "object") return null;
  const canonical = toDetailRow(row);
  if (!canonical) return null;
  const nombre = compact(canonical.nombre);
  const numero = compact(canonical.numero);
  const talla = compact(canonical.talla);
  const manga = compact(canonical.manga);
  const cantidad = Math.max(1, Number(canonical.cantidad || 1) || 1);
  const grupoNorm = canonical.grupo || "general";
  const comentario = buildRowComment(canonical);

  return {
    numero: numero || "",
    nombre,
    talla: talla || "",
    cantidad,
    manga,
    comentario,
    // legacy alias: solo para family/product column paths
    rol_variante: comentario,
    grupo: grupoNorm,
    arquero: Boolean(canonical.arquero),
  };
}

function buildDetailTableHtml(title, rows, opts = {}) {
  if (!rows.length) return "";
  const showProduct = Boolean(opts.productColumnLabel);
  const colProduct = opts.productColumnLabel || "Producto";
  const showQty = opts.showCantidad || rows.some((r) => Number(r.cantidad || 1) > 1);
  const showManga = rows.some((r) => compact(r.manga));
  const hasExtra = rows.some(
    (r) => compact(r.nombre_completo) || (r.impresion_trasera && !r.nombre_completo)
  );

  const formatMangaVal = (m) => {
    const v = compact(m).toUpperCase();
    if (v === "C" || v.includes("CORTA")) return "Corta";
    if (v === "L" || v.includes("LARGA")) return "Larga";
    if (v === "S" || v.includes("SISA")) return "Sisa";
    return v || "Corta";
  };

  const body = rows
    .map((row, idx) => {
      const bg = idx % 2 ? ' style="background-color:#f9f9f9;"' : "";
      const mangaCell = showManga
        ? `<td style="text-align:center; padding: 8px;">${escapeHtml(formatMangaVal(row.manga))}</td>`
        : "";
      const qtyCell = showQty
        ? `<td style="text-align:center; padding: 8px;">${escapeHtml(String(row.cantidad || 1))}</td>`
        : "";
      const productCell = showProduct
        ? `<td style="padding: 8px;">${escapeHtml(row.rol_variante || "—")}</td>`
        : "";
      const commentCell = hasComment
        ? `<td style="padding: 8px;">${escapeHtml(compact(row.comentario) || "")}</td>`
        : "";
      const extraCell = hasExtra
        ? `<td style="padding: 8px;">${escapeHtml(compact(row.nombre_completo || row.impresion_trasera) || "")}</td>`
        : "";
      return `<tr${bg}><td style="text-align:center; padding: 8px;">${escapeHtml(row.numero || "—")}</td><td style="padding: 8px;">${escapeHtml(row.nombre || "—")}</td><td style="text-align:center; padding: 8px;">${escapeHtml(row.talla || "—")}</td>${mangaCell}${qtyCell}${productCell}${commentCell}${extraCell}</tr>`;
    })
    .join("\n    ");

  const mangaHead = showManga
    ? `<th style="text-align:center; padding: 8px;">Manga</th>`
    : "";
  const qtyHead = showQty
    ? `<th style="text-align:center; padding: 8px;">Cant.</th>`
    : "";
  const productHead = showProduct
    ? `<th style="text-align:left; padding: 8px;">${escapeHtml(colProduct)}</th>`
    : "";
  const commentHead = hasComment
    ? `<th style="text-align:left; padding: 8px;">Comentario</th>`
    : "";
  const extraHead = hasExtra
    ? `<th style="text-align:left; padding: 8px;">Nombre completo / Registro</th>`
    : "";

  return `<h2>${escapeHtml(title)}</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      ${mangaHead}
      ${qtyHead}
      ${productHead}
      ${commentHead}
      ${extraHead}
    </tr>
  </thead>
  <tbody>
    ${body}
  </tbody>
</table>`;
}

function groupDetailRows(rows) {
  const groups = { masculino: [], femenino: [], general: [] };
  for (const raw of rows) {
    const row = normalizeDetailRow(raw);
    if (!row) continue;
    const key = groups[row.grupo] ? row.grupo : "general";
    groups[key].push({ raw, row });
  }
  return groups;
}

function genderProductMangaTitle(genderLabel, productKind, mangaKey) {
  const who = genderLabel === "Masculino" ? "jugadores" : genderLabel === "Femenino" ? "jugadoras" : "detalle";
  const product = PRODUCT_LABEL[productKind] || PRODUCT_LABEL.otro;
  const mangaLabel =
    mangaKey === "corta"
      ? "Manga corta"
      : mangaKey === "larga"
        ? "Manga larga"
        : mangaKey === "mixta"
          ? "Manga mixta"
          : mangaKey === "otra"
            ? null
            : mangaKey;
  if (mangaLabel) return `Lista de ${who} (${genderLabel}) — ${product} · ${mangaLabel}`;
  return `Lista de ${who} (${genderLabel}) — ${product}`;
}

/**
 * Expande una fila a entradas de tabla por (producto × manga × qty).
 * «2 LARGA+1 CORTA» → una fila en manga larga (cant 2) y otra en corta (cant 1).
 */
function expandItemsForProductMangaTables(items) {
  const out = [];
  for (const { raw, row } of items) {
    const product = productKindFromRow(raw);
    const parts = unitPartsForRow(raw);
    const comentario = compact(row.comentario);
    for (const part of parts) {
      let mangaKey = part.manga === "mixta" ? "mixta" : part.manga;
      if (!MANGA_ORDER.includes(mangaKey)) mangaKey = "otra";
      out.push({
        product,
        mangaKey,
        row: {
          ...row,
          cantidad: part.qty,
          manga: part.manga,
          comentario,
          rol_variante: comentario,
        },
      });
    }
  }
  return out;
}

function buildGroupedGenderTables(genderLabel, items) {
  const parts = [];
  const expanded = expandItemsForProductMangaTables(items);
  const showCantidad = expanded.some((e) => Number(e.row.cantidad || 1) > 1);

  const buckets = new Map(); // `${product}|${manga}` → rows
  for (const e of expanded) {
    const key = `${e.product}|${e.mangaKey}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(e.row);
  }

  for (const product of PRODUCT_ORDER) {
    for (const mangaKey of MANGA_ORDER) {
      const rows = buckets.get(`${product}|${mangaKey}`);
      if (!rows?.length) continue;
      parts.push(
        buildDetailTableHtml(genderProductMangaTitle(genderLabel, product, mangaKey), rows, {
          showCantidad,
        })
      );
    }
  }
  return parts;
}

function buildGroupedDetailTables(rows) {
  const groups = groupDetailRows(rows);
  const parts = [];
  if (groups.masculino.length) {
    parts.push(...buildGroupedGenderTables("Masculino", groups.masculino));
  }
  if (groups.femenino.length) {
    parts.push(...buildGroupedGenderTables("Femenino", groups.femenino));
  }
  if (groups.general.length) {
    parts.push(buildDetailTableHtml("Lista de detalle", groups.general.map((x) => x.row)));
  }
  return parts;
}

/** Extrae etiqueta de familia desde comentario «Familia NOMBRE». */
export function extractFamilyKey(raw) {
  const c = compact(raw?.comentario || "");
  const m = c.match(/^familia\s+(.+)$/i);
  if (m) return compact(m[1]);
  return "";
}

/** Filas Word Día de la Familia: mayoría con comentario Familia X. */
export function isFamilyDayListRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  let withFam = 0;
  for (const r of rows) {
    if (extractFamilyKey(r)) withFam += 1;
  }
  return withFam >= Math.max(2, Math.floor(rows.length * 0.5));
}

function familyProductLabel(raw) {
  const rol = compact(raw?.rol || "");
  if (/uniforme\s*ni[nñ]os/i.test(rol)) return "Uniforme niños";
  if (/camiseta\s*caballero/i.test(rol)) return "Camiseta caballero";
  if (/camiseta\s*dama/i.test(rol)) return "Camiseta dama";
  if (raw?.uniforme && raw?.grupo === "masculino") return "Uniforme niños";
  if (raw?.camiseta && raw?.grupo === "femenino") return "Camiseta dama";
  if (raw?.camiseta && raw?.grupo === "masculino") return "Camiseta caballero";
  return (
    stripMangaFromRol(rol)
      .split(" · ")
      .filter((p) => p && !/^familia\s/i.test(p))
      .join(" · ") || "—"
  );
}

function normalizeFamilyDayTableRow(raw) {
  const canonical = toDetailRow(raw);
  if (!canonical) return null;
  return {
    numero: compact(canonical.numero) || "—",
    nombre: compact(canonical.nombre),
    talla: compact(canonical.talla) || "—",
    rol_variante: familyProductLabel(raw),
  };
}

function buildFamilyDayProductSummary(rows) {
  let uniforme = 0;
  let dama = 0;
  let caballero = 0;
  for (const raw of rows || []) {
    const label = familyProductLabel(raw);
    if (/uniforme/i.test(label)) uniforme += 1;
    else if (/caballero/i.test(label)) caballero += 1;
    else if (/dama/i.test(label)) dama += 1;
  }
  const items = [];
  if (uniforme) items.push(`<li><strong>Uniforme niños:</strong> ${uniforme} u.</li>`);
  if (dama) items.push(`<li><strong>Camiseta dama:</strong> ${dama} u.</li>`);
  if (caballero) items.push(`<li><strong>Camiseta caballero:</strong> ${caballero} u.</li>`);
  if (!items.length) return "";
  return `<h2>Resumen por producto</h2>
<ul>
  ${items.join("\n  ")}
</ul>`;
}

function buildFamilyGroupedTables(rows) {
  const order = [];
  const byFamily = new Map();
  for (const raw of rows || []) {
    const key = extractFamilyKey(raw) || "Sin familia";
    if (!byFamily.has(key)) {
      byFamily.set(key, []);
      order.push(key);
    }
    const row = normalizeFamilyDayTableRow(raw);
    if (row) byFamily.get(key).push(row);
  }
  const parts = [];
  for (const key of order) {
    const famRows = byFamily.get(key);
    if (!famRows?.length) continue;
    const title = key === "Sin familia" ? key : `Familia ${key}`;
    parts.push(
      buildDetailTableHtml(title, famRows, { productColumnLabel: "Producto" })
    );
  }
  return parts;
}

function buildCommercialSummaryHtml(lines) {
  if (!Array.isArray(lines) || !lines.length) return "";
  const items = lines
    .map((line) => {
      const qty = Number(line.quantity || line.qty || line.product_uom_qty || 0);
      const label = compact(
        line.label || line.name || line.product_text || line.description
      );
      if (!label || !qty) return null;
      return `<li><strong>${escapeHtml(label)} (${qty} u.):</strong> ${escapeHtml(
        compact(line.variant_notes || line.variant || "")
      )}</li>`;
    })
    .filter(Boolean);
  if (!items.length) return "";
  return `<h2>Resumen de uniformes</h2>
<ul>
  ${items.join("\n  ")}
</ul>`;
}

/**
 * Espejo fiel de una grilla Excel → HTML (formato no reconocido / mirror_v1).
 * No reinterpreta a Life: mismas columnas y celdas que la fuente.
 */
export function trimGrid(grid) {
  if (!Array.isArray(grid) || !grid.length) return [];
  let maxCol = 0;
  let lastRow = -1;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    let rowHas = false;
    for (let c = 0; c < row.length; c++) {
      if (compact(row[c])) {
        rowHas = true;
        if (c > maxCol) maxCol = c;
      }
    }
    if (rowHas) lastRow = r;
  }
  if (lastRow < 0) return [];
  return grid.slice(0, lastRow + 1).map((row) => {
    const out = [];
    for (let c = 0; c <= maxCol; c++) out.push(row?.[c] ?? "");
    return out;
  });
}

export function buildExcelMirrorHtml(grid, opts = {}) {
  const trimmed = trimGrid(grid);
  if (!trimmed.length) return "";
  const sheet = compact(opts.sheetName);
  const title =
    compact(opts.title) ||
    (sheet
      ? `Lista (espejo Excel — pestaña ${sheet})`
      : "Lista (espejo Excel — formato no reconocido)");
  const header = trimmed[0] || [];
  const bodyRows = trimmed.slice(1);
  const th = header
    .map(
      (h) =>
        `<th style="text-align:left; padding: 8px;">${escapeHtml(compact(h) || "—")}</th>`
    )
    .join("");
  const body = bodyRows
    .map((row, idx) => {
      const bg = idx % 2 ? ' style="background-color:#f9f9f9;"' : "";
      const cells = header
        .map((_, c) => `<td style="padding: 8px;">${escapeHtml(compact(row[c]))}</td>`)
        .join("");
      return `<tr${bg}>${cells}</tr>`;
    })
    .join("\n    ");
  return `<h2>${escapeHtml(title)}</h2>
<p><em>Tabla igual al Excel (mismas columnas). Si hay chaquetas, busos o camisas, suelen ir en COMENTARIO / TALLA.</em></p>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">${th}</tr>
  </thead>
  <tbody>
    ${body}
  </tbody>
</table>`;
}

/**
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.commercialSummaryHtml] — HTML ya armado o vacío
 * @param {Array} [opts.commercialLines]
 * @param {Array} [opts.detailRows]
 * @param {string} [opts.projectName]
 * @param {string[]} [opts.blockers]
 * @param {string[]} [opts.referenceFiles]
 * @param {string} [opts.listLayout] — `family_day_docx_v1` | `mirror_v1` | `formato_life_v1`
 * @param {string} [opts.detailLayout] — alias de listLayout
 * @param {string} [opts.designNotes]
 * @param {string} [opts.mirrorHtml] — HTML espejo prearmado
 * @param {Array<Array>} [opts.mirrorGrid] — grilla Excel cruda
 * @param {string} [opts.sheetName]
 */
export function buildOdooOrderNoteHtml(opts = {}) {
  const title = stripOppPrefix(compact(opts.title) || "Pedido") || "Pedido";
  const parts = [`<h1>${escapeHtml(title)}</h1>`];

  const summary =
    compact(opts.commercialSummaryHtml) ||
    buildCommercialSummaryHtml(opts.commercialLines || []);
  if (summary) parts.push(summary);

  if (Array.isArray(opts.blockers) && opts.blockers.length) {
    parts.push(
      `<h2>Bloqueadores (confirmar)</h2>
<ul>
  ${opts.blockers.map((b) => `<li>${escapeHtml(b)}</li>`).join("\n  ")}
</ul>`
    );
  }

  const detailRows = opts.detailRows || [];
  const listLayout = compact(opts.listLayout || opts.detailLayout || "");
  const mirrorHtml =
    compact(opts.mirrorHtml) ||
    (opts.mirrorGrid?.length
      ? buildExcelMirrorHtml(opts.mirrorGrid, {
          sheetName: opts.sheetName,
          title: opts.mirrorTitle,
        })
      : "");
  const preferMirror =
    Boolean(mirrorHtml) &&
    (/^mirror/i.test(listLayout) ||
      listLayout === "generic" ||
      opts.useMirror === true ||
      !detailRows.length);

  if (preferMirror) {
    parts.push(mirrorHtml);
  } else {
    const useFamilyGrouping =
      listLayout === "family_day_docx_v1" || isFamilyDayListRows(detailRows);

    const groups = groupDetailRows(detailRows);

    if (useFamilyGrouping) {
      const famSummary = buildFamilyDayProductSummary(detailRows);
      if (famSummary) parts.push(famSummary);
      const familyTables = buildFamilyGroupedTables(detailRows);
      if (familyTables.length) parts.push(...familyTables);
    } else {
      const variantSummary = buildVariantSummaryHtml(detailRows);
      if (variantSummary) parts.push(variantSummary);

      const groupedTables = buildGroupedDetailTables(detailRows);
      if (groupedTables.length) {
        parts.push(...groupedTables);
      } else {
        if (groups.masculino.length) {
          parts.push(
            buildDetailTableHtml(
              "Lista de jugadores (Masculino)",
              groups.masculino.map((x) => x.row)
            )
          );
        }
        if (groups.femenino.length) {
          parts.push(
            buildDetailTableHtml(
              "Lista de jugadoras (Femenino)",
              groups.femenino.map((x) => x.row)
            )
          );
        }
        if (groups.general.length) {
          parts.push(
            buildDetailTableHtml(
              "Lista de detalle",
              groups.general.map((x) => x.row)
            )
          );
        }
      }
    }
  }

  if (compact(opts.designNotes)) {
    parts.push(`<p>${escapeHtml(opts.designNotes)}</p>`);
  }

  if (Array.isArray(opts.referenceFiles) && opts.referenceFiles.length) {
    parts.push(
      `<h2>Archivos de referencia</h2>
<ul>
  ${opts.referenceFiles.map((f) => `<li>${escapeHtml(f)}</li>`).join("\n  ")}
</ul>`
    );
  }

  if (compact(opts.projectName)) {
    parts.push(`<p>Proyecto: ${escapeHtml(opts.projectName)}</p>`);
  }

  return parts.join("\n\n<hr>\n\n");
}

export function resolveOrderNoteHtml(vars = {}, draftPayload = {}) {
  const orderDraft = vars.order_draft || {};
  const prebuilt = compact(
    orderDraft.notes_for_odoo || draftPayload.order_note_html || vars.quote?.order_note_html
  );
  // Solo respetar prebuilt si ya trae tablas de lista / espejo (no atajos E2E narrativos).
  const looksLikeLista =
    /<table[\s>]/i.test(prebuilt) ||
    /Lista de jugador/i.test(prebuilt) ||
    /espejo Excel/i.test(prebuilt) ||
    /Resumen por variante/i.test(prebuilt);
  if (prebuilt.length > 80 && prebuilt.includes("<") && looksLikeLista) return prebuilt;

  const detailRows =
    orderDraft.detail?.rows ||
    orderDraft.detail_rows ||
    vars.order_details?.lines ||
    draftPayload.detail_rows ||
    [];

  const commercialLines =
    orderDraft.commercial?.lines ||
    draftPayload.rows ||
    draftPayload.commercial_lines ||
    (draftPayload.product_text
      ? [
          {
            name: draftPayload.product_text,
            quantity: draftPayload.quantity,
            variant_notes: [
              draftPayload.variant,
              draftPayload.material,
              Object.values(draftPayload.product_attributes || {}).join(", "),
            ]
              .filter(Boolean)
              .join(" · "),
          },
        ]
      : []);

  const title =
    stripOppPrefix(
      compact(orderDraft.title) ||
        compact(draftPayload.order_or_team_name_for_billing) ||
        compact(vars.quote?.order_or_team_name_for_billing) ||
        compact(vars.quote?.customer_display_name) ||
        compact(vars.lead?.name) ||
        compact(vars.crm?.opportunity_name) ||
        ""
    ) || "Pedido";

  const listLayout =
    orderDraft.detail?.excel_layout ||
    orderDraft.detail?.layout ||
    draftPayload.detail_layout ||
    null;

  return buildOdooOrderNoteHtml({
    title,
    commercialLines,
    detailRows,
    listLayout,
    mirrorHtml: orderDraft.detail?.mirror_html || draftPayload.mirror_html || null,
    mirrorGrid: orderDraft.detail?.mirror_grid || draftPayload.mirror_grid || null,
    sheetName: orderDraft.detail?.sheet_name || draftPayload.sheet_name || null,
    projectName:
      orderDraft.project?.name ||
      vars.user?.odoo_project_name ||
      null,
    blockers: orderDraft.blockers || [],
    referenceFiles: orderDraft.reference_files || [],
    designNotes: orderDraft.design_notes || null,
  });
}
