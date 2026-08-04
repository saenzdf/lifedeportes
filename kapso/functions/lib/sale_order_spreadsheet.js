/**
 * Formulario Life — fill nativo Odoo 19.
 *
 * NO pisa fórmulas en Productos del pedido A–F ni Aprobación A–B (SEQUENCE / XLOOKUP / ODOO.LIST).
 * Renombra pestaña Pedido → Productos del pedido.
 * Columnas principales + Otros atributos + Comentario (ADR 0003 / 0004).
 */

import {
  compact,
  peopleForSpreadsheet,
  decomposeProductForSpreadsheet,
} from "./staff_order_contract.js";

export const PRODUCTOS_SHEET_NAME = "Productos del pedido";
export const PRODUCTOS_SHEET_RE = /^(pedido|productos del pedido)$/i;

/**
 * Productos del pedido: A–F nativos; G–H legacy Tallas/Colores (no pisar);
 * I+ Kapso.
 */
export const PEDIDO_ATTR_HEADERS = {
  I: "Producto base",
  J: "Cuello",
  K: "Largo Manga",
  L: "Género",
  M: "Deportes",
  N: "Otros atributos",
  O: "Comentario",
};

/**
 * Aprobación: A–B nativos; C–E persona; F–K atributos; L color medias (última columna).
 */
export const FORMULARIO_HEADERS = {
  C: "Nombre en camiseta",
  D: "Numero en camiseta",
  E: "Talla uniforme",
  F: "Cuello",
  G: "Largo Manga",
  H: "Género",
  I: "Deportes",
  J: "Otros atributos",
  K: "Comentario",
  L: "Color medias",
};

/**
 * Odoo Plantilla venta guarda celdas como string plano ("ANDRÉS"), no {content}.
 * Escribir objetos rompe Owl (model undefined / syncSheetFromRouter).
 */
export function cell(content, style = null) {
  const text = content == null ? "" : String(content);
  if (style != null) return { content: text, style };
  return text;
}

export function findSheet(snapshot, nameRe) {
  const sheets = snapshot?.sheets || [];
  return sheets.find((s) => nameRe.test(String(s?.name || ""))) || null;
}

export function findProductosSheet(snapshot) {
  return findSheet(snapshot, PRODUCTOS_SHEET_RE) || snapshot?.sheets?.[1] || null;
}

/** Renombra Pedido → Productos del pedido solo si no hay fórmulas que referencien Pedido!. */
export function renamePedidoSheet(snapshot) {
  const raw = JSON.stringify(snapshot || {});
  if (/Pedido!/i.test(raw)) return snapshot;
  const sheet = findSheet(snapshot, /^pedido$/i);
  if (sheet) sheet.name = PRODUCTOS_SHEET_NAME;
  return snapshot;
}

function cellContent(val) {
  if (val == null) return "";
  if (typeof val === "object") return String(val.content ?? "");
  return String(val);
}

function isFormulaCell(val) {
  return cellContent(val).trim().startsWith("=");
}

function setHeaderIfNeeded(sheet, addr, label) {
  sheet.cells = sheet.cells || {};
  const cur = cellContent(sheet.cells[addr]);
  if (!cur || cur === label || !isFormulaCell(sheet.cells[addr])) {
    sheet.cells[addr] = cell(label);
  }
}

function expandTableRange(sheet, range) {
  if (!Array.isArray(sheet.tables) || !sheet.tables.length) return;
  sheet.tables = sheet.tables.map((t) => ({
    ...t,
    range: range || t.range,
  }));
}

function principalFromDecomp(decomp) {
  const p = decomp?.principal || decomp?.attributes || {};
  return {
    cuello: p.cuello || "",
    manga: p.manga || "",
    genero: p.genero || "",
    deporte: p.deporte || "",
  };
}

