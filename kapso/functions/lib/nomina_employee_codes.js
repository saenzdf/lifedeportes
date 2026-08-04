/**
 * PIN del reloj ZKTeco → nombre / Odoo hr.employee.
 * PIN = hr.employee.barcode (Badge ID / credencial).
 * Generado desde kapso/config/attlog_employee_map.json — no editar a mano.
 * Regenerar: node kapso/scripts/sync_nomina_employee_codes.js
 */
export const LIFE_ATTENDANCE_EMPLOYEES = {
  "4": "Jesus",
  "5": "Laura Alejandra",
  "6": "Yesica",
  "8": "Laura Gomez",
  "9": "Natalia",
  "10": "Valentina",
  "11": "Lorena",
  "15": "Tatiana",
  "16": "Milvany",
};

/** PIN reloj → hr.employee.id Odoo (null si no hay match). */
export const LIFE_ATTENDANCE_ODOO_IDS = {
  "4": 12,
  "5": 16,
  "6": 6,
  "8": 15,
  "9": 10,
  "10": 13,
  "11": 5,
  "15": 7,
  "16": 4,
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
    return odoo_employee_id ? `${name} (Odoo #${odoo_employee_id})` : name;
  }
  if (in_catalog) return `PIN ${pin} (nombre pendiente)`;
  return `PIN ${pin} (sin catálogo)`;
}
