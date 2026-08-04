#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNominaDraftFromAttlog } from "../functions/lib/parse_attlog_dat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const datPath = path.join(root, "A2QO191560273_attlog.dat");

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

const text = fs.readFileSync(datPath, "utf8");
const result = buildNominaDraftFromAttlog(text, {
  filename: "A2QO191560273_attlog.dat",
  uploaded_by: "Javier Ayala",
});

assert("parse ok", result.ok === true);
const draft = result.nomina_draft;
assert("periodo junio 2026", draft.period.from.startsWith("2026-06"));
assert("7 PINs distintos", draft.employees.length === 7);
assert("Yesica PIN 6", draft.employees.some((e) => e.pin === "6" && e.name === "Yesica"));
assert("Tatiana PIN 15", draft.employees.some((e) => e.pin === "15" && e.name === "Tatiana"));
assert("Laura Alejandra PIN 5 + Odoo", draft.employees.some((e) => e.pin === "5" && e.odoo_employee_id === 16));
assert("sin precios en HTML", !draft.summary_html.includes("$"));
assert("estado pendiente", draft.status === "pending_confirmation");
assert("alerta PIN 12 sin catálogo", draft.warnings.some((w) => w.pin === "12"));

const yesica = draft.employees.find((e) => e.pin === "6");
assert("Yesica tiene horas", yesica.totals.hours > 0);
assert("Yesica primer día con entrada", yesica.days[0].entrada != null);

console.log("\n--- Resumen muestra (Javier → Kapso) ---\n");
console.log(draft.summary_text);

const outDir = path.join(root, "scratch");
fs.mkdirSync(outDir, { recursive: true });
const outJson = path.join(outDir, "nomina_muestra_jun2026.json");
const outHtml = path.join(outDir, "nomina_muestra_jun2026.html");
fs.writeFileSync(outJson, JSON.stringify(draft, null, 2));
fs.writeFileSync(outHtml, draft.summary_html);
console.log(`\nGuardado: ${outJson}`);
console.log(`Guardado: ${outHtml}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