/** Valores de lista Pedido!G / Pedido!H usados por dataValidationRules. */
export function readPedidoDropdownList(snapshot, colLetter, { fromRow = 2, toRow = 40 } = {}) {
  const pedido =
    findSheet(snapshot, /^pedido$/i) || findProductosSheet(snapshot);
  if (!pedido?.cells) return [];
  const out = [];
  for (let r = fromRow; r <= toRow; r++) {
    const v = compact(cellContent(pedido.cells[`${colLetter}${r}`]));
    if (v) out.push(v);
  }
  return out;
}

/**
 * Plantilla Life guarda tallas como "Tallas: S" / " Tallas: 14" en Pedido!G.
 * Escribir solo "S" o "14" dispara puntito rojo (isValueInRange).
 */
export function normalizeFormularioTalla(raw, allowedList = []) {
  const token = compact(raw)
    .replace(/^tallas?\s*:?\s*/i, "")
    .toUpperCase();
  if (!token) return "";
  const allowed = allowedList.length
    ? allowedList
    : [
        "Tallas: S",
        "Tallas: M",
        "Tallas: L",
        "Tallas: XL",
        "Tallas: XXL",
        "Tallas: XXXL",
        " Tallas: 2",
        " Tallas: 4",
        " Tallas: 6",
        " Tallas: 8",
        " Tallas: 10",
        " Tallas: 12",
        " Tallas: 14",
        " Tallas: 16",
      ];
  const exact = allowed.find((a) => compact(a) === compact(raw));
  if (exact) return exact;
  const byToken = allowed.find((a) => {
    const t = compact(a)
      .replace(/^tallas?\s*:?\s*/i, "")
      .toUpperCase();
    return t === token;
  });
  if (byToken) return byToken;
  // Letra vs número: XL/XXL etc.
  if (/^(XXXL|XXL|XL|S|M|L)$/i.test(token)) {
    return `Tallas: ${token}`;
  }
  if (/^\d{1,2}$/.test(token)) {
    return ` Tallas: ${token}`;
  }
  return compact(raw);
}

/** Colores Pedido!H: Negro, Blanco, Azul, Verde, Rojo, Naranja. */
export function normalizeFormularioColor(raw, allowedList = []) {
  const token = compact(raw);
  if (!token) return "";
  const allowed = allowedList.length
    ? allowedList
    : ["Negro", "Blanco", "Azul", "Verde", "Rojo", "Naranja"];
  const exact = allowed.find((a) => compact(a).toLowerCase() === token.toLowerCase());
  if (exact) return exact;
  const aliases = {
    negro: "Negro",
    black: "Negro",
    blanco: "Blanco",
    white: "Blanco",
    azul: "Azul",
    blue: "Azul",
    verde: "Verde",
    green: "Verde",
    rojo: "Rojo",
    red: "Rojo",
    naranja: "Naranja",
    orange: "Naranja",
  };
  const key = token.toLowerCase().replace(/\s+/g, "");
  const mapped = aliases[key];
  if (mapped) {
    return allowed.find((a) => compact(a).toLowerCase() === mapped.toLowerCase()) || mapped;
  }
  // "azul oscuro" → Azul si aparece
  for (const a of allowed) {
    if (token.toLowerCase().includes(compact(a).toLowerCase())) return a;
  }
  return ""; // no forzar valor fuera de lista (evita puntito rojo)
}

