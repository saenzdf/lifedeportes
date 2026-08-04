#!/usr/bin/env node
import { buildLinesFromText, parseLine } from "../functions/lib/parse_life_text_lines.js";
import {
  analyzeLifeExcelLayout,
  buildFormatoLifeParseReport,
  extractRowsFromLifeGrid,
  isCheckboxMark,
  isFormatoLifeSheet,
  parseMangaUnitParts,
  pickLifeExcelSheet,
  resolveJerseyNumber,
  scanHeaderIndexes,
} from "../functions/lib/parse_life_excel.js";
import { countVariantSummary } from "../functions/lib/build_odoo_order_note.js";
import { countRowsBySoLineBucket } from "../functions/lib/odoo_order_correction.js";
import { mergeOrderDetailDraft } from "../functions/lib/merge_order_detail_draft.js";
import { inferCommercialLinesFromDetailRows } from "../functions/lib/list_section_products.js";
import {
  detailRowsToPeople,
  inferAttachmentRole,
  peopleToDetailRows,
  toDetailRow,
} from "../functions/lib/order_detail_shared.js";
import { parseEntriesFromListCell, parseFamilyDayDocxGrid, detectFamilyDayProductColumns } from "../functions/lib/parse_family_day_docx.js";

let passed = 0;
let failed = 0;

function assert(name, cond) {
  if (cond) {
    console.log("✓", name);
    passed++;
  } else {
    console.log("✗", name);
    failed++;
  }
}

const textBlock = `Estiben, L, 23, manga larga
Charli M 8 arquero
Val L 33 femenino`;

const textRows = buildLinesFromText(textBlock);
assert("text rows >= 3", textRows.length >= 3);
assert("arquero detectado", textRows.some((r) => r.arquero && r.nombre.toLowerCase().includes("charli")));

const jsonText = `[{"numero":"10","nombre":"Juan","talla":"M","genero":"masculino"}]`;
const jsonRows = buildLinesFromText(jsonText);
assert("json vision rows", jsonRows.length === 1 && jsonRows[0].numero === "10");

const grid = [
  [],
  [],
  [],
  [],
  ["No.", "NOMBRE EN UNIFORME", "TALLA", "NUMERO", "Larga/Corta", "MAS", "FEM", "Camiseta", "Uniforme", "ARQUERO"],
  ["1", "Ana", "M", "7", "corta", "", "x", "", "", ""],
  ["2", "Luis", "L", "10", "larga", "x", "", "", "", ""],
];
const excelRows = extractRowsFromLifeGrid(grid);
assert("excel grid rows", excelRows.length === 2);
assert("excel femenino", excelRows[0].grupo === "femenino");
assert("excel fem dorsal", excelRows[0].numero === "7");
assert("excel masc dorsal", excelRows[1].numero === "10");
assert("excel masc", excelRows[1].grupo === "masculino");

const lifeGrid = [
  [],
  [],
  [],
  [],
  ["No.", "NOMBRE EN UNIFORME", "TALLA", "NUMERO", "Larga/Corta", "MAS", "FEM", "Camiseta", "Uniforme", "ARQUERO", "COMENTARIO"],
  ["1", "J. BLANCO", "M", "21", "Corta", "X", "104", "", "", "", ""],
  ["109", "", "M", "99", "Corta", "104", "", "X", "", "", "Negra de arquero"],
  ["", "Sandra", "S", "24", "Corta", "104", "", "X", "", "", ""],
];
const lifeRows = extractRowsFromLifeGrid(lifeGrid);
assert("life dorsal not row no", lifeRows[0].numero === "21");
assert("life masc uniforme", lifeRows[0].grupo === "masculino" && lifeRows[0].uniforme);
assert("life arquero camiseta row", lifeRows.some((r) => r.arquero && r.camiseta && r.numero === "99"));
assert("life fem camiseta", lifeRows.some((r) => r.grupo === "femenino" && r.camiseta && r.nombre === "Sandra"));
assert("life layout v1", analyzeLifeExcelLayout(lifeGrid).schema === "formato_life_v1");
assert("checkbox not template 104", !isCheckboxMark("104") && isCheckboxMark("X"));

