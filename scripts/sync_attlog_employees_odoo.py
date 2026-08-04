#!/usr/bin/env python3
"""
Sincroniza PIN del reloj ZKTeco ↔ hr.employee.barcode (Badge ID / credencial) en Odoo prod.

Uso:
  python scripts/sync_attlog_employees_odoo.py              # dry-run
  python scripts/sync_attlog_employees_odoo.py --apply      # escribe barcode
  python scripts/sync_attlog_employees_odoo.py --apply --create-missing

Requiere .env con ODOO_LIFEDEPORTES_PROD_*.
Mapa: kapso/config/attlog_employee_map.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import xmlrpc.client
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAP_PATH = ROOT / "kapso" / "config" / "attlog_employee_map.json"
CREDENTIAL_FIELD = "barcode"  # Odoo UI: Badge ID / credencial


def odoo_prod():
    url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
    db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
    pwd = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, pwd, {})
    if not uid:
        raise RuntimeError("Odoo auth failed")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
    return models, uid, db, pwd


def load_map():
    data = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    return data["employees"], data.get("odoo_credential_field", CREDENTIAL_FIELD)


def find_employee(models, uid, db, pwd, entry: dict):
    odoo = entry["odoo"]
    mode = odoo["mode"]
    fields = ["name", "pin", "barcode", "active", "department_id"]
    if mode == "match":
        eid = odoo.get("employee_id")
        if eid:
            rows = models.execute_kw(
                db, uid, pwd, "hr.employee", "read", [[eid]], {"fields": fields}
            )
            if rows:
                return rows[0]
        barcode = str(odoo.get("barcode") or entry.get("pin") or "").strip()
        if barcode:
            rows = models.execute_kw(
                db,
                uid,
                pwd,
                "hr.employee",
                "search_read",
                [[("barcode", "=", barcode)]],
                {"fields": fields, "limit": 5},
            )
            if len(rows) == 1:
                return rows[0]
            if rows:
                return rows[0]
        name = odoo.get("name") or entry.get("name")
        if name:
            rows = models.execute_kw(
                db,
                uid,
                pwd,
                "hr.employee",
                "search_read",
                [[("name", "ilike", name)]],
                {"fields": fields, "limit": 5},
            )
            if len(rows) == 1:
                return rows[0]
            if rows:
                return rows[0]
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Escribir cambios en Odoo")
    parser.add_argument("--create-missing", action="store_true", help="Crear hr.employee para mode=create con name definido")
    args = parser.parse_args()

    if not MAP_PATH.exists():
        print(f"Missing {MAP_PATH}", file=sys.stderr)
        return 1

    employees, cred_field = load_map()
    if cred_field != CREDENTIAL_FIELD:
        print(f"⚠ map odoo_credential_field={cred_field!r}; script usa {CREDENTIAL_FIELD}")
    models, uid, db, pwd = odoo_prod()
    print(f"Odoo uid={uid} | map={MAP_PATH.name} | field={CREDENTIAL_FIELD} | apply={args.apply}\n")

    pending = []
    actions = []

    for entry in employees:
        pin = str(entry["pin"])
        name = entry.get("name")
        label = name or f"PIN {pin} (sin nombre)"
        odoo_cfg = entry["odoo"]
        mode = odoo_cfg["mode"]

        if not name and mode == "create":
            pending.append(f"PIN {pin}: falta name en attlog_employee_map.json")
            print(f"⏸  {label} — omitido (completar name)")
            continue

        if mode == "match":
            row = find_employee(models, uid, db, pwd, entry)
            if not row:
                pending.append(f"PIN {pin} ({name}): no encontrado en Odoo")
                print(f"❌ {label} — no match Odoo")
                continue
            current = row.get(CREDENTIAL_FIELD) or False
            if str(current) == pin:
                print(f"✅ {label} → Odoo id={row['id']} ({row['name']}) {CREDENTIAL_FIELD}={pin}")
                continue
            actions.append(
                {
                    "action": f"write_{CREDENTIAL_FIELD}",
                    "pin": pin,
                    "name": name,
                    "employee_id": row["id"],
                    "odoo_name": row["name"],
                    "old": current,
                }
            )
            print(
                f"{'📝' if args.apply else '🔍'} {label} → Odoo id={row['id']} ({row['name']}): "
                f"{CREDENTIAL_FIELD} {current!r} → {pin}"
            )
            if args.apply:
                models.execute_kw(
                    db, uid, pwd, "hr.employee", "write", [[row["id"]], {CREDENTIAL_FIELD: pin}]
                )

        elif mode == "create":
            row = find_employee(
                models, uid, db, pwd, {**entry, "odoo": {"mode": "match", "name": name, "barcode": pin}}
            )
            if row:
                current = row.get(CREDENTIAL_FIELD) or False
                if str(current) != pin:
                    actions.append(
                        {"action": f"write_{CREDENTIAL_FIELD}", "pin": pin, "name": name, "employee_id": row["id"]}
                    )
                    print(
                        f"{'📝' if args.apply else '🔍'} {label} — existe id={row['id']}, "
                        f"{CREDENTIAL_FIELD} → {pin}"
                    )
                    if args.apply:
                        models.execute_kw(
                            db, uid, pwd, "hr.employee", "write", [[row["id"]], {CREDENTIAL_FIELD: pin}]
                        )
                else:
                    print(f"✅ {label} → ya existe id={row['id']} {CREDENTIAL_FIELD}={pin}")
                continue

            if not args.create_missing:
                pending.append(f"PIN {pin} ({name}): crear en Odoo (--create-missing)")
                print(f"➕ {label} — crear hr.employee (usar --create-missing --apply)")
                continue

            dept = odoo_cfg.get("department_id")
            vals = {"name": name, CREDENTIAL_FIELD: pin, "active": True}
            if dept:
                vals["department_id"] = dept
            actions.append({"action": "create", "pin": pin, "name": name, "vals": vals})
            print(f"{'📝' if args.apply else '🔍'} {label} — crear {vals}")
            if args.apply:
                new_id = models.execute_kw(db, uid, pwd, "hr.employee", "create", [vals])
                print(f"   → creado id={new_id}")

    print(f"\n--- Resumen: {len(actions)} acciones, {len(pending)} pendientes ---")
    for p in pending:
        print(f"  • {p}")

    if not args.apply and actions:
        print("\nDry-run. Repetir con --apply (y --create-missing si hay altas nuevas).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