/** Asegura rangos de validación E2:E / L2:L (plantilla a veces deja E3:E / F3 / L3). */
export function ensureFormularioDataValidationRanges(snapshot) {
  const sheet =
    findSheet(snapshot, /formulario|aprobaci/i) || snapshot?.sheets?.[0];
  if (!sheet || !Array.isArray(sheet.dataValidationRules)) return snapshot;
  for (const rule of sheet.dataValidationRules) {
    const ranges = rule.ranges || [];
    const joined = ranges.join("|");
    if (/^E/i.test(joined) || ranges.some((r) => /^E/i.test(r))) {
      rule.ranges = ["E2:E"];
      if (rule.criterion?.values?.[0] && !/Pedido!G/i.test(rule.criterion.values[0])) {
        rule.criterion.values = ["Pedido!G2:G"];
      } else if (rule.criterion?.values?.[0] === "Pedido!G1:G14") {
        // G1 es header "Tallas"; lista útil desde G2
        rule.criterion.values = ["Pedido!G2:G"];
      }
    }
    if (/^[FL]/i.test(joined) || ranges.some((r) => /^[FL]/i.test(r))) {
      rule.ranges = ["L2:L"];
      if (rule.criterion?.values?.[0] && /Pedido!H/i.test(rule.criterion.values[0])) {
        rule.criterion.values = ["Pedido!H2:H"];
      }
    }
  }
  return snapshot;
}

/** Plantilla venta nativa: formulas Pedido!/XLOOKUP/ODOO.LIST — no expandir tablas ni renombrar. */
export function isNativePlantillaFormulario(snapshot) {
  const raw = JSON.stringify(snapshot || {});
  return /Pedido!/i.test(raw) && /XLOOKUP|SEQUENCE|ODOO\.LIST/i.test(raw);
}

/**
 * Escribe I–O en Productos del pedido. No toca A–F ni G–H.
 * En Formulario nativo (Plantilla venta) es no-op: Pedido lo llena ODOO.LIST.
 */
export function ensurePedidoAttributeColumns(
  snapshot,
  resolvedLines = [],
  orderLines = null
) {
  if (isNativePlantillaFormulario(snapshot)) return snapshot;
  renamePedidoSheet(snapshot);
  const sheet = findProductosSheet(snapshot);
  if (!sheet) return snapshot;
  sheet.cells = sheet.cells || {};

  for (const [col, label] of Object.entries(PEDIDO_ATTR_HEADERS)) {
    setHeaderIfNeeded(sheet, `${col}1`, label);
  }
  expandTableRange(sheet, "A1:O80");

  const linesForRows = buildPedidoRowPlan(resolvedLines, orderLines);
  linesForRows.forEach((entry, i) => {
    const row = i + 2;
    if (!entry) {
      for (const col of Object.keys(PEDIDO_ATTR_HEADERS)) {
        sheet.cells[`${col}${row}`] = cell("");
      }
      return;
    }
    const decomp = decomposeProductForSpreadsheet(
      entry.display_name || entry.product_text || entry.product_base,
      {
        ...(entry.attributes || {}),
        genero: entry.genero || entry.attributes?.genero,
        deporte: entry.deporte || entry.attributes?.deporte,
      },
      entry.comments || ""
    );
    const p = principalFromDecomp(decomp);
    sheet.cells[`I${row}`] = cell(decomp.product_base);
    sheet.cells[`J${row}`] = cell(p.cuello);
    sheet.cells[`K${row}`] = cell(p.manga);
    sheet.cells[`L${row}`] = cell(p.genero);
    sheet.cells[`M${row}`] = cell(p.deporte);
    sheet.cells[`N${row}`] = cell(decomp.otros_atributos || "");
    sheet.cells[`O${row}`] = cell(decomp.comments || "");
  });

  return snapshot;
}

function buildPedidoRowPlan(resolvedLines = [], orderLines = null) {
  if (Array.isArray(orderLines) && orderLines.length) {
    return orderLines.map((ol) => {
      const name = compact(ol.name || ol.product_id?.[1] || "");
      if (/dise[nñ]o/i.test(name)) {
        return {
          display_name: name,
          product_base: "Diseño",
          attributes: {},
          comments: "",
        };
      }
      const match =
        (resolvedLines || []).find(
          (rl) =>
            Number(rl.product_variant_id || 0) ===
              Number(ol.product_id?.[0] || ol.product_id || 0) ||
            compact(rl.product_text) === name ||
            name.includes(compact(rl.product_base))
        ) || null;
      return {
        display_name: name,
        product_text: match?.product_text || name,
        product_base: match?.product_base,
        attributes: match?.attributes || {},
        genero: match?.genero,
        deporte: match?.deporte || match?.attributes?.deporte,
        comments: match?.comments || "",
      };
    });
  }
  return (resolvedLines || []).filter(
    (l) => !/dise[nñ]o/i.test(l.product_base || l.product_text || "")
  );
}

