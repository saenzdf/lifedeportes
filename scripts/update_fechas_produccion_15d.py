#!/usr/bin/env python3
"""Actualiza «Fechas de producción» a 15 días hábiles desde creación de la tarea.

Contexto Life: la tarea de diseño se crea al confirmar el SO, así que
create_date ≈ inicio del reloj de fabricación. Antes: deadline +10 hábiles
y picking +8. Ahora: deadline +15 hábiles; scheduled_date picking +15.

Uso:
  python scripts/update_fechas_produccion_15d.py prod
  python scripts/update_fechas_produccion_15d.py test
"""
from __future__ import annotations

import json
import os
import sys
import xmlrpc.client
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

AUTO_NAME = "Fechas de producción"
SA_NAME = "Fechas de producción"
AUTO_ID_HINT = 15
SA_ID_HINT = 1438

CODE = """
def add_business_days(from_date, num_days):
    business_days_to_add = num_days
    current_date = from_date
    while business_days_to_add > 0:
        current_date += datetime.timedelta(days=1)
        weekday = current_date.weekday()
        if weekday >= 5:
            continue
        business_days_to_add -= 1
    return current_date

# Reloj de fabricación: 15 días hábiles desde create_date de la tarea
# (la tarea nace al confirmar el SO → equivale a inicio post-confirmación).
for task in records:
    start_date_obj = task.create_date
    start_date = start_date_obj.date()
    fecha_limite = add_business_days(start_date, 15)

    task.write({
        'planned_date_begin': start_date_obj,
        'date_deadline': fecha_limite,
    })

    order = task.sale_order_id
    if not order and task.sale_line_id:
        order = task.sale_line_id.order_id
    if not order or not order.picking_ids:
        continue

    outgoing = []
    for p in order.picking_ids:
        if p.picking_type_code == 'outgoing' and p.state != 'cancel':
            outgoing.append(p)
    if not outgoing:
        continue

    delivery = outgoing[0]
    delivery.write({
        'scheduled_date': fecha_limite,
        'date_deadline': fecha_limite,
    })
""".strip()


def load_env() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def client(prefix: str) -> dict:
    if prefix == "prod":
        url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
        db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
        user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
        pwd = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    else:
        url = (
            os.environ.get("ODOO_URL")
            or os.environ.get("ODOO_LIFEDEPORTES_URL", "")
        ).rstrip("/")
        db = os.environ.get("ODOO_DB") or os.environ.get("ODOO_LIFEDEPORTES_DB", "")
        user = os.environ.get("ODOO_USERNAME") or os.environ.get(
            "ODOO_LIFEDEPORTES_USERNAME", ""
        )
        pwd = os.environ.get("ODOO_PASSWORD") or os.environ.get(
            "ODOO_LIFEDEPORTES_PASSWORD", ""
        )
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", allow_none=True)
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True)
    uid = common.authenticate(db, user, pwd, {})
    if not uid:
        raise RuntimeError(f"Auth failed for {prefix} ({url} / {db})")
    return {
        "db": db,
        "uid": uid,
        "pwd": pwd,
        "models": models,
        "prefix": prefix,
        "url": url,
    }


def kw(c: dict, model: str, method: str, *args, **kwargs):
    return c["models"].execute_kw(
        c["db"], c["uid"], c["pwd"], model, method, list(args), kwargs or {}
    )


def update(c: dict) -> dict:
    model_ids = kw(c, "ir.model", "search", [("model", "=", "project.task")])
    model_id = model_ids[0]

    sa_ids = kw(
        c,
        "ir.actions.server",
        "search",
        ["|", ("id", "=", SA_ID_HINT), ("name", "=", SA_NAME)],
        limit=5,
    )
    if not sa_ids:
        raise RuntimeError(f"Server action {SA_NAME!r} not found")

    # Prefer exact name match among candidates
    sas = kw(
        c,
        "ir.actions.server",
        "read",
        sa_ids,
        ["id", "name", "code"],
    )
    sa = next((s for s in sas if s["name"] == SA_NAME), sas[0])
    kw(c, "ir.actions.server", "write", [sa["id"]], {"code": CODE, "state": "code"})

    autos = kw(
        c,
        "base.automation",
        "search_read",
        ["|", ("id", "=", AUTO_ID_HINT), ("name", "=", AUTO_NAME)],
        fields=["id", "name", "active", "trigger", "filter_domain", "action_server_ids"],
    )
    report = {
        "prefix": c["prefix"],
        "url": c["url"],
        "server_action_id": sa["id"],
        "automations": autos,
        "code_preview": CODE[:200] + "…",
        "note": "15 business days from task create_date (= SO confirm for Diseño tasks).",
    }
    return report


def main() -> None:
    load_env()
    prefix = sys.argv[1] if len(sys.argv) > 1 else "prod"
    if prefix not in ("test", "prod"):
        print("Usage: update_fechas_produccion_15d.py [test|prod]", file=sys.stderr)
        sys.exit(1)
    c = client(prefix)
    print(json.dumps(update(c), indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
