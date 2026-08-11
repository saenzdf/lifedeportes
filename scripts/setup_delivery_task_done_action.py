#!/usr/bin/env python3
"""Create/update Server Action and Automated Action: Move task to Hecho on Delivery Validation."""
import json
import os
import sys
import xmlrpc.client
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

SA_NAME = "Mover tarea a Hecho al validar entrega"
AUTO_NAME = "Mover tarea a Hecho al validar entrega"

# Code to run inside Odoo safe_eval
CODE = """
for picking in records:
    # Solo procesar si el albarán pasa a 'Hecho' y tiene un pedido asociado
    if picking.state != 'done' or not picking.sale_id:
        continue
    
    # Buscar tareas vinculadas al pedido (SO)
    tasks = env['project.task'].search([
        '|',
        ('sale_order_id', '=', picking.sale_id.id),
        ('sale_line_id.order_id', '=', picking.sale_id.id)
    ])
    
    for task in tasks:
        # Ignorar si ya está terminada o cancelada
        if task.state in ('1_done', '1_canceled'):
            continue
            
        stage = False
        if task.project_id:
            # Buscar la etapa "Hecho" en el proyecto de la tarea
            stage = env['project.task.type'].search([
                ('project_ids', 'in', task.project_id.id),
                ('name', '=ilike', 'Hecho')
            ], limit=1)
            
            # Fallback 1: Cualquier etapa que contenga "Hecho" en el proyecto
            if not stage:
                stage = env['project.task.type'].search([
                    ('project_ids', 'in', task.project_id.id),
                    ('name', 'ilike', 'Hecho')
                ], limit=1)
                
        # Fallback 2: Cualquier etapa global llamada "Hecho"
        if not stage:
            stage = env['project.task.type'].search([
                ('name', '=ilike', 'Hecho')
            ], limit=1)
            
        vals = {'state': '1_done'}
        if stage:
            vals['stage_id'] = stage.id
            
        task.write(vals)
        task.message_post(
            body="Tarea movida automáticamente a Hecho tras la validación de la entrega <b>%s</b>." 
            % (picking.name,)
        )
""".strip()

def load_env():
    if not ENV_PATH.exists():
        return
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
        url = (os.environ.get("ODOO_URL") or os.environ["ODOO_LIFEDEPORTES_URL"]).rstrip("/")
        db = os.environ.get("ODOO_DB") or os.environ["ODOO_LIFEDEPORTES_DB"]
        user = os.environ.get("ODOO_USERNAME") or os.environ["ODOO_LIFEDEPORTES_USERNAME"]
        pwd = os.environ.get("ODOO_PASSWORD") or os.environ["ODOO_LIFEDEPORTES_PASSWORD"]
        
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", allow_none=True)
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True)
    uid = common.authenticate(db, user, pwd, {})
    if not uid:
        raise RuntimeError(f"Auth failed for {prefix} ({url})")
    return {"db": db, "uid": uid, "pwd": pwd, "models": models, "prefix": prefix, "url": url}

def kw(c, model, method, *args, **kwargs):
    return c["models"].execute_kw(c["db"], c["uid"], c["pwd"], model, method, list(args), kwargs or {})

def setup(c):
    # 1. Resolve stock.picking model
    model_ids = kw(c, "ir.model", "search", [("model", "=", "stock.picking")])
    if not model_ids:
        raise RuntimeError("stock.picking model not found")
    model_id = model_ids[0]

    # 2. Resolve state field on stock.picking
    state_field_ids = kw(c, "ir.model.fields", "search", [("model", "=", "stock.picking"), ("name", "=", "state")])
    if not state_field_ids:
        raise RuntimeError("stock.picking.state field not found")
    state_field_id = state_field_ids[0]

    # 3. Create/update Server Action
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
        sa_action = "updated"
    else:
        created = kw(c, "ir.actions.server", "create", [sa_vals])
        sa_id = created[0] if isinstance(created, list) else created
        sa_action = "created"

    # 4. Create/update Automated Action
    auto_ids = kw(c, "base.automation", "search", [("name", "=", AUTO_NAME)])
    auto_vals = {
        "name": AUTO_NAME,
        "model_id": model_id,
        "trigger": "on_write",
        "trigger_field_ids": [(6, 0, [state_field_id])],
        "filter_pre_domain": "[('state', '!=', 'done')]",
        "filter_domain": "[('state', '=', 'done')]",
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

    # 5. Deactivate legacy automation (ID 19) if active
    legacy_deactivated = False
    legacy_ids = kw(c, "base.automation", "search", [("id", "=", 19), ("active", "=", True)])
    if legacy_ids:
        kw(c, "base.automation", "write", legacy_ids, {"active": False})
        legacy_deactivated = True

    return {
        "prefix": c["prefix"],
        "url": c["url"],
        "server_action": {"id": sa_id, "action": sa_action},
        "automation": {"id": auto_id, "action": auto_action},
        "legacy_automation_id_19_deactivated": legacy_deactivated
    }

def main():
    load_env()
    prefix = sys.argv[1] if len(sys.argv) > 1 else "prod"
    if prefix not in ("test", "prod"):
        print("Usage: setup_delivery_task_done_action.py [test|prod]", file=sys.stderr)
        sys.exit(1)
    
    c = client(prefix)
    report = setup(c)
    print(json.dumps(report, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