export function fillFormularioPeople(
  snapshot,
  { detail = {}, resolvedLines = [], orderLines = null } = {}
) {
  const sheet =
    findSheet(snapshot, /formulario|aprobaci/i) || snapshot?.sheets?.[0];
  if (!sheet) return { snapshot, filled: 0 };
  sheet.cells = sheet.cells || {};

  const native = isNativePlantillaFormulario(snapshot);
  const people = peopleForSpreadsheet(detail);
  const meta = detail || {};

  if (native) {
    // C–E persona + F–K attrs + L color medias (plantilla v2). No tocar A–B ni expandir tablas.
    // Celdas = string plano. Omitir vacías.
    ensureFormularioDataValidationRanges(snapshot);
    const tallaList = readPedidoDropdownList(snapshot, "G");
    const colorList = readPedidoDropdownList(snapshot, "H");
    
    // Detectamos headers en F1 (Cuello), G1 (Manga) o J1 (Otros)
    const hasAttrHeaders =
      /cuello/i.test(cellContent(sheet.cells?.F1)) ||
      /largo\s*manga|manga/i.test(cellContent(sheet.cells?.G1)) ||
      /otros atributos/i.test(cellContent(sheet.cells?.J1));

    // Forzar el tamaño de la letra y los estilos en la fila de cabecera
    if (sheet.styles) {
      const headerStyleId = sheet.styles['C1'] || sheet.styles['E1:F1'] || 4; // 4: bold, fontSize: 14
      sheet.styles['C1'] = headerStyleId;
      sheet.styles['D1'] = sheet.styles['D1'] || 5; // Mantener D1 si tiene wrapping
      sheet.styles['E1:L1'] = headerStyleId; // Homogeneizar de la E a la L
      if (sheet.styles['E1:F1']) delete sheet.styles['E1:F1'];
    }

    // Forzar bordes uniformes de B1 a L1
    if (sheet.borders) {
      if (sheet.borders['B1:F1']) {
        sheet.borders['B1:L1'] = sheet.borders['B1:F1'];
        delete sheet.borders['B1:F1'];
      } else if (!sheet.borders['B1:L1']) {
        sheet.borders['B1:L1'] = 1;
      }
    }

    // Forzar anchos de columna razonables para las nuevas columnas si no están
    sheet.cols = sheet.cols || {};
    const colWidths = { 5: 120, 6: 120, 7: 120, 8: 120, 9: 150, 10: 180, 11: 128 }; // F:120, G:120, H:120, I:120, J:150, K:180, L:128
    for (const [colIdx, width] of Object.entries(colWidths)) {
      if (!sheet.cols[colIdx]) sheet.cols[colIdx] = { size: width };
    }

    for (const addr of Object.keys(sheet.cells)) {
      const m = addr.match(/^([C-M])(\d+)$/);
      if (!m || Number(m[2]) < 2) continue;
      delete sheet.cells[addr];
    }

    const productLines = (resolvedLines || []).filter(
      (l) =>
        Number(l.quantity || 0) > 0 &&
        !/dise[nñ]o/i.test(l.product_base || l.product_text || "")
    );
    let filled = 0;
    people.forEach((person, i) => {
      const row = i + 2;
      const nombre = compact(person.nombre || "");
      const numero = compact(person.numero || "");
      const talla = normalizeFormularioTalla(person.talla || "", tallaList);
      const color = normalizeFormularioColor(
        person.color_medias || meta.color_media || "",
        colorList
      );
      if (nombre) sheet.cells[`C${row}`] = nombre;
      if (numero) sheet.cells[`D${row}`] = numero;
      if (talla) sheet.cells[`E${row}`] = talla;
      if (color) sheet.cells[`L${row}`] = color; // Color medias en columna L

      if (hasAttrHeaders) {
        const hint = compact(
          person.product_hint || person.rol || person.categoria || person.grupo || ""
        ).toLowerCase();
        const line =
          productLines.find((l) => {
            if (l.line_id && (l.line_id === person.resolved_line_id || l.line_id === person.product_line_key))
              return true;
            const base = compact(l.product_base || l.product_text || "").toLowerCase();
            const cat = compact(l.category || "").toLowerCase();
            const blob = `${base} ${cat}`;
            if (/chaqueta|rompe/i.test(hint) && /chaqueta|rompe/i.test(blob)) return true;
            if (/camiseta|coach/i.test(hint) && /camiseta/i.test(blob)) return true;
            if (/uniforme|f[uú]tbol|arquero/i.test(hint) && /uniforme/i.test(blob)) return true;
            return hint && base.includes(hint);
          }) || productLines[0];
        const generoFromPerson =
          /fem/i.test(person.genero || person.grupo || "")
            ? "femenino"
            : /masc/i.test(person.genero || person.grupo || "")
              ? "masculino"
              : "";
        const decomp = line
          ? decomposeProductForSpreadsheet(
              line.product_text || line.product_base,
              {
                ...(line.attributes || {}),
                genero: line.attributes?.genero || generoFromPerson,
                deporte: line.attributes?.deporte || meta.disciplina,
                manga: line.attributes?.manga || person.manga,
              },
              [line.comments, person.comentarios, person.comentario]
                .filter(Boolean)
                .join(" · ")
            )
          : {
              product_base: "",
              principal: { genero: generoFromPerson },
              attributes: {},
              otros_atributos: "",
              comments: person.comentarios || person.comentario || "",
            };
        const p = principalFromDecomp(decomp);
        
        // Escribimos en las nuevas columnas (F a K, Producto base borrado)
        if (p.cuello) sheet.cells[`F${row}`] = p.cuello;
        if (p.manga) sheet.cells[`G${row}`] = p.manga;
        if (p.genero || generoFromPerson) {
          sheet.cells[`H${row}`] = p.genero || generoFromPerson;
        }
        if (p.deporte) sheet.cells[`I${row}`] = p.deporte;
        if (decomp.otros_atributos) sheet.cells[`J${row}`] = decomp.otros_atributos;
        const comment = compact(
          decomp.comments || person.comentarios || person.comentario || ""
        );
        if (comment) sheet.cells[`K${row}`] = comment;
      }
      filled += 1;
    });
    return {
      snapshot,
      filled,
      mode: hasAttrHeaders ? "native_aprobacion_cf_hm" : "native_aprobacion_cf",
    };
  }

  for (const [col, label] of Object.entries(FORMULARIO_HEADERS)) {
    setHeaderIfNeeded(sheet, `${col}1`, label);
  }
  if (!cellContent(sheet.cells.A1)) sheet.cells.A1 = cell("Idx");
  if (!cellContent(sheet.cells.B1)) sheet.cells.B1 = cell("Producto");
  expandTableRange(sheet, "A1:L200");

  const productLines = (resolvedLines || []).filter(
    (l) =>
      Number(l.quantity || 0) > 0 &&
      !/dise[nñ]o/i.test(l.product_base || l.product_text || "")
  );
  const defaultLine = productLines[0] || null;

  for (const addr of Object.keys(sheet.cells)) {
    const m = addr.match(/^([C-L])(\d+)$/);
    if (m && Number(m[2]) >= 2) delete sheet.cells[addr];
  }

  let filled = 0;

  function writeAttrRow(row, decomp, person = null) {
    const p = principalFromDecomp(decomp);
    sheet.cells[`F${row}`] = cell(p.cuello);
    sheet.cells[`G${row}`] = cell(p.manga);
    sheet.cells[`H${row}`] = cell(p.genero || person?.genero || "");
    sheet.cells[`I${row}`] = cell(p.deporte || "");
    sheet.cells[`J${row}`] = cell(decomp.otros_atributos || "");
    sheet.cells[`K${row}`] = cell(decomp.comments || "");
  }

  if (people.length) {
    people.forEach((person, i) => {
      const row = i + 2;
      const line =
        productLines.find(
          (l) =>
            l.line_id === person.resolved_line_id ||
            l.product_text === person.product_line_key ||
            l.line_id === person.product_line_key
        ) || defaultLine;
      const generoFromPerson =
        /fem/i.test(person.genero || person.grupo || "")
          ? "femenino"
          : /masc/i.test(person.genero || person.grupo || "")
            ? "masculino"
            : "";
      const decomp = line
        ? decomposeProductForSpreadsheet(
            line.product_text || line.product_base,
            {
              ...(line.attributes || {}),
              genero: line.attributes?.genero || generoFromPerson,
              deporte: line.attributes?.deporte || meta.disciplina,
              manga: line.attributes?.manga || person.manga,
            },
            [line.comments, person.comentarios].filter(Boolean).join(" · ")
          )
        : {
            product_base: "",
            principal: { genero: generoFromPerson },
            attributes: { genero: generoFromPerson },
            otros_atributos: "",
            comments: person.comentarios || "",
          };

      if (!sheet.cells[`A${row}`] || !isFormulaCell(sheet.cells[`A${row}`])) {
        if (!sheet.cells[`A${row}`]) sheet.cells[`A${row}`] = cell(String(i + 1));
      }
      if (!sheet.cells[`B${row}`] || !isFormulaCell(sheet.cells[`B${row}`])) {
        if (!sheet.cells[`B${row}`] && decomp.product_base) {
          sheet.cells[`B${row}`] = cell(decomp.product_base);
        }
      }

      sheet.cells[`C${row}`] = cell(person.nombre || "");
      sheet.cells[`D${row}`] = cell(person.numero || "");
      sheet.cells[`E${row}`] = cell(
        normalizeFormularioTalla(person.talla || "", readPedidoDropdownList(snapshot, "G"))
      );
      const colorNorm = normalizeFormularioColor(
        person.color_medias || meta.color_media || "",
        readPedidoDropdownList(snapshot, "H")
      );
      sheet.cells[`L${row}`] = cell(colorNorm); // Color medias en columna L
      writeAttrRow(row, decomp, { genero: generoFromPerson });
      filled += 1;
    });
  }
  // No padear filas G–M desde qty SO sin personas: enmascararía desfase detalle↔comercial.

  return { snapshot, filled, mode: "legacy_attrs" };
}