const noFallbackGrid = [
  [],
  [],
  [],
  [],
  ["No.", "NOMBRE EN UNIFORME", "TALLA", "NUMERO", "Larga/Corta", "MAS", "FEM", "Camiseta", "Uniforme", "ARQUERO", "COMENTARIO"],
  ["17", "Pedro", "M", "", "Corta", "X", "", "", "X", "", "curso: 9A · pago Katu"],
];
const noFallbackRows = extractRowsFromLifeGrid(noFallbackGrid);
assert("no. as jersey when NUMERO empty", noFallbackRows[0]?.numero === "17");
assert("registro from comentario", noFallbackRows[0]?.registro?.curso === "9A");
assert("product_choice_hint uniforme", noFallbackRows[0]?.product_choice_hint === "uniforme");

const pantGrid = [
  [],
  [],
  [],
  [],
  ["NOMBRE EN UNIFORME", "TALLA", "NUMERO", "Larga/Corta", "MAS", "FEM", "Camiseta", "Uniforme", "ARQUERO", "COMENTARIO"],
  ["ANTIGUA", "S", "77", "Corta", "", "X", "SOLO PANTALONETA", "", "", "PANTALONETA 10 CM MAS CORTA"],
  ["ANTIGUA", "M", "11", "Corta", "X", "", "SOLO PANTALONETA", "", "", ""],
];
const pantRows = extractRowsFromLifeGrid(pantGrid);
assert("solo pantaloneta fem no camiseta", pantRows.some((r) => r.pantaloneta && r.grupo === "femenino" && !r.camiseta));
assert("solo pantaloneta masc no uniforme", pantRows.some((r) => r.pantaloneta && r.grupo === "masculino" && !r.uniforme));
assert(
  "pantaloneta comentario en rol",
  pantRows.some((r) => r.pantaloneta && /PANTALONETA/i.test(r.rol || r.comentario))
);

// Bloque femenino sin nombre: camiseta, no arquero inventado (filas 27–33 del formato Life)
const beltranGrid = [
  [],
  [],
  [],
  [],
  ["No.", "NOMBRE EN UNIFORME", "TALLA", "NUMERO", "Larga/Corta", "MAS", "FEM", "Camiseta", "Uniforme", "ARQUERO", "COMENTARIO"],
  ["1", "J. BLANCO", "M", "21", "Corta", "X", "104", "", "X", "", ""],
  ["6", "David", "L", "99", "Larga", "X", "104", "", "", "X", ""],
  ["", "", "S", "4", "Corta", "104", "", "X", "", "", ""],
  ["", "", "M", "68", "Corta", "104", "", "X", "", "", ""],
  ["", "", "M", "30", "Corta", "104", "", "X", "", "", ""],
  ["", "", "L", "24", "Corta", "104", "", "X", "", "", ""],
  ["", "", "M", "24", "Corta", "104", "", "X", "", "", ""],
  ["", "", "S", "24", "Corta", "104", "", "X", "", "", ""],
  ["109", "", "M", "99", "Corta", "104", "", "X", "", "", "Negra de arquero"],
  ["", "Sandra", "S", "24", "Corta", "104", "", "X", "", "", ""],
  ["", "Lizeth", "S", "14", "Corta", "104", "", "X", "", "", ""],
];
const beltranRows = extractRowsFromLifeGrid(beltranGrid);
const mascUniformes = beltranRows.filter((r) => r.grupo === "masculino" && r.uniforme);
const femCamisetas = beltranRows.filter((r) => r.grupo === "femenino" && r.camiseta);
const arqueros = beltranRows.filter((r) => r.arquero);
assert("beltran masc uniformes", mascUniformes.length === 2);
assert(
  "beltran david uniforme arquero",
  mascUniformes.some((r) => r.numero === "99" && r.arquero && r.uniforme)
);
assert("beltran fem camisetas >= 8", femCamisetas.length >= 8);
assert("beltran solo 2 arqueros", arqueros.length === 2);
assert("beltran david arquero masc", arqueros.some((r) => r.grupo === "masculino" && r.numero === "99"));
assert("beltran liset arquero fem", arqueros.some((r) => r.grupo === "femenino" && r.numero === "99" && r.arquero));
assert(
  "beltran sin arquero #24 inventado",
  !arqueros.some((r) => r.numero === "24" && r.nombre.startsWith("Arquero"))
);
assert(
  "beltran dorsales repetidos fem",
  femCamisetas.filter((r) => r.numero === "24").length >= 4
);

