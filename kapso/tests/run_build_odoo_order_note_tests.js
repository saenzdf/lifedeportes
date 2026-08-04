#!/usr/bin/env node
import { buildOdooOrderNoteHtml, isFamilyDayListRows, resolveOrderNoteHtml } from "../functions/lib/build_odoo_order_note.js";

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

const html = buildOdooOrderNoteHtml({
  title: "Hub Ball — VALENTINA SILVA",
  commercialLines: [
    {
      name: "Uniforme voleibol mujer",
      quantity: 6,
      variant_notes: "licra · manga corta · cuello V",
    },
  ],
  detailRows: [
    { numero: "33", nombre: "Val", talla: "L", manga: "Manga corta", grupo: "femenino" },
    { numero: "8", nombre: "Charli", talla: "M", manga: "Sisa", grupo: "masculino" },
  ],
  projectName: "Proyecto Paola",
});

assert("HTML incluye tabla femenina", html.includes("Lista de jugadoras"));
assert("HTML incluye manga corta", html.includes("Manga corta"));
assert("HTML sin precios", !html.includes("$50"));
assert("HTML sin teléfono cliente", !html.includes("573"));

const grouped = buildOdooOrderNoteHtml({
  title: "Equipo Fútbol",
  detailRows: [
    { numero: "1", nombre: "Ana", talla: "M", manga: "Corta", grupo: "femenino", camiseta: true },
    { numero: "2", nombre: "Luis", talla: "L", manga: "Larga", grupo: "masculino", uniforme: true },
    { numero: "99", nombre: "Portero", talla: "M", manga: "Larga", grupo: "masculino", arquero: true },
  ],
});
assert("agrupa manga corta fem", grouped.includes("Femenino") && grouped.includes("Manga corta"));
assert("agrupa manga larga masc", grouped.includes("Masculino") && grouped.includes("Manga larga"));
assert("separa uniforme de camiseta", grouped.includes("Uniforme (conjunto)") && grouped.includes("Camiseta"));
assert("resumen variantes", grouped.includes("Resumen por producto y manga"));
assert("sin columna Rol/Campo", !grouped.includes("Rol / variante") && !/>Campo</.test(grouped));
assert("comentario Arquero solo en portero", grouped.includes("Comentario") && grouped.includes("Arquero"));
assert("jugadores sin comentario Campo", !grouped.match(/Ana[\s\S]{0,200}Campo/i));

const mixHtml = buildOdooOrderNoteHtml({
  title: "Patricia",
  detailRows: [
    {
      nombre: "SEBASTIAN",
      talla: "M",
      manga: "2 LARGA+1 CORTA",
      cantidad: 3,
      manga_parts: [
        { manga: "larga", qty: 2 },
        { manga: "corta", qty: 1 },
      ],
      grupo: "masculino",
      uniforme: true,
    },
    {
      nombre: "PETER",
      talla: "XL",
      manga: "3 CORTA",
      cantidad: 3,
      manga_parts: [{ manga: "corta", qty: 3 }],
      grupo: "masculino",
      camiseta: true,
    },
  ],
});
assert("mixta va a uniforme corta y larga", mixHtml.includes("Uniforme (conjunto) · Manga corta") && mixHtml.includes("Uniforme (conjunto) · Manga larga"));
assert("camiseta aparte del uniforme", mixHtml.includes("Camiseta · Manga corta"));
const pedroCamIdx = mixHtml.indexOf("Camiseta · Manga corta");
const pedroNameIdx = mixHtml.indexOf(">PETER<");
const uniCortaIdx = mixHtml.indexOf("Uniforme (conjunto) · Manga corta");
assert("PETER bajo camiseta", pedroCamIdx >= 0 && pedroNameIdx > pedroCamIdx);
assert("SEBASTIAN en uniforme", mixHtml.includes("SEBASTIAN") && uniCortaIdx >= 0);

const pantHtml = buildOdooOrderNoteHtml({
  title: "PATO MILLOS",
  detailRows: [
    {
      numero: "77",
      nombre: "ANTIGUA",
      talla: "S",
      manga: "Corta",
      grupo: "femenino",
      pantaloneta: true,
      comentario: "PANTALONETA 10 CM MAS CORTA",
      rol: "Pantaloneta · PANTALONETA 10 CM MAS CORTA",
    },
  ],
});
assert("pantaloneta en resumen", pantHtml.includes("Pantaloneta"));
assert("comentario en tabla", pantHtml.includes("10 CM MAS CORTA"));

const resolved = resolveOrderNoteHtml(
  {
    order_draft: {
      title: "GUAINIA",
      detail: {
        rows: [{ numero: "1", nombre: "JIM D.", talla: "XL", rol: "Arquero", grupo: "masculino" }],
      },
      project: { name: "Proyecto Javier" },
    },
  },
  {}
);

assert("resolve desde order_draft", resolved.includes("GUAINIA") && resolved.includes("JIM D."));

const familyRows = [
  {
    numero: "22",
    nombre: "Andrade",
    talla: "4-6",
    grupo: "masculino",
    uniforme: true,
    rol: "Uniforme niños",
    comentario: "Familia CRISTOFER",
  },
  {
    numero: "28",
    nombre: "Andrade",
    talla: "xs",
    grupo: "femenino",
    camiseta: true,
    rol: "Camiseta dama",
    comentario: "Familia CRISTOFER",
  },
  {
    numero: "04",
    nombre: "Andrade",
    talla: "s",
    grupo: "masculino",
    camiseta: true,
    rol: "Camiseta caballero",
    comentario: "Familia CRISTOFER",
  },
  {
    numero: "10",
    nombre: "Avila",
    talla: "4",
    grupo: "masculino",
    uniforme: true,
    rol: "Uniforme niños",
    comentario: "Familia MARTIN",
  },
];
const familyHtml = buildOdooOrderNoteHtml({
  title: "Día de la Familia",
  detailRows: familyRows,
  listLayout: "family_day_docx_v1",
});
assert("family layout detect", isFamilyDayListRows(familyRows));
assert("family agrupa cristofer", familyHtml.includes("Familia CRISTOFER"));
assert("family agrupa martin", familyHtml.includes("Familia MARTIN"));
assert("family resumen producto", familyHtml.includes("Resumen por producto"));
assert("family columna producto", familyHtml.includes("Producto"));
assert("family sin agrupar por genero", !familyHtml.includes("Lista de jugadoras"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