export function parsePeopleFromSpreadsheet(snapshot) {
  const sheet =
    findSheet(snapshot, /formulario|aprobaci/i) || snapshot?.sheets?.[0];
  if (!sheet?.cells) return [];
  const byRow = {};
  for (const [addr, val] of Object.entries(sheet.cells)) {
    const m = addr.match(/^([A-L])(\d+)$/);
    if (!m) continue;
    const row = Number(m[2]);
    if (row < 2) continue;
    if (isFormulaCell(val) && (m[1] === "A" || m[1] === "B")) {
      // Fórmulas A/B no evaluadas vía XML-RPC: no contar como producto resuelto.
      byRow[row] = byRow[row] || {};
      byRow[row][`_${m[1]}_formula`] = true;
      continue;
    }
    byRow[row] = byRow[row] || {};
    byRow[row][m[1]] = compact(val?.content ?? val);
  }
  return Object.keys(byRow)
    .map(Number)
    .sort((a, b) => a - b)
    .map((row) => {
      const r = byRow[row];
      if (!r.C && !r.E && !r.K) return null;
      const productRaw = compact(r.B || "");
      return {
        person_id: `sheet_${row}`,
        identity: {
          display_name: r.C || "",
          print_name: r.C || "",
          number: r.D || "",
        },
        components: [
          {
            type: "uniforme",
            size: r.E || "",
            comment: [r.K, r.J].filter(Boolean).join(" · "),
            sleeve: r.G || "",
          },
        ],
        comments: r.K || "",
        color_medias: r.L || "",
        nombre: r.C || "",
        talla: r.E || "",
        producto: productRaw,
        product_base: productRaw,
        product_formula: Boolean(r._B_formula) && !productRaw,
        attributes: {
          cuello: r.F || "",
          manga: r.G || "",
          genero: r.H || "",
          deporte: r.I || "",
        },
        otros_atributos: r.J || "",
      };
    })
    .filter(Boolean);
}