const report = buildFormatoLifeParseReport(beltranRows, { layout: "formato_life_v1", sheetName: "formato life" });
assert("parse report arqueros", report.counts.arqueros === 2);
assert("parse report hints", report.hints.some((h) => /NUMERO|arquero/i.test(h)));
assert("parse report summary", report.summary_text.includes("filas"));

const merged = mergeOrderDetailDraft(
  { quote: { quantity: 2 }, order_draft: { commercial: { lines: [{ quantity: 2 }] } } },
  { rows: excelRows, source: "excel", now: "2026-07-05T00:00:00.000Z" }
);
assert("merge summary", merged.detail.summary_text.includes("2 filas"));
assert("merge status ok/partial", ["ok", "partial"].includes(merged.detail.parse_status));
assert("merge canonical people schema", merged.detail.schema_version === "life_order_people_v1");
assert("merge canonical people count", merged.detail.people.length === 2);

const canonicalPeople = [
  {
    person_id: "jugador-10",
    identity: {
      display_name: "Juan",
      print_name: "JUAN",
      number: "10",
      group: "masculino",
    },
    components: [
      { type: "uniforme_completo", size: "M", sleeve: "corta" },
      { type: "camiseta", size: "L", comment: "Camiseta adicional" },
    ],
  },
];
const canonicalRows = peopleToDetailRows(canonicalPeople);
const canonicalRoundTrip = detailRowsToPeople(canonicalRows);
assert("persona canónica conserva componentes", canonicalRoundTrip[0]?.components.length === 2);
assert(
  "persona canónica conserva tallas por componente",
  canonicalRoundTrip[0]?.components[0]?.size === "M" &&
    canonicalRoundTrip[0]?.components[1]?.size === "L"
);
assert(
  "persona canónica conserva identidad",
  canonicalRoundTrip[0]?.identity?.print_name === "JUAN" &&
    canonicalRoundTrip[0]?.identity?.number === "10"
);

assert("attachment role excel", inferAttachmentRole("FORMATO PEDIDO LIFE.xlsx") === "detail_list");
assert("attachment role docx", inferAttachmentRole("LISTADO FAMILIA.docx") === "detail_list");
assert("attachment role design", inferAttachmentRole("referencia_diseno.jpeg") === "design_reference");

const wordCell = "GARCIA # 12 talla M\nLOPEZ 8 talla S";
const wordEntries = parseEntriesFromListCell(wordCell);
assert("word cell entries", wordEntries.length === 2 && wordEntries[0].numero === "12");

const wordGrid = [
  ["", "UNIFORME NIÑOS", "CAMISETA DAMA", "CAMISETA CABALLERO", "VALOR TOTAL"],
  ["CRISTOFER", "Andrade #22 talla 4-6", "(Andrade # 28 talla xs) (Andrade # 07 talla L )", "Andrade # 04 talla s", "148.000"],
  ["PEREZ", "RUIZ # 5 talla S", "MARTINEZ # 3 talla M", "", ""],
  ["ANGELA", "Angela 07 talla 4-6", "# 07 talla M", "", ""],
  ["SILEM", "Lemus # 4 talla6-8", "", "", ""],
  ["TOTAL", "", "", "", ""],
];
const wordRows = parseFamilyDayDocxGrid(wordGrid);
assert("word grid rows", wordRows.length === 9);
assert("word cristofer 4 productos", wordRows.filter((r) => /CRISTOFER/i.test(r.comentario || "")).length === 4);
assert(
  "word cristofer columnas",
  wordRows.some((r) => /CRISTOFER/i.test(r.comentario || "") && r.uniforme && r.numero === "22") &&
    wordRows.filter((r) => /CRISTOFER/i.test(r.comentario || "") && r.camiseta && r.grupo === "femenino").length === 2 &&
    wordRows.some((r) => /CRISTOFER/i.test(r.comentario || "") && /caballero/i.test(r.rol) && r.numero === "04")
);
assert("word uniforme ninos", wordRows.some((r) => r.uniforme && r.numero === "22"));
assert("word camiseta dama rol", wordRows.some((r) => /camiseta dama/i.test(r.rol)));
assert("word angela dama sin nombre en celda", wordRows.some((r) => /ANGELA/i.test(r.comentario || "") && r.grupo === "femenino" && r.numero === "07"));
assert("word lemus talla6-8", wordRows.some((r) => r.nombre === "Lemus" && r.talla === "6-8"));
assert("word familia comentario", wordRows.some((r) => /Familia PEREZ/i.test(r.comentario || "")));
assert(
  "word header column detect",
  detectFamilyDayProductColumns(wordGrid[0]).map((c) => c.index).join(",") === "1,2,3"
);

