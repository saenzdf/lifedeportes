/**
 * Parseo Excel FORMATO PEDIDO LIFE → filas de lista.
 * Lee .xlsx como ZIP + XML (sin dependencias npm).
 */

import {
  cellInlineNote,
  compact,
  isPantalonetaOnlyText,
  toDetailRow,
} from "./order_detail_shared.js";
import { detectListSectionHeader } from "./list_section_products.js";

function stripDiacritics(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeSheetLabel(name) {
  return stripDiacritics(String(name ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Pestaña estándar Life: «formato life», «formatolife», etc. */
export function isFormatoLifeSheet(name) {
  const n = normalizeSheetLabel(name);
  const compact = n.replace(/\s/g, "");
  if (compact.includes("formatolife")) return true;
  return n.includes("formato") && n.includes("life");
}

/**
 * Elige pestaña a leer. Si hay varias sin «formato life», pide confirmación.
 * @returns {{ pick: {name, path}|null, needsChoice: boolean, choices?: string[], message?: string }}
 */
export function pickLifeExcelSheet(sheets) {
  const list = (sheets || []).filter((s) => s?.path);
  if (!list.length) {
    return { pick: null, needsChoice: false, message: "Excel sin hojas." };
  }

  const formatoLife = list.filter((s) => isFormatoLifeSheet(s.name));
  if (formatoLife.length === 1) {
    return { pick: formatoLife[0], needsChoice: false };
  }
  if (formatoLife.length > 1) {
    return { pick: formatoLife[0], needsChoice: false };
  }

  if (list.length === 1) {
    return { pick: list[0], needsChoice: false };
  }

  const names = list.map((s) => s.name);
  return {
    pick: null,
    needsChoice: true,
    choices: names,
    message: `El Excel tiene varias pestañas (${names.join(", ")}). ¿Cuál usar? Normalmente es «formato life».`,
  };
}

function normCellHeader(v) {
  return stripDiacritics(String(v ?? "")).replace(/\s+/g, " ").trim().toUpperCase();
}

function looksLikeNombreHeader(t) {
  if (!t) return false;
  if (t.includes("NOMBRE") && t.includes("UNIFORME")) return true;
  if (t.includes("NOMBRE") && t.includes("QUE") && t.includes("LLEVAR")) return true;
  if (t.includes("NOMBRE") && (t.includes("LISTADO") || t.includes("JUGADOR") || t.includes("ALUMNO")))
    return true;
  if (t === "NOMBRE EN UNIFORME" || t === "NOMBRE") return true;
  return false;
}

function looksLikeTallaHeader(t) {
  if (!t) return false;
  if (t === "CAMISETA") return false;
  if (t.includes("TALLA")) return true;
  return ["CAMISA", "POLO", "BUSO"].some((x) => t.includes(x));
}

function looksLikeNumeroHeader(t) {
  if (!t) return false;
  if (t === "NO." || t === "NO" || t === "Nº" || t === "N°") return false;
  // CANTIDAD no es dorsal (variante Formato Life con qty por fila).
  if (t.includes("CANTIDAD") || t.includes("CANT.") || t === "QTY" || t === "QUANTITY") return false;
  if (t.includes("NUMERO") || t.includes("NÚMERO") || t.includes("DORSAL")) return true;
  return t === "#";
}

function looksLikeCantidadHeader(t) {
  if (!t) return false;
  if (t.includes("CANTIDAD") || t.includes("CANT.")) return true;
  return t === "QTY" || t === "QUANTITY" || t === "CANT";
}

/**
 * Desglosa manga + cantidad de fila.
 * Casos:
 * - «2 LARGA+1 CORTA» → [{manga:'larga', qty:2}, {manga:'corta', qty:1}]
 * - «3 LARGA» / «3 CORTA» → una parte con ese qty
 * - «LARGA» + CANTIDAD 1 → [{manga:'larga', qty:1}]
 * Si hay números en manga, esos mandan (deben cuadrar con CANTIDAD).
 */
export function parseMangaUnitParts(mangaText, cantidad = 1) {
  const t = compact(mangaText).toUpperCase();
  const qtyCol = Math.max(1, Math.round(Number(cantidad) || 1));
  if (!t) return [{ manga: "otra", qty: qtyCol }];

  let larga = 0;
  let corta = 0;
  for (const m of t.matchAll(/(\d+)\s*LARGA/g)) larga += Number(m[1]) || 0;
  for (const m of t.matchAll(/(\d+)\s*CORTA/g)) corta += Number(m[1]) || 0;
  // «3 SISA» cuenta como corta
  for (const m of t.matchAll(/(\d+)\s*SISA/g)) corta += Number(m[1]) || 0;

  if (larga || corta) {
    const parts = [];
    if (larga) parts.push({ manga: "larga", qty: larga });
    if (corta) parts.push({ manga: "corta", qty: corta });
    return parts;
  }

  if (/LARGA/.test(t) && !/CORTA|SISA/.test(t)) return [{ manga: "larga", qty: qtyCol }];
  if (/CORTA|SISA/.test(t) && !/LARGA/.test(t)) return [{ manga: "corta", qty: qtyCol }];
  if (/LARGA/.test(t) && /CORTA|SISA/.test(t)) {
    // Mixta sin números — no inventar split; 1 unidad mixta
    return [{ manga: "mixta", qty: qtyCol, raw: compact(mangaText) }];
  }
  return [{ manga: "otra", qty: qtyCol }];
}

export function resolveRowCantidad(row, cols) {
  if (cols.ccantidad == null) return 1;
  const raw = cellScalar(row[cols.ccantidad]);
  if (!raw) return 1;
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.round(n));
}

function looksLikeCamisetaHeader(t) {
  if (!t) return false;
  return t === "CAMISETA" || (t.includes("CAMISETA") && t.includes("NUMERO"));
}

function looksLikeMangaHeader(t) {
  if (!t) return false;
  return t.includes("LARGA") || t.includes("CORTA") || t.includes("MANGA") || t.includes("SISA");
}

function looksLikeGeneroMasHeader(t) {
  return t === "MAS" || t === "M" || t === "MASC" || t === "MASCULINO";
}

function looksLikeGeneroFemHeader(t) {
  return t === "FEM" || t === "F" || t === "FEMENINO";
}

function looksLikeArqueroHeader(t) {
  return t.includes("ARQUERO") || t.includes("PORTER");
}

function looksLikeUniformeHeader(t) {
  if (!t) return false;
  if (t.includes("NOMBRE") && t.includes("UNIFORME")) return false;
  return t === "UNIFORME" || t.includes("UNIFORME");
}

function looksLikeComentarioHeader(t) {
  // COMENTARIO / OBSERVACIONES / OBSERVACION — no PRECIO ni otras columnas libres.
  return t.includes("COMENTARIO") || t.includes("OBSERV");
}

function looksLikeDelanteraHeader(t) {
  if (!t) return false;
  return (
    t.includes("DELANTERA") ||
    t.includes("FRENTE") ||
    (t.includes("PARTE") && t.includes("DELANT")) ||
    t === "DEL"
  );
}

function looksLikeTraseraHeader(t) {
  if (!t) return false;
  return (
    t.includes("TRASERA") ||
    t.includes("ESPALDA") ||
    (t.includes("PARTE") && t.includes("TRAS")) ||
    t === "TRAS"
  );
}

/**
 * Une celdas COMENTARIO + OBSERVACIONES (y aliases) sin inventar etiquetas.
 * Delantera/Trasera solo si el encabezado las declara explícitamente.
 */
function readComentarioCells(row, cols) {
  const idxs =
    Array.isArray(cols.ccomentarios) && cols.ccomentarios.length
      ? cols.ccomentarios
      : cols.ccomentario != null
        ? [cols.ccomentario]
        : [];
  const parts = [];
  for (const c of idxs) {
    const v = cellScalar(row[c]);
    if (v) parts.push(v);
  }
  return parts.join(" · ");
}

/** Prefijos Delantera:/Trasera: solo si hay columnas con ese encabezado real. */
function buildImpresionParts(row, cols) {
  const parts = [];
  if (cols.cdelantera != null) {
    const delantera = cellScalar(row[cols.cdelantera]);
    if (delantera) parts.push(`Delantera: ${delantera}`);
  }
  if (cols.ctrasera != null) {
    const trasera = cellScalar(row[cols.ctrasera]);
    if (trasera) parts.push(`Trasera: ${trasera}`);
  }
  return parts;
}

/** Marca de casilla (X). Ignora valores plantilla numéricos del Excel (ej. 104). */
export function isCheckboxMark(value) {
  const t = normCellHeader(value);
  if (!t) return false;
  if (/^\d{2,}$/.test(t)) return false;
  return t === "X" || t === "SI" || t === "SÍ" || t === "1" || t === "TRUE";
}

function isMarkedX(value) {
  return isCheckboxMark(value);
}

export const ARQUERO_MISMO_DISENO_NOTE =
  "Arquero: mismo diseño con colores invertidos (sin cargo adicional de diseño)";

/** Metadatos de cabecera del FORMATO PEDIDO LIFE (filas 1–3). */
export function extractFormatoLifeHeaderMeta(grid) {
  let color_media = null;
  let disciplina = null;
  for (let r = 0; r < Math.min(5, grid.length); r++) {
    const row = grid[r] || [];
    for (let c = 0; c < row.length - 1; c++) {
      const t = normCellHeader(row[c]);
      const next = compact(row[c + 1]);
      if (!next) continue;
      if (t.includes("COLOR") && t.includes("MEDIA")) color_media = next;
      if (t === "DISCIPLINA") disciplina = next;
    }
  }
  return { color_media, disciplina };
}

/**
 * Resumen estructurado tras parsear formato life — para el agente staff y correcciones.
 */
export function buildFormatoLifeParseReport(rows, opts = {}) {
  const layout = opts.layout || "generic";
  const masc = (rows || []).filter((r) => r.grupo === "masculino");
  const fem = (rows || []).filter((r) => r.grupo === "femenino");
  const arqueros = (rows || []).filter((r) => r.arquero);

  const rowUnitQty = (r) =>
    parseMangaUnitParts(r.manga, r.cantidad ?? 1).reduce((a, p) => a + (p.qty || 0), 0);
  const countUnits = (pred) =>
    (rows || []).reduce((s, r) => (pred(r) ? s + rowUnitQty(r) : s), 0);
  const countManga = (kind) =>
    (rows || []).reduce((s, r) => {
      return (
        s +
        parseMangaUnitParts(r.manga, r.cantidad ?? 1)
          .filter((p) => p.manga === kind)
          .reduce((a, p) => a + p.qty, 0)
      );
    }, 0);
  const counts = {
    total: rows?.length || 0,
    total_unidades: (rows || []).reduce((s, r) => s + rowUnitQty(r), 0),
    masculino_uniforme: countUnits((r) => r.grupo === "masculino" && r.uniforme),
    masculino_camiseta: countUnits(
      (r) => r.grupo === "masculino" && r.camiseta && !r.uniforme && !r.pantaloneta
    ),
    femenino_camiseta: countUnits((r) => r.grupo === "femenino" && r.camiseta && !r.pantaloneta),
    femenino_otro: countUnits((r) => r.grupo === "femenino" && !r.camiseta && !r.pantaloneta),
    pantaloneta: countUnits((r) => r.pantaloneta),
    arqueros: arqueros.length,
    manga_larga: countManga("larga"),
    manga_corta: countManga("corta"),
  };

  const arquero_lines = arqueros.map(
    (r) => `${r.nombre} #${r.numero || "?"} (${r.grupo === "femenino" ? "F" : "M"})`
  );

  const hints = [];
  if (layout === "formato_life_v1") {
    hints.push("Pestaña formato life · layout v1 (única lógica: parse_life_excel).");
    hints.push("Solo pestaña «formato life» (ignorar Hoja1/Hoja2).");
    hints.push("Dorsal: columna NUMERO; si vacía y existe NUMERO en el layout, usar No. como dorsal.");
    hints.push(
      "Si la columna D (u otra) es CANTIDAD y no hay NUMERO: cantidad por fila; No. es índice, no dorsal."
    );
    hints.push(
      "CANTIDAD = unidades de esa fila (p. ej. 3). Manga puede desglosar: «2 LARGA+1 CORTA», «3 LARGA»."
    );
    hints.push("MAS/FEM = género (masculino/femenino).");
    hints.push(
      "X en Camiseta / X en Uniforme = tipo de prenda de la fila (validación pre-ingreso; no columna Formulario)."
    );
    hints.push("Arquero solo columna ARQUERO (X) o comentario con «arquero».");
    hints.push("No inferir arqueros por dorsal sin marca.");
    hints.push("Texto en Camiseta/Uniforme (ej. «SOLO PANTALONETA») → comentario/nota, no casilla X.");
    hints.push("Curso/pago u otros datos en comentarios → registro (no se descartan).");
    hints.push(
      "Fidelidad al Excel: no inventar palabras. COMENTARIO+OBSERVACIONES se unen; Delantera/Trasera solo si el encabezado las nombra; PRECIO no va a la lista."
    );
  }

  const placeholders = (rows || []).filter(
    (r) => /^(Camiseta|Arquero) #/.test(r.nombre) && !r.nombre_vacio_impresion
  );
  const blankUniformNames = (rows || []).filter((r) => r.nombre_vacio_impresion);
  if (blankUniformNames.length) {
    hints.push(
      `${blankUniformNames.length} uniforme(s) con nombre vacío en impresión (dorsal/talla identifican la prenda).`
    );
  }
  if (placeholders.length) {
    hints.push(
      `${placeholders.length} fila(s) sin nombre en columna B — revisar Excel o corregir manual.`
    );
  }

  const parts = [];
  if (opts.sheetName) parts.push(`«${opts.sheetName}»`);
  parts.push(`${counts.total} filas`);
  if (counts.total_unidades && counts.total_unidades !== counts.total) {
    parts.push(`${counts.total_unidades} unidades`);
  }
  if (counts.masculino_uniforme) parts.push(`${counts.masculino_uniforme} u. M uniforme`);
  if (counts.masculino_camiseta) parts.push(`${counts.masculino_camiseta} u. M camiseta`);
  if (counts.femenino_camiseta) parts.push(`${counts.femenino_camiseta} u. F camiseta`);
  if (counts.pantaloneta) parts.push(`${counts.pantaloneta} pantaloneta`);
  if (counts.arqueros) parts.push(`${counts.arqueros} arquero(s)`);
  if (counts.manga_larga) parts.push(`${counts.manga_larga} manga larga`);
  if (counts.manga_corta) parts.push(`${counts.manga_corta} manga corta`);

  const registro_rows = (rows || [])
    .map((r, i) => (r.registro ? { row: i + 1, nombre: r.nombre, ...r.registro } : null))
    .filter(Boolean);

  return {
    layout,
    sheet_name: opts.sheetName || null,
    color_media: opts.color_media || null,
    disciplina: opts.disciplina || null,
    counts,
    arqueros: arquero_lines,
    registro_hints: registro_rows,
    product_choice_validation: {
      role: "pre_upload_check",
      note_es:
        "Marcas Camiseta/Uniforme del Excel validan la escogencia de producto antes de subir; no son columnas del Formulario Life.",
    },
    hints,
    summary_text: parts.join(" · "),
  };
}

export function analyzeLifeExcelLayout(grid) {
  const cols = scanHeaderIndexes(grid);
  const headerRow = cols.headerRowIdx ?? cols.startIdx - 1;
  const row = grid[headerRow] || [];
  const labels = row.map((c) => normCellHeader(c));

  const hasNombreUniforme = labels.some((t) => t.includes("NOMBRE") && t.includes("UNIFORME"));
  const hasMasFem =
    labels.some((t) => t === "MAS" || t === "MASCULINO") &&
    labels.some((t) => t === "FEM" || t === "FEMENINO");
  const hasCamisetaUniforme =
    labels.some((t) => t === "CAMISETA") && labels.some((t) => t.includes("UNIFORME"));

  const schema =
    hasNombreUniforme && hasMasFem && hasCamisetaUniforme ? "formato_life_v1" : "generic";

  const notes = [];
  for (let r = (cols.startIdx || 0) + 1; r < Math.min(grid.length, cols.startIdx + 80); r++) {
    for (const cell of grid[r] || []) {
      const t = compact(cell);
      if (!t || t.length < 12) continue;
      if (/arquer|colores?\s*invert|gratis|sin\s+cargo|mismo\s+dise/i.test(t)) {
        if (!notes.includes(t)) notes.push(t);
      }
    }
  }

  return { schema, cols, notes };
}

export function scanHeaderIndexes(grid) {
  const maxRow = Math.min(80, grid.length);
  const hits = {
    nombre: [],
    talla: [],
    numero: [],
    cantidad: [],
    camiseta: [],
    uniforme: [],
    manga: [],
    mas: [],
    fem: [],
    arquero: [],
    comentario: [],
    delantera: [],
    trasera: [],
    no: [],
  };

  for (let r = 0; r < maxRow; r++) {
    const row = grid[r] || [];
    const maxCol = Math.min(40, row.length);
    for (let c = 0; c < maxCol; c++) {
      const t = normCellHeader(row[c]);
      if (!t) continue;
      if (looksLikeNombreHeader(t)) hits.nombre.push([r, c]);
      if (looksLikeTallaHeader(t)) hits.talla.push([r, c]);
      if (looksLikeCantidadHeader(t)) hits.cantidad.push([r, c]);
      else if (looksLikeNumeroHeader(t)) hits.numero.push([r, c]);
      if (looksLikeCamisetaHeader(t)) hits.camiseta.push([r, c]);
      if (looksLikeUniformeHeader(t)) hits.uniforme.push([r, c]);
      if (looksLikeMangaHeader(t)) hits.manga.push([r, c]);
      if (looksLikeGeneroMasHeader(t)) hits.mas.push([r, c]);
      if (looksLikeGeneroFemHeader(t)) hits.fem.push([r, c]);
      if (looksLikeArqueroHeader(t)) hits.arquero.push([r, c]);
      if (looksLikeComentarioHeader(t)) hits.comentario.push([r, c]);
      if (looksLikeDelanteraHeader(t)) hits.delantera.push([r, c]);
      if (looksLikeTraseraHeader(t)) hits.trasera.push([r, c]);
      if (t === "NO." || t === "NO" || t === "Nº") hits.no.push([r, c]);
    }
  }

  const strongNombre = hits.nombre.find(([r, c]) => {
    const t = normCellHeader(grid[r][c]);
    return t.includes("NOMBRE") && t.includes("UNIFORME");
  });
  const headerRowIdx = strongNombre ? strongNombre[0] : hits.nombre[0]?.[0] ?? null;
  const cn = strongNombre ? strongNombre[1] : hits.nombre[0]?.[1] ?? null;

  const pickOnHeader = (list) =>
    headerRowIdx != null
      ? list.find(([r]) => r === headerRowIdx)?.[1] ?? null
      : list[0]?.[1] ?? null;

  let ct = pickOnHeader(hits.talla);
  let cnum = pickOnHeader(hits.numero);
  let ccantidad = pickOnHeader(hits.cantidad);
  let ccamiseta = pickOnHeader(hits.camiseta);
  let cuniforme = pickOnHeader(hits.uniforme);
  let cmanga = pickOnHeader(hits.manga);
  let cmas = pickOnHeader(hits.mas);
  let cfem = pickOnHeader(hits.fem);
  let carquero = pickOnHeader(hits.arquero);
  let ccomentario = pickOnHeader(hits.comentario);
  // Todas las cols COMENTARIO/OBSERVACIONES en la fila de encabezado (Fredy Bram: K+L).
  let ccomentarios =
    headerRowIdx != null
      ? [...new Set(hits.comentario.filter(([r]) => r === headerRowIdx).map(([, c]) => c))].sort(
          (a, b) => a - b
        )
      : [...new Set(hits.comentario.map(([, c]) => c))].sort((a, b) => a - b);
  // Solo si el Excel declara DELANTERA / TRASERA en el encabezado. Nunca asumir por offset.
  let cdelantera = pickOnHeader(hits.delantera);
  let ctrasera = pickOnHeader(hits.trasera);
  const cno = pickOnHeader(hits.no);

  if (cn != null) {
    if (ct == null) ct = cn + 1;
    const assumedD = cn + 2;
    const headerRow = headerRowIdx != null ? grid[headerRowIdx] || [] : [];
    const assumedDLabel = normCellHeader(headerRow[assumedD]);
    if (cnum == null && ccantidad == null) {
      // Solo asumir NUMERO en D si no es CANTIDAD.
      if (!looksLikeCantidadHeader(assumedDLabel)) cnum = assumedD;
      else ccantidad = assumedD;
    } else if (cnum == null && looksLikeCantidadHeader(assumedDLabel)) {
      ccantidad = ccantidad ?? assumedD;
    }
    if (cmanga == null) cmanga = cn + 3;
    if (cmas == null) cmas = cn + 4;
    if (cfem == null) cfem = cn + 5;
    if (ccamiseta == null) ccamiseta = cn + 6;
    if (cuniforme == null) cuniforme = cn + 7;
    if (carquero == null) carquero = cn + 8;
    if (ccomentario == null) ccomentario = cn + 9;
    if (!ccomentarios.length && ccomentario != null) ccomentarios = [ccomentario];
  }

  if (ccomentario == null && ccomentarios.length) ccomentario = ccomentarios[0];
  if (ccomentarios.length && ccomentario != null && !ccomentarios.includes(ccomentario)) {
    ccomentarios = [ccomentario, ...ccomentarios].sort((a, b) => a - b);
  }

  if (cn == null && ct == null && cnum == null && ccantidad == null) {
    return {
      cn: 1,
      ct: 2,
      cnum: 3,
      ccantidad: null,
      ccamiseta: 7,
      cuniforme: 8,
      cmanga: 4,
      cmas: 5,
      cfem: 6,
      carquero: 9,
      ccomentario: 10,
      ccomentarios: [10],
      cno: 0,
      headerRowIdx: 4,
      startIdx: 5,
    };
  }

  const startIdx =
    headerRowIdx != null ? Math.min(grid.length - 1, headerRowIdx + 1) : 5;

  return {
    cn,
    ct,
    cnum,
    ccantidad,
    ccamiseta,
    cuniforme,
    cmanga,
    cmas,
    cfem,
    carquero,
    ccomentario,
    ccomentarios,
    cdelantera,
    ctrasera,
    cno,
    headerRowIdx,
    startIdx,
  };
}

/**
 * Dorsal / número de jugador.
 * Preferir columna NUMERO; si viene vacía y el layout tiene NUMERO, usar No.
 * Si el layout es CANTIDAD (sin columna NUMERO), No. es índice de fila — no dorsal.
 */
export function looksLikeJerseyNumber(value) {
  const t = compact(value);
  if (!t) return false;
  if (/^\d{1,3}$/.test(t)) return true;
  if (/^[A-Za-z]?\d{1,3}$/.test(t)) return true;
  return false;
}

export function resolveJerseyNumber(row, cols) {
  const numero = cols.cnum != null ? cellScalar(row[cols.cnum]) : "";
  const rowNo = cols.cno != null ? cellScalar(row[cols.cno]) : "";
  if (numero) return numero;
  // Layout con CANTIDAD y sin NUMERO: No. no es dorsal.
  if (cols.ccantidad != null && cols.cnum == null) return "";
  if (looksLikeJerseyNumber(rowNo)) return rowNo;
  return "";
}

/**
 * Pistas de registro (curso, pago, etc.) embebidas en comentarios u otras celdas.
 * No son columnas Formulario; se conservan para no perder info.
 */
export function extractRegistroHintsFromText(text) {
  const raw = compact(text);
  if (!raw) return {};
  const out = {};
  const curso = raw.match(/\bcurso\s*[:=]?\s*([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ.\- ]{1,20})/i);
  if (curso) out.curso = compact(curso[1]);
  const pago = raw.match(/\bpago\s*[:=]?\s*([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ.%/ ]{1,40})/i);
  if (pago) out.pago = compact(pago[1]);
  const forma = raw.match(/\bforma\s*(?:de\s*)?pago\s*[:=]?\s*([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ.\-_/ ]{1,40})/i);
  if (forma) out.forma_pago = compact(forma[1]);
  const nequi = /\bnequi\b/i.test(raw);
  const banco = /\bbancolombia\b|\bconsignaci[oó]n\b|\bkatu\b/i.test(raw);
  if (nequi && !out.forma_pago) out.forma_pago = "Nequi";
  if (banco && !out.forma_pago) {
    if (/\bkatu\b/i.test(raw)) out.forma_pago = "Katu";
    else if (/\bconsignaci/i.test(raw)) out.forma_pago = "Consignación";
    else if (/\bbancolombia\b/i.test(raw)) out.forma_pago = "Bancolombia";
  }
  return out;
}

function parseFormatoLifeRow(row, cols, ctx) {
  const nombre = cellScalar(row[cols.cn]);
  const talla = cellScalar(row[cols.ct]);
  const jersey = resolveJerseyNumber(row, cols);
  const cantidad = resolveRowCantidad(row, cols);
  const manga = cols.cmanga != null ? cellScalar(row[cols.cmanga]) : "";
  const comentario = readComentarioCells(row, cols);
  const delantera = cols.cdelantera != null ? cellScalar(row[cols.cdelantera]) : "";
  const trasera = cols.ctrasera != null ? cellScalar(row[cols.ctrasera]) : "";

  const camisetaCell = cols.ccamiseta != null ? row[cols.ccamiseta] : "";
  const uniformeCell = cols.cuniforme != null ? row[cols.cuniforme] : "";

  const masMarked = cols.cmas != null && isCheckboxMark(row[cols.cmas]);
  const femMarked = cols.cfem != null && isCheckboxMark(row[cols.cfem]);
  const camisetaMarked = cols.ccamiseta != null && isCheckboxMark(camisetaCell);
  const uniformeMarked = cols.cuniforme != null && isCheckboxMark(uniformeCell);
  const camisetaNote = cellInlineNote(camisetaCell);
  const uniformeNote = cellInlineNote(uniformeCell);
  const impresionParts = buildImpresionParts(row, cols);
  if (ctx.sectionPrintNote) impresionParts.push(ctx.sectionPrintNote);
  const impresionNote = impresionParts.join(" · ");
  const mergedComentario = [comentario, camisetaNote, uniformeNote, impresionNote]
    .filter(Boolean)
    .join(" · ");
  const pantalonetaOnly = isPantalonetaOnlyText(mergedComentario, camisetaNote, uniformeNote);

  const arqueroMarked = cols.carquero != null && isCheckboxMark(row[cols.carquero]);
  const arqueroFromComment = isArqueroFromComment(mergedComentario, {
    pantalonetaOnly,
    camisetaMarked,
    uniformeMarked,
  });
  const arquero = arqueroMarked || arqueroFromComment;

  const hasData =
    Boolean(nombre) ||
    Boolean(talla) ||
    Boolean(delantera) ||
    Boolean(trasera) ||
    masMarked ||
    femMarked ||
    camisetaMarked ||
    uniformeMarked ||
    arqueroMarked ||
    Boolean(comentario) ||
    (cols.ccantidad != null && cantidad > 1 && Boolean(manga));
  if (!hasData) return null;

  const inFemSection = ctx.sawMascRow && !ctx.mascSectionActive;

  let genero = null;
  if (masMarked) genero = "masculino";
  else if (femMarked) genero = "femenino";
  else if (ctx.sectionGender) genero = ctx.sectionGender;
  else if (inFemSection && !masMarked) genero = "femenino";
  else if (ctx.inferFem && nombre) genero = "femenino";
  else genero = "masculino";

  let camiseta = camisetaMarked;
  let uniforme = uniformeMarked;
  const section = ctx.section || null;

  if (pantalonetaOnly) {
    camiseta = false;
    uniforme = false;
  } else if (section && (section.uniforme !== undefined || section.camiseta !== undefined)) {
    if (section.uniforme === true) {
      uniforme = true;
      camiseta = false;
    } else if (section.camiseta === true) {
      camiseta = true;
      uniforme = false;
    } else {
      uniforme = false;
      camiseta = false;
    }
  } else if (!camiseta && !uniforme) {
    if (arquero && (masMarked || genero === "masculino")) uniforme = true;
    else if (arquero) camiseta = true;
    else if (masMarked) uniforme = true;
    else if (genero === "femenino") camiseta = true;
    else if (femMarked) camiseta = true;
    else uniforme = true;
  } else if (arquero && !uniformeMarked && !camisetaMarked) {
    if (masMarked || genero === "masculino") {
      uniforme = true;
      camiseta = false;
    } else {
      camiseta = true;
      uniforme = false;
    }
  }

  const nombreBlankIntentional =
    !nombre &&
    !pantalonetaOnly &&
    (uniforme || camiseta) &&
    Boolean(talla || (jersey && (delantera || trasera || comentario)));

  const registro = extractRegistroHintsFromText(mergedComentario || comentario);
  const manga_parts = parseMangaUnitParts(manga, cantidad);
  const unidades = manga_parts.reduce((s, p) => s + (p.qty || 0), 0);

  return toDetailRow({
    nombre_uniforme: nombre || null,
    talla,
    numero: jersey,
    cantidad: unidades || cantidad,
    manga,
    manga_parts,
    genero,
    mas: masMarked ? "x" : null,
    fem: femMarked ? "x" : null,
    // Validación pre-ingreso / pista de producto — no columnas Formulario Life
    camiseta,
    uniforme,
    product_choice_hint: uniforme
      ? "uniforme"
      : camiseta
        ? "camiseta"
        : pantalonetaOnly
          ? "pantaloneta"
          : null,
    arquero,
    pantaloneta: pantalonetaOnly,
    comentario: mergedComentario || comentario,
    nota_celda: camisetaNote || uniformeNote || "",
    registro: Object.keys(registro).length ? registro : null,
    nombre_vacio_impresion: nombreBlankIntentional,
    impresion_delantera: delantera || null,
    impresion_trasera: trasera || null,
    product_line_key: section?.key || null,
    product_text: section?.product_text || null,
    garment_type: section?.garment_type || null,
    category: section?.category || null,
    variant_notes: section?.variant_notes || null,
  });
}

function isArqueroFromComment(mergedComentario, opts = {}) {
  if (opts.pantalonetaOnly || !mergedComentario) return false;
  const c = mergedComentario.trim();
  const low = c.toLowerCase();
  if (!/arquer|porter/.test(low)) return false;
  if (/^(uniforme|camiseta)\s+arquero\b/i.test(c)) return true;
  if (/^arquero\b/i.test(c)) return true;
  if (/\bde\s+arquero\b/i.test(low)) return true;
  if (/\barquero\b/i.test(low) && (opts.camisetaMarked || opts.uniformeMarked)) return true;
  return false;
}

function cellScalar(v) {
  if (v == null) return "";
  if (typeof v === "number") {
    if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
    return String(v).trim();
  }
  const s = String(v).trim();
  if (/^\d+\.0+$/.test(s)) return String(parseInt(s, 10));
  return s;
}

function detectExcelSectionFromRow(row, cols = {}) {
  const cn = cols.cn;
  const ct = cols.ct;
  const nombre = cn != null ? compact(row[cn]) : "";
  const talla = ct != null ? compact(row[ct]) : "";
  // Fila de persona (nombre + talla) nunca es encabezado de sección — aunque diga «chaqueta» en la talla.
  if (nombre && talla) return null;
  const masMarked = cols.cmas != null && isCheckboxMark(row[cols.cmas]);
  const femMarked = cols.cfem != null && isCheckboxMark(row[cols.cfem]);
  if (masMarked || femMarked) return null;

  const labelParts = [];
  for (let c = 0; c < Math.min(row.length, 6); c++) {
    const t = compact(row[c]);
    if (!t) continue;
    labelParts.push(t);
    if (labelParts.length >= 2) break;
  }
  const label = labelParts.join(" ").trim();
  if (!label) return null;
  // Evitar «Nombre Camiseta…» de una sola celda larga: solo sección si parece título corto.
  if (labelParts.length === 1 && label.length > 48 && !/:$/.test(label)) return null;
  return detectListSectionHeader(label.endsWith(":") ? label : `${label}:`);
}

function isExcelPrintSpecRow(row, cols) {
  const nombre = cellScalar(row[cols.cn]);
  const talla = cellScalar(row[cols.ct]);
  const jersey = resolveJerseyNumber(row, cols);
  if (nombre || talla || jersey) return false;
  const delantera = cols.cdelantera != null ? cellScalar(row[cols.cdelantera]) : "";
  const trasera = cols.ctrasera != null ? cellScalar(row[cols.ctrasera]) : "";
  const comentario = readComentarioCells(row, cols);
  if (!delantera && !trasera && !comentario) return false;
  const hasMarks =
    (cols.ccamiseta != null && isCheckboxMark(row[cols.ccamiseta])) ||
    (cols.cuniforme != null && isCheckboxMark(row[cols.cuniforme])) ||
    (cols.carquero != null && isCheckboxMark(row[cols.carquero]));
  return !hasMarks;
}

function buildSectionPrintNote(row, cols) {
  const comentario = readComentarioCells(row, cols);
  const parts = [...buildImpresionParts(row, cols)];
  if (comentario) parts.push(comentario);
  return parts.join(" · ");
}

export function extractRowsFromLifeGrid(grid) {
  const layout = analyzeLifeExcelLayout(grid);
  const cols = layout.cols;
  let { cn, ct, startIdx } = cols;
  if (cn == null || ct == null) {
    cn = 1;
    ct = 2;
    startIdx = 5;
  }

  const out = [];
  const skipLabels = new Set(["NOMBRE EN UNIFORME", "NOMBRE", "TOTAL", "SUBTOTAL"]);
  let blank = 0;
  let sawMascRow = false;
  let mascSectionActive = true;
  let currentSection = null;
  let sectionPrintNote = "";

  for (let r = startIdx; r < grid.length; r++) {
    const row = [...(grid[r] || [])];
    const comentarioCols = Array.isArray(cols.ccomentarios) ? cols.ccomentarios : [];
    const extend =
      Math.max(
        cn,
        ct,
        cols.cnum ?? 0,
        cols.ccamiseta ?? 0,
        cols.cuniforme ?? 0,
        cols.carquero ?? 0,
        cols.ccomentario ?? 0,
        cols.cdelantera ?? 0,
        cols.ctrasera ?? 0,
        ...comentarioCols
      ) + 1;
    while (row.length < extend) row.push("");

    const sectionHeader = detectExcelSectionFromRow(row, cols);
    if (sectionHeader) {
      currentSection = sectionHeader;
      sectionPrintNote = "";
      blank = 0;
      continue;
    }

    if (isExcelPrintSpecRow(row, cols)) {
      sectionPrintNote = buildSectionPrintNote(row, cols);
      blank = 0;
      continue;
    }

    const nombreRaw = row[cn];
    const hasNombre = nombreRaw != null && String(nombreRaw).trim() !== "";

    if (!hasNombre) {
      const talla = cellScalar(row[ct]);
      const jersey = resolveJerseyNumber(row, cols);
      const hasMarks =
        (cols.ccamiseta != null && isCheckboxMark(row[cols.ccamiseta])) ||
        (cols.cuniforme != null && isCheckboxMark(row[cols.cuniforme])) ||
        (cols.carquero != null && isCheckboxMark(row[cols.carquero]));
      if (!talla && !jersey && !hasMarks) {
        blank += 1;
        if (blank >= 25) break;
        continue;
      }
    } else {
      blank = 0;
      const nsUp = normCellHeader(String(nombreRaw).trim());
      if (skipLabels.has(nsUp) || nsUp.includes("TOTAL UNIFORMES")) continue;
    }

    if (layout.schema === "formato_life_v1") {
      const tallaCell = cellScalar(row[ct]);
      const jerseyCell = resolveJerseyNumber(row, cols);
      const mangaCell = cols.cmanga != null ? cellScalar(row[cols.cmanga]) : "";
      const rowHasMarks =
        (cols.ccamiseta != null && isCheckboxMark(row[cols.ccamiseta])) ||
        (cols.cuniforme != null && isCheckboxMark(row[cols.cuniforme])) ||
        (cols.carquero != null && isCheckboxMark(row[cols.carquero])) ||
        (cols.cmas != null && isCheckboxMark(row[cols.cmas])) ||
        (cols.cfem != null && isCheckboxMark(row[cols.cfem]));
      // Pie de hoja / nota (ej. especificación pantaloneta) sin fila de pedido.
      if (hasNombre && !tallaCell && !jerseyCell && !mangaCell && !rowHasMarks) {
        blank = 0;
        continue;
      }

      const masMarked = cols.cmas != null && isCheckboxMark(row[cols.cmas]);
      if (masMarked) sawMascRow = true;
      if (sawMascRow && !masMarked && mascSectionActive) {
        const femMarked = cols.cfem != null && isCheckboxMark(row[cols.cfem]);
        const camisetaOnly = cols.ccamiseta != null && isCheckboxMark(row[cols.ccamiseta]);
        const hasRowData =
          hasNombre ||
          femMarked ||
          camisetaOnly ||
          tallaCell ||
          jerseyCell;
        if (hasRowData) mascSectionActive = false;
      }

      const parsed = parseFormatoLifeRow(row, cols, {
        inferFem: !mascSectionActive && hasNombre && !masMarked,
        sawMascRow,
        mascSectionActive,
        section: currentSection,
        sectionPrintNote,
      });
      if (parsed) out.push(parsed);
      continue;
    }

    // generic fallback
    if (!hasNombre) continue;
    const jersey = resolveJerseyNumber(row, cols);
    const comentario = cols.ccomentario != null ? cellScalar(row[cols.ccomentario]) : "";
    const talla = cellScalar(row[ct]);
    const blob = `${talla} ${comentario}`.toLowerCase();
    const soloCamisa = /\bsolo\s+camisa\b|\bsolo\s+camiseta\b/.test(blob);
    const mencionaCamisa = /\bcamisa\b|\bcamiseta\b/.test(blob);
    const mencionaChaqueta = /\bchaqueta\b|\bbuso\b|\bsudadera\b|\bpantalon\b/.test(blob);
    out.push(
      toDetailRow({
        nombre_uniforme: String(nombreRaw).trim(),
        talla,
        numero: jersey,
        manga: cols.cmanga != null ? cellScalar(row[cols.cmanga]) : "",
        mas: cols.cmas != null && isCheckboxMark(row[cols.cmas]) ? "x" : null,
        fem: cols.cfem != null && isCheckboxMark(row[cols.cfem]) ? "x" : null,
        arquero: cols.carquero != null && isCheckboxMark(row[cols.carquero]),
        comentario: comentario || undefined,
        camiseta: soloCamisa || (mencionaCamisa && !mencionaChaqueta),
        uniforme: !(soloCamisa || (mencionaCamisa && !mencionaChaqueta)),
      })
    );
  }
  return out.filter(Boolean);
}

function colLettersToIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

function decodeXmlEntities(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml) {
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const chunk = m[1];
    const texts = [...chunk.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) =>
      decodeXmlEntities(x[1])
    );
    out.push(texts.join(""));
  }
  return out;
}

function sheetXmlToGrid(sheetXml, sharedStrings) {
  const grid = [];
  const rowRe = /<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(sheetXml))) {
    const rowNum = Number(rowMatch[1]);
    const rowBody = rowMatch[2];
    const row = [];
    // Soportar <c .../> y <c ...>...</c> (celdas vacías con estilo no deben absorber la siguiente).
    const cellRe = /<c[^>]*\br="([A-Z]+)(\d+)"([^>]*?)(\s*\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowBody))) {
      const col = colLettersToIndex(cellMatch[1]);
      const attrs = cellMatch[3] || "";
      const isSelfClosing = /^\s*\/>$/.test(cellMatch[4] || "");
      const inner = isSelfClosing ? "" : cellMatch[5] || "";
      if (isSelfClosing) {
        row[col] = "";
        continue;
      }
      let value = "";
      if (/t="s"/.test(attrs)) {
        const idx = Number((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || -1);
        value = sharedStrings[idx] ?? "";
      } else if (/<is>/.test(inner)) {
        value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map((x) => decodeXmlEntities(x[1]))
          .join("");
      } else {
        value = decodeXmlEntities((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || "");
      }
      row[col] = value;
    }
    grid[rowNum - 1] = row;
  }
  const dense = [];
  for (let i = 0; i < grid.length; i++) {
    dense.push(grid[i] || []);
  }
  return dense;
}