export function parsePedidoAttributes(snapshot) {
  const sheet = findProductosSheet(snapshot);
  if (!sheet?.cells) return [];
  const byRow = {};
  for (const [addr, val] of Object.entries(sheet.cells)) {
    const m = addr.match(/^([I-O])(\d+)$/);
    if (!m) continue;
    const row = Number(m[2]);
    if (row < 2) continue;
    byRow[row] = byRow[row] || {};
    byRow[row][m[1]] = compact(val?.content ?? val);
  }
  return Object.keys(byRow)
    .map(Number)
    .sort((a, b) => a - b)
    .map((row) => {
      const r = byRow[row];
      if (!r.I && !r.O && !r.N) return null;
      return {
        line_id: `pedido_${row}`,
        product_base: r.I || "",
        attributes: {
          cuello: r.J || "",
          manga: r.K || "",
          genero: r.L || "",
          deporte: r.M || "",
        },
        otros_atributos: r.N || "",
        comments: r.O || "",
      };
    })
    .filter(Boolean);
}

export function applyLifeFormularioFill(
  snapshot,
  { detail, resolvedLines, orderLines } = {}
) {
  const clone = JSON.parse(JSON.stringify(snapshot || { sheets: [] }));
  ensurePedidoAttributeColumns(clone, resolvedLines, orderLines);
  const { filled, mode } = fillFormularioPeople(clone, {
    detail,
    resolvedLines,
    orderLines,
  });
  return { snapshot: clone, filled, mode: mode || "legacy_attrs" };
}

