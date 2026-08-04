#!/usr/bin/env python3
"""Setup CRM stage Presupuesto → SO draft (Plantilla venta) + webhook Kapso.

Prod CRM stages actuales: New / Proposition / Pasa a diseño / Perdida.
Crea etapa «Presupuesto» (si falta) y automation on_stage_set:

  1) Execute Code: crea sale.order draft + Plantilla venta + línea Diseño $0
  2) Send Webhook: POST a Kapso on-odoo-presupuesto (secret en query)

Uso:
  python scripts/setup_crm_presupuesto_so_webhook.py prod
  python scripts/setup_crm_presupuesto_so_webhook.py prod --webhook-url URL --secret SECRET
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
import sys
import xmlrpc.client
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

STAGE_NAME_LEGACY = "Presupuesto"  # retirada; usar Proposition
STAGE_NAME = "Proposition"
AUTO_NAME = "CRM Proposition → SO + webhook Kapso"
SA_CODE_NAME = "CRM Proposition: crear SO draft + webhook"
SA_WEBHOOK_NAME = "CRM Proposition: webhook Kapso (legacy unused)"
SA_MULTI_NAME = "CRM Proposition: SO + webhook (multi)"  # legacy

TEMPLATE_ID = 1  # Plantilla venta (prod)
DESIGN_PRODUCT_ID = 504

PARAM_URL = "life.kapso.presupuesto_webhook_url"
PARAM_SECRET = "life.kapso.presupuesto_webhook_secret"
PARAM_STAGE = "life.kapso.presupuesto_stage_id"

# crm.lead field ids (prod) for native webhook payload
WEBHOOK_FIELD_NAMES = [
    "phone",
    "partner_id",
    "name",
    "order_ids",
    "contact_name",
    "description",
    "partner_name",
]

# Uses `requests` (available in Odoo 19 SaaS Execute Code).
# Kapso invoke strips query secrets — send X-Life-Webhook-Secret header.
# Reusa SO existente en cualquier estado (draft/sent/sale). Si hay tarea ya creada,
# copia adjuntos a SO y a tarea (ambos quedan con refs/lista).
CODE = """
TEMPLATE_ID = %d
DESIGN_PRODUCT_ID = %d

ICP = env['ir.config_parameter'].sudo()
webhook_url = ICP.get_param('life.kapso.presupuesto_webhook_url') or ''
webhook_secret = ICP.get_param('life.kapso.presupuesto_webhook_secret') or ''

def _copy_atts_to(atts, res_model, res_id):
    if not atts:
        return 0
    existing_names = set(
        env['ir.attachment'].search([
            ('res_model', '=', res_model),
            ('res_id', '=', res_id),
        ]).mapped('name')
    )
    n = 0
    for att in atts:
        if att.name in existing_names:
            continue
        att.copy({'res_model': res_model, 'res_id': res_id})
        existing_names.add(att.name)
        n += 1
    return n