assert("formato life sheet", isFormatoLifeSheet("formato life"));
assert("formatolife compact", isFormatoLifeSheet("formatolife"));
assert("not formato life", !isFormatoLifeSheet("lista jugadores"));

const pickFl = pickLifeExcelSheet([
  { name: "datos", path: "xl/worksheets/sheet1.xml" },
  { name: "formato life", path: "xl/worksheets/sheet2.xml" },
]);
assert("pick formato life", pickFl.pick?.name === "formato life" && !pickFl.needsChoice);

const pickAsk = pickLifeExcelSheet([
  { name: "lista", path: "a" },
  { name: "otra", path: "b" },
]);
assert("ambiguous sheets ask", pickAsk.needsChoice && pickAsk.choices?.length === 2);

const preseasText = `Chaquetas papás:
1. D. VARGAS · #65 · XXL
2. D. VARGAS · #65 · L
3. D. VARGAS · #65 · L
4. SANTI R. · #15 · M
Camisetas papás:
5. D. VARGAS · #65 · XXL
6. DOMINICK V. · #65 · L
Camiseta profe:
7. COACH · sin dorsal · L
Uniformes:
8. MARTIN LEURO · #12 · S (azul)
9. MARTIN LEURO · #12 · S (gris)
10. FEDERICO CASTELLANOS · #8 · 14 (azul)
11. FEDERICO CASTELLANOS · #8 · 14 (gris)
12. ELIAM HERNANDEZ · #32 · 8 (gris)
13. KAROL PAEZ · #27 · S (verde)
14. SANTIAGO BOTERO · #70 · S (rojo) arquero
15. SANTIAGO BOTERO · #70 · S (morado) arquero`;

const preseasRows = buildLinesFromText(preseasText);
assert("preseas 15 filas", preseasRows.length === 15);
assert("preseas chaquetas", preseasRows.filter((r) => r.product_line_key === "chaqueta").length === 4);
assert("preseas camisetas papas", preseasRows.filter((r) => r.product_line_key === "camiseta_papas").length === 2);
assert("preseas camiseta profe", preseasRows.some((r) => r.product_line_key === "camiseta_profe" && r.nombre === "COACH"));
assert("preseas uniformes", preseasRows.filter((r) => r.product_line_key === "uniforme").length === 8);
assert("preseas arquero en uniformes", preseasRows.filter((r) => r.arquero).length === 2);

const preseasCommercial = inferCommercialLinesFromDetailRows(preseasRows);
assert("preseas 3 lineas comerciales", preseasCommercial.length === 3);
assert(
  "preseas lineas qty",
  preseasCommercial.find((l) => l.key === "chaqueta")?.quantity === 4 &&
    preseasCommercial.find((l) => l.key === "camiseta_deportiva")?.quantity === 3 &&
    preseasCommercial.find((l) => l.key === "uniforme")?.quantity === 8
);
assert(
  "preseas chaqueta con forro",
  preseasCommercial.find((l) => l.key === "chaqueta")?.variant_notes === "con forro"
);
assert(
  "preseas coach sin dorsal",
  preseasRows.some(
    (r) => r.product_line_key === "camiseta_profe" && /COACH/.test(r.comentario || r.rol || "")
  )
);