export function buildMinimalLifeFormularioSnapshot() {
  return {
    version: "18.3.1",
    sheets: [
      {
        id: "formulario",
        name: "Formulario Life (Aprobación nombres, tallas y numero)",
        colNumber: 16,
        rowNumber: 200,
        cells: {
          A1: cell("Idx"),
          B1: cell("Producto"),
        },
        tables: [
          {
            range: "A1:M200",
            type: "static",
            config: {
              hasFilters: true,
              numberOfHeaders: 1,
              bandedRows: true,
              styleId: "TableStyleMedium2",
            },
          },
        ],
      },
      {
        id: "pedido",
        name: "Pedido",
        colNumber: 16,
        rowNumber: 80,
        cells: {
          A1: cell("Producto"),
          B1: cell("Cantidad"),
        },
        tables: [
          {
            range: "A1:O80",
            type: "static",
            config: { numberOfHeaders: 1, bandedRows: true, styleId: "TableStyleMedium5" },
          },
        ],
      },
    ],
    lists: {},
    settings: { locale: { code: "es_ES" } },
  };
}

export const PEDIDO_HEADERS = PEDIDO_ATTR_HEADERS;
export const ensureFormularioHeaders = (snapshot) => {
  const sheet = findSheet(snapshot, /formulario|aprobaci/i);
  if (!sheet) return snapshot;
  for (const [col, label] of Object.entries(FORMULARIO_HEADERS)) {
    setHeaderIfNeeded(sheet, `${col}1`, label);
  }
  return snapshot;
};