for lead in records:
    partner = lead.partner_id
    if not partner:
        log('CRM Presupuesto: lead %%s sin partner — no SO' %% lead.id)
        continue

    team_name = (lead.name or '').strip()

    # Preferir borrador; si ya hay presupuesto confirmado, reutilizarlo (no crear otro).
    existing = env['sale.order'].search([
        ('opportunity_id', '=', lead.id),
        ('state', 'in', ['draft', 'sent']),
    ], order='id desc', limit=1)
    if not existing:
        existing = env['sale.order'].search([
            ('opportunity_id', '=', lead.id),
            ('state', 'in', ['sale', 'done']),
        ], order='id desc', limit=1)

    if existing:
        order = existing
        log('CRM Presupuesto: reusa SO %%s (%%s) para lead %%s' %% (order.name, order.state, lead.id))
    else:
        vals = {
            'partner_id': partner.id,
            'opportunity_id': lead.id,
            'sale_order_template_id': TEMPLATE_ID,
            'origin': team_name or '',
        }
        # Solo setear nombre studio si vacío — no renombrar pedido staff.
        if team_name:
            vals['x_studio_nombre_del_pedido'] = team_name
        note = lead.description or ''
        if note:
            vals['note'] = note
        order = env['sale.order'].create(vals)
        log('CRM Presupuesto: creado SO %%s (lead %%s)' %% (order.name, lead.id))

    if not order.opportunity_id:
        order.write({'opportunity_id': lead.id})

    if team_name and not (order.x_studio_nombre_del_pedido or '').strip():
        order.write({'x_studio_nombre_del_pedido': team_name})

    if not order.sale_order_template_id and order.state in ('draft', 'sent'):
        order.write({'sale_order_template_id': TEMPLATE_ID})

    # Adjuntos CRM → SO (move). Luego, si hay tarea, copiar a tarea (SO conserva copia).
    lead_atts = env['ir.attachment'].search([
        ('res_model', '=', 'crm.lead'),
        ('res_id', '=', lead.id),
    ])
    if lead_atts:
        lead_atts.write({'res_model': 'sale.order', 'res_id': order.id})
        log('CRM→SO: %%s adjuntos lead %%s → %%s' %% (len(lead_atts), lead.id, order.name))

    task = env['project.task'].search([
        ('sale_order_id', '=', order.id),
    ], order='id desc', limit=1)

    so_atts = env['ir.attachment'].search([
        ('res_model', '=', 'sale.order'),
        ('res_id', '=', order.id),
    ])
    # Excluir PDF de presupuesto generado por Odoo al copiar a tarea si solo hay ese
    design_atts = so_atts.filtered(
        lambda a: not (a.name or '').startswith('Pedido -')
    )

    if task:
        copied = _copy_atts_to(design_atts, 'project.task', task.id)
        if copied:
            log('SO→tarea (copy): %%s adjuntos → tarea %%s' %% (copied, task.id))
        # Lista: si SO tiene note y tarea vacía o solo condiciones, no pisar lista staff
        # Si la tarea no tiene tablas de lista pero el SO sí, copiar note.
        note = order.note or ''
        task_desc = task.description or ''
        if note.strip() and (
            '<table' in note.lower()
            and '<table' not in task_desc.lower()
        ):
            task.write({'description': note})
            log('SO→tarea: note/lista → tarea %%s' %% task.id)

    has_design = False
    for line in order.order_line:
        if line.product_id and line.product_id.id == DESIGN_PRODUCT_ID:
            has_design = True
            break
    if not has_design and order.state in ('draft', 'sent'):
        env['sale.order.line'].create({
            'order_id': order.id,
            'product_id': DESIGN_PRODUCT_ID,
            'name': 'Diseño',
            'product_uom_qty': 1,
            'price_unit': 0,
        })

    # Webhook solo al crear/reusar en draft (Proposition). En Pasa a diseño no re-disparar.
    stage_prop = int(ICP.get_param('life.kapso.presupuesto_stage_id') or 3)
    if webhook_url and lead.stage_id and lead.stage_id.id == stage_prop:
        phone = lead.phone or ''
        if not phone and partner.phone:
            phone = partner.phone
        payload = {
            'event': 'crm.stage.presupuesto',
            'lead_id': lead.id,
            'so_id': order.id,
            'so_name': order.name,
            'partner_phone': phone or '',
            'partner_name': partner.name or '',
            'order_summary': team_name or '',
            'nombre_pedido': (order.x_studio_nombre_del_pedido or team_name or ''),
        }
        headers = {
            'Content-Type': 'application/json',
            'X-Life-Webhook-Secret': webhook_secret or '',
        }
        resp = requests.post(webhook_url, json=payload, headers=headers, timeout=20)
        log('CRM Presupuesto: Kapso HTTP %%s (SO %%s)' %% (resp.status_code, order.name))
