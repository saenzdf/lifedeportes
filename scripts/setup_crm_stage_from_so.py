#!/usr/bin/env python3
"""CRM stages from sale.order: pago/confirm → Pasa a diseño; cancel → Perdida.

Companion to CRM Proposition → SO (automation 26 / SA 1549).

  python scripts/setup_crm_stage_from_so.py prod
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import xmlrpc.client
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

STAGE_DESIGN = 4  # Pasa a diseño (is_won)
STAGE_LOST = 5  # Perdida

AUTO_PAID = "SO confirmado → oportunidad Pasa a diseño"
SA_PAID = "SO confirmado: CRM Pasa a diseño"

AUTO_CANCEL = "SO cancelado → oportunidad Perdida"
SA_CANCEL = "SO cancelado: CRM Perdida"

CODE_PAID = """
STAGE_DESIGN = %d
for order in records:
    if order.state not in ('sale', 'done'):
        continue
    lead = order.opportunity_id
    if not lead:
        continue
    if lead.stage_id and lead.stage_id.id == STAGE_DESIGN:
        continue
    lead.write({'stage_id': STAGE_DESIGN})
    log('SO %%s → lead %%s Pasa a diseño' %% (order.name, lead.id))
""".strip() % STAGE_DESIGN

CODE_CANCEL = """
STAGE_LOST = %d
for order in records:
    if order.state != 'cancel':
        continue
    lead = order.opportunity_id
    if not lead:
        continue
    if lead.stage_id and lead.stage_id.id == STAGE_LOST:
        continue
    lead.write({'stage_id': STAGE_LOST})
    log('SO %%s cancel → lead %%s Perdida' %% (order.name, lead.id))
""".strip() % STAGE_LOST


def load_env():
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


def kw(c: dict, model: str, method: str, *args, **kwargs):
    return c["models"].execute_kw(
        c["db"], c["uid"], c["pwd"], model, method, list(args), kwargs or {}
    )


def upsert_server_action(c: dict, model_id: int, name: str, code: str) -> int:
    ids = kw(
        c,
        "ir.actions.server",
        "search",
        [("name", "=", name), ("model_id", "=", model_id)],
    )
    payload = {
        "name": name,
        "model_id": model_id,
        "state": "code",
        "code": code,
    }
    if ids:
        kw(c, "ir.actions.server", "write", ids, payload)
        return ids[0]
    created = kw(c, "ir.actions.server", "create", [payload])
    return created[0] if isinstance(created, list) else created


def upsert_automation(
    c: dict,
    *,
    name: str,
    model_id: int,
    filter_domain: str,
    sa_id: int,
) -> dict:
    auto_ids = kw(c, "base.automation", "search", [("name", "=", name)])
    auto_vals = {
        "name": name,
        "model_id": model_id,
        "trigger": "on_state_set",
        "filter_domain": filter_domain,
        "action_server_ids": [(6, 0, [sa_id])],
        "active": True,
    }
    if auto_ids:
        kw(c, "base.automation", "write", auto_ids, auto_vals)
        return {"id": auto_ids[0], "action": "updated", "name": name}
    created = kw(c, "base.automation", "create", [auto_vals])
    auto_id = created[0] if isinstance(created, list) else created
    return {"id": auto_id, "action": "created", "name": name}


def setup(c: dict) -> dict:
    model = kw(c, "ir.model", "search_read", [("model", "=", "sale.order")], fields=["id"])[0]
    model_id = model["id"]

    sa_paid = upsert_server_action(c, model_id, SA_PAID, CODE_PAID)
    sa_cancel = upsert_server_action(c, model_id, SA_CANCEL, CODE_CANCEL)

    auto_paid = upsert_automation(
        c,
        name=AUTO_PAID,
        model_id=model_id,
        filter_domain="[('state', '=', 'sale')]",
        sa_id=sa_paid,
    )
    auto_cancel = upsert_automation(
        c,
        name=AUTO_CANCEL,
        model_id=model_id,
        filter_domain="[('state', '=', 'cancel')]",
        sa_id=sa_cancel,
    )

    return {
        "prefix": c["prefix"],
        "url": c["url"],
        "stages": {"pasa_a_diseno": STAGE_DESIGN, "perdida": STAGE_LOST},
        "automations": [auto_paid, auto_cancel],
        "server_actions": {"paid": sa_paid, "cancel": sa_cancel},
    }


def main():
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("prefix", choices=["prod", "test"], nargs="?", default="prod")
    args = ap.parse_args()
    report = setup(client(args.prefix))
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