async function listZipEntries(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip_eocd_not_found");

  const cdOffset = view.getUint32(eocd + 16, true);
  const cdSize = view.getUint32(eocd + 12, true);
  let ptr = cdOffset;
  const end = cdOffset + cdSize;
  const entries = [];

  while (ptr < end) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const compMethod = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const uncompSize = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(data.slice(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;
    entries.push({ name, localOffset, compMethod, compSize, uncompSize });
  }
  return { view, entries };
}

async function readZipEntry(data, entry) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const lh = entry.localOffset;
  if (view.getUint32(lh, true) !== 0x04034b50) throw new Error("zip_bad_local_header");
  const lNameLen = view.getUint16(lh + 26, true);
  const lExtraLen = view.getUint16(lh + 28, true);
  const dataStart = lh + 30 + lNameLen + lExtraLen;
  const compressed = data.slice(dataStart, dataStart + entry.compSize);

  if (entry.compMethod === 0) return compressed.slice(0, entry.uncompSize);
  if (entry.compMethod === 8) {
    const ds = new DecompressionStream("deflate-raw");
    const blob = new Blob([compressed]);
    const stream = blob.stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error(`zip_unsupported_method:${entry.compMethod}`);
}

async function findZipEntry(data, nameSuffix) {
  const { entries } = await listZipEntries(data);
  const hit = entries.find((e) => e.name.endsWith(nameSuffix) || e.name === nameSuffix);
  if (!hit) return null;
  return readZipEntry(data, hit);
}

function parseWorkbookRelationships(relsXml) {
  const relMap = {};
  const re = /<Relationship\b([^>]+)\/?>/g;
  let m;
  while ((m = re.exec(relsXml))) {
    const attrs = m[1];
    const id = (attrs.match(/\bId="([^"]+)"/) || [])[1];
    const target = (attrs.match(/\bTarget="([^"]+)"/) || [])[1];
    const type = (attrs.match(/\bType="([^"]+)"/) || [])[1] || "";
    if (!id || !target || !type.includes("worksheet")) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    relMap[id] = path;
  }
  return relMap;
}

function parseWorkbookSheets(workbookXml, relMap) {
  const sheets = [];
  const re = /<sheet\b([^>]+)\/?>/g;
  let m;
  while ((m = re.exec(workbookXml))) {
    const attrs = m[1];
    const name = (attrs.match(/\bname="([^"]*)"/) || [])[1];
    const rid = (attrs.match(/\br:id="([^"]+)"/) || [])[1];
    const path = rid ? relMap[rid] : null;
    if (!name || !path) continue;
    sheets.push({ name, path });
  }
  return sheets;
}

async function listWorkbookSheets(bytes) {
  const workbookEntry =
    (await findZipEntry(bytes, "xl/workbook.xml")) || (await findZipEntry(bytes, "workbook.xml"));
  if (!workbookEntry) return [];

  const relsEntry =
    (await findZipEntry(bytes, "xl/_rels/workbook.xml.rels")) ||
    (await findZipEntry(bytes, "_rels/workbook.xml.rels"));
  const relMap = relsEntry
    ? parseWorkbookRelationships(new TextDecoder().decode(relsEntry))
    : {};

  return parseWorkbookSheets(new TextDecoder().decode(workbookEntry), relMap);
}

async function readSheetGrid(bytes, sheetPath, sharedStrings) {
  const normalized = sheetPath.replace(/^\//, "");
  const sheetEntry =
    (await findZipEntry(bytes, normalized)) ||
    (await findZipEntry(bytes, normalized.split("/").pop()));
  if (!sheetEntry) return [];
  return sheetXmlToGrid(new TextDecoder().decode(sheetEntry), sharedStrings);
}

async function readXlsxGrid(bytes, options = {}) {
  const sharedEntry =
    (await findZipEntry(bytes, "xl/sharedStrings.xml")) ||
    (await findZipEntry(bytes, "sharedStrings.xml"));
  const sharedStrings = sharedEntry
    ? parseSharedStrings(new TextDecoder().decode(sharedEntry))
    : [];

  const sheets = await listWorkbookSheets(bytes);
  const forcedName = compact(options.sheetName || options.sheet_name || "");

  if (forcedName) {
    const forced = sheets.find(
      (s) => normalizeSheetLabel(s.name) === normalizeSheetLabel(forcedName)
    );
    if (!forced) {
      throw new Error(`sheet_not_found:${forcedName}`);
    }
    const grid = await readSheetGrid(bytes, forced.path, sharedStrings);
    return { grid, sheetName: forced.name, sheetPath: forced.path };
  }

  const selection = pickLifeExcelSheet(sheets);
  if (selection.needsChoice) {
    // Auto-elegir pestaña con más contenido (Hoja2/3 vacías frecuentes).
    let best = null;
    let bestCount = 0;
    const scored = [];
    for (const candidate of sheets) {
      const g = await readSheetGrid(bytes, candidate.path, sharedStrings);
      const count = g.reduce(
        (n, row) => n + (row || []).filter((c) => compact(c)).length,
        0
      );
      scored.push({ name: candidate.name, count });
      if (count > bestCount) {
        bestCount = count;
        best = { candidate, grid: g };
      }
    }
    if (best && bestCount >= 8) {
      return {
        grid: best.grid,
        sheetName: best.candidate.name,
        sheetPath: best.candidate.path,
      };
    }
    return {
      grid: [],
      sheetName: null,
      sheetPath: null,
      needsChoice: true,
      choices: selection.choices,
      message: selection.message,
      sheet_scores: scored,
    };
  }

  if (!selection.pick) {
    throw new Error("xlsx_sheet_not_found");
  }

  let grid = await readSheetGrid(bytes, selection.pick.path, sharedStrings);
  let sheetName = selection.pick.name;
  let sheetPath = selection.pick.path;

  if (!grid.length) {
    const formatoCandidates = sheets.filter((s) => isFormatoLifeSheet(s.name));
    for (const candidate of formatoCandidates) {
      if (candidate.path === sheetPath) continue;
      const altGrid = await readSheetGrid(bytes, candidate.path, sharedStrings);
      if (altGrid.length) {
        grid = altGrid;
        sheetName = candidate.name;
        sheetPath = candidate.path;
        break;
      }
    }
  }

  if (!grid.length && sheets.length > 1) {
    for (const candidate of sheets) {
      if (candidate.path === sheetPath) continue;
      const altGrid = await readSheetGrid(bytes, candidate.path, sharedStrings);
      if (altGrid.length) {
        grid = altGrid;
        sheetName = candidate.name;
        sheetPath = candidate.path;
        break;
      }
    }
  }

  return { grid, sheetName, sheetPath };
}

export async function parseLifeExcelBytes(bytes, filename = "lista.xlsx", options = {}) {
  const lower = compact(filename).toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const grid = text.split(/\r?\n/).map((line) => line.split(/[,;\t]/));
    const rows = extractRowsFromLifeGrid(grid);
    return { ok: rows.length > 0, rows, sheetName: "csv", error: rows.length ? null : "no_rows_parsed" };
  }

  const sheetResult = await readXlsxGrid(bytes, options);
  if (sheetResult.needsChoice) {
    return {
      ok: false,
      rows: [],
      sheetName: null,
      needs_sheet_choice: true,
      sheet_choices: sheetResult.choices || [],
      error: "ambiguous_sheet",
      message: sheetResult.message,
    };
  }

  const { grid, sheetName } = sheetResult;
  const layout = analyzeLifeExcelLayout(grid);
  const rows = extractRowsFromLifeGrid(grid);
  const headerMeta =
    layout.schema === "formato_life_v1" ? extractFormatoLifeHeaderMeta(grid) : {};
  const parseReport = buildFormatoLifeParseReport(rows, {
    layout: layout.schema,
    sheetName,
    ...headerMeta,
  });
  const warnings = [];
  if (layout.schema === "generic") {
    warnings.push("Excel sin columnas estándar formato life; organización genérica de datos.");
  }
  if (layout.notes?.length) {
    warnings.push(...layout.notes.slice(0, 3));
  }
  if (parseReport.hints?.length) {
    warnings.push(...parseReport.hints.slice(0, 4));
  }
  const mirrorGrid =
    layout.schema === "formato_life_v1"
      ? null
      : (() => {
          const headerIdx =
            typeof layout.cols?.headerRowIdx === "number" ? layout.cols.headerRowIdx : 0;
          const sliced = Array.isArray(grid) ? grid.slice(Math.max(0, headerIdx)) : [];
          // trim trailing empties
          let last = -1;
          for (let r = 0; r < sliced.length; r++) {
            if ((sliced[r] || []).some((c) => compact(c))) last = r;
          }
          return last < 0 ? [] : sliced.slice(0, last + 1);
        })();
  return {
    ok: rows.length > 0 || (mirrorGrid && mirrorGrid.length > 1),
    rows,
    sheetName,
    layout: layout.schema,
    layout_notes: layout.notes,
    parse_report: parseReport,
    color_media: headerMeta.color_media || null,
    disciplina: headerMeta.disciplina || null,
    // Grilla para espejo en nota cuando layout ≠ formato_life (ADR diagnóstico).
    grid: mirrorGrid,
    use_mirror: layout.schema !== "formato_life_v1" && Array.isArray(mirrorGrid) && mirrorGrid.length > 1,
    warnings: warnings.length ? warnings : null,
    error: rows.length || (mirrorGrid && mirrorGrid.length > 1) ? null : "no_rows_parsed",
  };
}