""".strip() % (TEMPLATE_ID, DESIGN_PRODUCT_ID)


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


def kw(c: dict, model: str, method: str, *args, **kwargs):
    return c["models"].execute_kw(
        c["db"], c["uid"], c["pwd"], model, method, list(args), kwargs or {}
    )


def upsert_param(c: dict, key: str, value: str) -> int:
    ids = kw(c, "ir.config_parameter", "search", [("key", "=", key)])
    if ids:
        kw(c, "ir.config_parameter", "write", ids, {"value": value})
        return ids[0]
    return kw(c, "ir.config_parameter", "create", [{"key": key, "value": value}])


def ensure_stage(c: dict) -> dict:
    """Resolve CRM stage Proposition (id 3 in prod). Do not create Presupuesto."""
    found = kw(
        c,
        "crm.stage",
        "search_read",
        ["|", ("name", "=", STAGE_NAME), ("name", "ilike", "Proposition")],
        fields=["id", "name", "sequence", "is_won", "fold"],
        limit=3,
    )
    if not found:
        raise RuntimeError(f"CRM stage {STAGE_NAME!r} not found")
    stage = found[0]
    # Fold legacy Presupuesto stage if still present
    legacy = kw(
        c,
        "crm.stage",
        "search",
        [("name", "ilike", "Presupuesto")],
    )
    if legacy:
        kw(
            c,
            "crm.stage",
            "write",
            legacy,
            {"fold": True, "sequence": 99, "name": "Presupuesto (retirada)"},
        )
    return stage


def upsert_server_action(c: dict, model_id: int, name: str, vals: dict) -> int:
    ids = kw(
        c,
        "ir.actions.server",
        "search",
        [("name", "=", name), ("model_id", "=", model_id)],
    )
    payload = {"name": name, "model_id": model_id, **vals}
    if ids:
        kw(c, "ir.actions.server", "write", ids, payload)
        return ids[0]
    created = kw(c, "ir.actions.server", "create", [payload])
    return created[0] if isinstance(created, list) else created


def setup(c: dict, webhook_url: str, secret: str) -> dict:
    model = kw(c, "ir.model", "search_read", [("model", "=", "crm.lead")], fields=["id"])[0]
    model_id = model["id"]

    stage = ensure_stage(c)
    upsert_param(c, PARAM_STAGE, str(stage["id"]))
    upsert_param(c, PARAM_URL, webhook_url)
    upsert_param(c, PARAM_SECRET, secret)

    sa_code_id = upsert_server_action(
        c,
        model_id,
        SA_CODE_NAME,
        {"state": "code", "code": CODE},
    )

    # Keep legacy webhook SA inactive (query secret stripped by Kapso proxy).
    field_ids = kw(
        c,
        "ir.model.fields",
        "search",
        [("model", "=", "crm.lead"), ("name", "in", WEBHOOK_FIELD_NAMES)],
    )
    sa_webhook_id = upsert_server_action(
        c,
        model_id,
        SA_WEBHOOK_NAME,
        {
            "state": "webhook",
            "webhook_url": webhook_url,
            "webhook_field_ids": [(6, 0, field_ids)],
        },
    )

    auto_ids = kw(c, "base.automation", "search", [("name", "=", AUTO_NAME)])
    auto_vals = {
        "name": AUTO_NAME,
        "model_id": model_id,
        "trigger": "on_stage_set",
        "filter_domain": "[('stage_id', '=', %d)]" % stage["id"],
        "action_server_ids": [(6, 0, [sa_code_id])],
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
        "stage": stage,
        "automation": {"id": auto_id, "action": auto_action, "name": AUTO_NAME},
        "server_actions": {
            "code": sa_code_id,
            "webhook_legacy_unused": sa_webhook_id,
        },
        "webhook_url": webhook_url,
        "params": {PARAM_STAGE: stage["id"], PARAM_URL: webhook_url},
    }


def main() -> None:
    load_env()
    parser = argparse.ArgumentParser()
    parser.add_argument("target", choices=["test", "prod"], nargs="?", default="prod")
    parser.add_argument("--webhook-url", default="")
    parser.add_argument("--secret", default="")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    secret = args.secret or os.environ.get("LIFE_ODOO_WEBHOOK_SECRET") or secrets.token_urlsafe(24)
    webhook_url = args.webhook_url or os.environ.get("LIFE_ODOO_PRESUPUESTO_WEBHOOK_URL") or ""
    if not webhook_url:
        print(
            "Need --webhook-url or LIFE_ODOO_PRESUPUESTO_WEBHOOK_URL "
            "(Kapso function invoke URL).",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.dry_run:
        print(json.dumps({"dry_run": True, "webhook_url": webhook_url, "code": CODE[:200]}, indent=2))
        return

    c = client(args.target)
    report = setup(c, webhook_url, secret)
    report["secret_set"] = True
    report["secret_preview"] = secret[:4] + "…"
    # Persist secret hint for local .env (do not print full secret)
    report["hint"] = (
        "Add to .env: LIFE_ODOO_WEBHOOK_SECRET=<same secret> and "
        "sync to Kapso function secret LIFE_ODOO_WEBHOOK_SECRET"
    )
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    # Write secret to scratch for deploy step (gitignored ideally)
    scratch = Path(__file__).resolve().parent.parent / "scratch"
    scratch.mkdir(exist_ok=True)
    secret_file = scratch / "presupuesto_webhook_secret.txt"
    secret_file.write_text(secret + "\n")
    report_path = scratch / "presupuesto_webhook_setup.json"
    report_path.write_text(json.dumps({**report, "secret": secret}, indent=2) + "\n")
    print(f"Wrote {secret_file} and {report_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
