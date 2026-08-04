#!/usr/bin/env python3
"""Create/update Studio automation: SO note + attachments → project.task on create."""
import json
import os
import sys
import xmlrpc.client
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

AUTO_NAME = "Copiar nota y adjuntos SO a tarea"
SA_NAME = "Copiar nota y adjuntos SO a tarea"
FILTER_DOMAIN = "[('sale_order_id', '!=', False)]"

CODE = """
for task in records:
    order = task.sale_order_id
    if not order and task.sale_line_id:
        order = task.sale_line_id.order_id
    if not order:
        continue

    note = order.note or ''
    if note and not (task.description or '').strip():
        task.write({'description': note})

    attachments = env['ir.attachment'].search([
        ('res_model', '=', 'sale.order'),
        ('res_id', '=', order.id),
    ])
    if attachments:
        attachments.write({
            'res_model': 'project.task',
            'res_id': task.id,
        })
        log(
            'SO→tarea: %s adjuntos de %s → tarea %s'
            % (len(attachments), order.name, task.id)
        )
""".strip()


def load_env():
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def client(prefix):
    if prefix == "prod":
        url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
        db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
        user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
        pwd = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    else:
        url = os.environ["ODOO_LIFEDEPORTES_URL"].rstrip("/")
        db = os.environ["ODOO_LIFEDEPORTES_DB"]
        user = os.environ["ODOO_LIFEDEPORTES_USERNAME"]
        pwd = os.environ["ODOO_LIFEDEPORTES_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", allow_none=True)
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True)
    uid = common.authenticate(db, user, pwd, {})
    if not uid:
        raise RuntimeError(f"Auth failed for {prefix} ({url})")
    return {"db": db, "uid": uid, "pwd": pwd, "models": models, "prefix": prefix, "url": url}


def kw(c, model, method, *args, **kwargs):
    return c["models"].execute_kw(c["db"], c["uid"], c["pwd"], model, method, list(args), kwargs or {})


def setup(c):
    model_ids = kw(c, "ir.model", "search", [("model", "=", "project.task")])
    if not model_ids:
        raise RuntimeError("project.task model not found")
    model_id = model_ids[0]

    sa_ids = kw(c, "ir.actions.server", "search", [("name", "=", SA_NAME), ("model_id", "=", model_id)])
    sa_vals = {
        "name": SA_NAME,
        "model_id": model_id,
        "state": "code",
        "code": CODE,
    }
    if sa_ids:
        kw(c, "ir.actions.server", "write", sa_ids, sa_vals)
        sa_id = sa_ids[0]
        action = "updated"
    else:
        created = kw(c, "ir.actions.server", "create", [sa_vals])
        sa_id = created[0] if isinstance(created, list) else created
        action = "created"

    auto_ids = kw(c, "base.automation", "search", [("name", "=", AUTO_NAME)])
    auto_vals = {
        "name": AUTO_NAME,
        "model_id": model_id,
        "trigger": "on_create",
        "filter_domain": FILTER_DOMAIN,
        "action_server_ids": [(6, 0, [sa_id])],
        "active": True,
    }
    if auto_ids:
        kw(c, "base.automation", "write", auto_ids, auto_vals)
        auto_id = auto_ids[0]
        auto_action = "updated"
    else:
        created = kw(c, "base.automation", "create", [auto_vals])
        auto_id = created[0] if isinstance(created, list) else created
        auto_action = "created"

    return {
        "prefix": c["prefix"],
        "url": c["url"],
        "server_action": {"id": sa_id, "action": action},
        "automation": {"id": auto_id, "action": auto_action},
    }


def main():
    load_env()
    prefix = sys.argv[1] if len(sys.argv) > 1 else "prod"
    if prefix not in ("test", "prod"):
        print("Usage: setup_so_to_task_sync.py [test|prod]", file=sys.stderr)
        sys.exit(1)
    c = client(prefix)
    report = setup(c)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
