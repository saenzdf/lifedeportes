#!/usr/bin/env node
/**
 * Regenera nomina_employee_codes.js desde kapso/config/attlog_employee_map.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const mapPath = path.join(root, "config/attlog_employee_map.json");
const outPath = path.join(root, "functions/lib/nomina_employee_codes.js");

const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const lines = map.employees
  .sort((a, b) => Number(a.pin) - Number(b.pin))
  .map((e) => {
    const note = e.notes ? ` // ${e.notes}` : e.status === "pending_name" ? " // pendiente nombre" : "";
    const val = e.name == null ? "null" : JSON.stringify(e.name);
    return `  "${e.pin}": ${val},${note}`;
  });

const idLines = map.employees
  .sort((a, b) => Number(a.pin) - Number(b.pin))
  .map((e) => {
    const oid = e?.odoo?.employee_id;
    const val = oid == null ? "null" : String(Number(oid));
    return `  "${e.pin}": ${val},`;
  });

const js = `/**
 * PIN del reloj ZKTeco → nombre / Odoo hr.employee.
 * PIN = hr.employee.barcode (Badge ID / credencial).
 * Generado desde kapso/config/attlog_employee_map.json — no editar a mano.
 * Regenerar: node kapso/scripts/sync_nomina_employee_codes.js
 */
export const LIFE_ATTENDANCE_EMPLOYEES = {
${lines.join("\n")}
};

/** PIN reloj → hr.employee.id Odoo (null si no hay match). */
export const LIFE_ATTENDANCE_ODOO_IDS = {
${idLines.join("\n")}
};

export function lookupEmployee(pin) {
  const key = String(pin ?? "").trim();
  if (!key) return { pin: key, in_catalog: false, name: null, odoo_employee_id: null };
  if (!(key in LIFE_ATTENDANCE_EMPLOYEES)) {
    return { pin: key, in_catalog: false, name: null, odoo_employee_id: null };
  }
  const odooId = LIFE_ATTENDANCE_ODOO_IDS[key];
  return {
    pin: key,
    in_catalog: true,
    name: LIFE_ATTENDANCE_EMPLOYEES[key],
    odoo_employee_id: odooId == null ? null : Number(odooId),
  };
}

export function resolveEmployeeName(pin) {
  return lookupEmployee(pin).name;
}

export function employeeDisplayName(pin) {
  const { name, in_catalog, odoo_employee_id } = lookupEmployee(pin);
  if (name) {
    return odoo_employee_id ? \`\${name} (Odoo #\${odoo_employee_id})\` : name;
  }
  if (in_catalog) return \`PIN \${pin} (nombre pendiente)\`;
  return \`PIN \${pin} (sin catálogo)\`;
}
`;

fs.writeFileSync(outPath, js);
console.log("Wrote", outPath);