const preseasMerged = mergeOrderDetailDraft(
  { quote: { quantity: 15 }, order_draft: {} },
  { rows: preseasRows, source: "text", now: "2026-07-06T00:00:00.000Z" }
);
assert("preseas merge commercial", preseasMerged.commercial_lines?.length === 3);

const preseasExcelGrid = [
  [],
  [],
  [],
  [],
  [
    "No.",
    "NOMBRE EN UNIFORME",
    "TALLA",
    "NUMERO",
    "Larga/Corta",
    "MAS",
    "FEM",
    "Camiseta",
    "Uniforme",
    "ARQUERO",
    "COMENTARIO",
    "DELANTERA",
    "TRASERA",
  ],
  ["Uniformes:"],
  ["", "", "", "", "", "", "", "", "", "", "", "LOGO PRESEAS", "NOMBRE + #"],
  ["1", "MARTIN LEURO", "S", "12", "Corta", "X", "", "", "X", "", "azul", "ESCUDO", "#12 + APELLIDO"],
  ["2", "", "S", "12", "Corta", "X", "", "", "X", "", "gris", "ESCUDO", "SOLO #"],
  ["3", "", "M", "8", "Corta", "X", "", "", "X", "", "", "ESCUDO", "SOLO #"],
];
const preseasExcelRows = extractRowsFromLifeGrid(preseasExcelGrid);
assert("preseas excel 3 uniformes", preseasExcelRows.length === 3);
assert(
  "preseas excel martin delantera",
  preseasExcelRows.some((r) => r.nombre === "MARTIN LEURO" && /Delantera: ESCUDO/.test(r.comentario || ""))
);
assert(
  "preseas excel nombre vacio dorsal",
  preseasExcelRows.filter((r) => r.nombre_vacio_impresion).length === 2
);
assert(
  "preseas excel sin camiseta placeholder",
  !preseasExcelRows.some((r) => /^Camiseta #/.test(r.nombre))
);
assert(
  "preseas excel section uniforme",
  preseasExcelRows.every((r) => r.product_line_key === "uniforme")
);

// CANTIDAD + X Camiseta/Uniforme (caso Patricia Blanco / S02103)
const partsMix = parseMangaUnitParts("2 LARGA+1 CORTA", 3);
assert(
  "manga split 2L+1C",
  partsMix.length === 2 &&
    partsMix.find((p) => p.manga === "larga")?.qty === 2 &&
    partsMix.find((p) => p.manga === "corta")?.qty === 1
);
assert("manga 3 LARGA", parseMangaUnitParts("3 LARGA", 3)[0]?.qty === 3);
assert("manga LARGA qty col", parseMangaUnitParts("LARGA", 1)[0]?.qty === 1);

const cantidadGrid = [
  [],
  [],
  [],
  [],
  ["No.", "NOMBRE EN UNIFORME", "TALLA", "CANTIDAD", "Larga/Corta", "MAS", "FEM", "Camiseta", "Uniforme", "ARQUERO", "COMENTARIO"],
  ["1", "SEBASTIAN", "M", "3", "2 LARGA+1 CORTA", "X", "", "", "X", "", ""],
  ["2", "MAO", "XL", "3", "2 LARGA+1 CORTA", "X", "", "", "X", "", ""],
  ["3", "BRADLEY", "XL", "3", "2 LARGA+1 CORTA", "X", "", "", "X", "", ""],
  ["4", "JORNELL", "2XL", "3", "2 LARGA+1 CORTA", "X", "", "", "X", "", ""],
  ["5", "STIKY", "XL", "3", "3 LARGA", "X", "", "", "X", "", ""],
  ["6", "PETER L.", "XL", "3", "3 CORTA", "X", "", "X", "", "", ""],
  ["7", "", "L", "1", "LARGA", "X", "", "X", "", "", "SIN NOMBRE"],
  ["8", "", "XL", "1", "LARGA", "X", "", "X", "", "", "SIN NOMBRE"],
  ["9", "", "", "", "", "", "", "", "", "", ""],
  ["10", "", "", "", "", "", "", "", "", "", ""],
  ["", "PANTALONETA LARGA TIPO BALONCESTO CON BOLSILLOS", "", "", "", "", "", "", "", "", ""],
];
const cantidadCols = scanHeaderIndexes(cantidadGrid);
assert("cantidad layout detects CANTIDAD", cantidadCols.ccantidad === 3 && cantidadCols.cnum == null);
const cantidadRows = extractRowsFromLifeGrid(cantidadGrid);
assert("cantidad 8 filas (no vacías ni pie)", cantidadRows.length === 8);
assert(
  "cantidad no usa D como dorsal",
  cantidadRows.every((r) => r.numero === "")
);
assert(
  "cantidad X uniforme vs camiseta",
  cantidadRows.filter((r) => r.uniforme).length === 5 &&
    cantidadRows.filter((r) => r.camiseta).length === 3
);
assert(
  "cantidad primeras 6 filas ×3",
  cantidadRows.slice(0, 6).every((r) => r.cantidad === 3)
);
assert(
  "cantidad filas sin nombre ×1",
  cantidadRows.slice(6).every((r) => r.cantidad === 1 && r.camiseta)
);
const cantSummary = countVariantSummary(cantidadRows);
assert("cantidad 20 unidades", cantSummary.total === 20 && cantSummary.filas === 8);
assert(
  "cantidad buckets SO",
  JSON.stringify(countRowsBySoLineBucket(cantidadRows)) ===
    JSON.stringify({
      uniforme_corta: 4,
      uniforme_larga: 11,
      camiseta_corta: 3,
      camiseta_larga: 2,
    })
);
const cantReport = buildFormatoLifeParseReport(cantidadRows, {
  layout: "formato_life_v1",
  sheetName: "formato life",
});
assert("cantidad report unidades", cantReport.counts.total_unidades === 20);
assert("cantidad report hint CANTIDAD", cantReport.hints.some((h) => /CANTIDAD/i.test(h)));

// Fredy Bram: COMENTARIO + OBSERVACIONES + PRECIO — sin inventar Delantera/Trasera
const fredyGrid = [
  [],
  [],
  [],
  [],
  [
    "No.",
    "NOMBRE EN UNIFORME",
    "TALLA",
    "NUMERO",
    "Larga/Corta",
    "MAS",
    "FEM",
    "Camiseta",
    "Uniforme",
    "ARQUERO",
    "COMENTARIO",
    "OBSERVACIONES",
    "PRECIO",
  ],
  [
    "1",
    "CHACON",
    "M",
    "9",
    "Corta",
    "X",
    "",
    "",
    "X",
    "",
    "Camiseta,Pantaloneta , Pantalon y medias en color verde oliva",
    "El pantalon de sudadera que sea bota recta en loto",
    "105000",
  ],
];
const fredyCols = scanHeaderIndexes(fredyGrid);
assert(
  "fredy comentario+observaciones cols",
  Array.isArray(fredyCols.ccomentarios) &&
    fredyCols.ccomentarios.includes(10) &&
    fredyCols.ccomentarios.includes(11)
);
assert("fredy sin delantera inventada", fredyCols.cdelantera == null && fredyCols.ctrasera == null);
const fredyRows = extractRowsFromLifeGrid(fredyGrid);
assert("fredy 1 fila", fredyRows.length === 1);
const fredyC = fredyRows[0]?.comentario || "";
assert(
  "fredy une comentario+observacion",
  /verde oliva/.test(fredyC) && /bota recta/.test(fredyC)
);
assert("fredy no inventa Delantera", !/Delantera:/i.test(fredyC));
assert("fredy no inventa Trasera", !/Trasera:/i.test(fredyC));
assert("fredy no mete PRECIO en lista", !/105000/.test(fredyC));
assert("fredy impresion null", !fredyRows[0]?.impresion_delantera && !fredyRows[0]?.impresion_trasera);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
