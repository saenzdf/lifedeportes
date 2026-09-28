#!/usr/bin/env python3
"""Reactivate MRP Fabricación rules and merge designer assignment into them."""
import json
import os
import xmlrpc.client
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

ASSIGN_PREFIX = """
# --- Asignar diseñador según proyecto / campo x_studio_diseador ---
for task in records:
    designer = task.x_studio_diseador
    project = task.project_id
    if not designer and project:
        if 'javier' in (project.name or '').lower():
            designer = env['res.users'].search([('name', 'ilike', 'jose'), ('name', 'ilike', 'dise')], limit=1)
        elif 'paola' in (project.name or '').lower():
            designer = env['res.users'].search([('name', 'ilike', 'leyrol'), ('name', 'ilike', 'dise')], limit=1)
    if designer:
        task.write({'user_ids': [(6, 0, [designer.id])]})
        partner = designer.partner_id
        if partner:
            task.message_subscribe(partner_ids=[partner.id])
        task.message_post(
            body='<p>Tarea asignada a %s</p>' % (designer.name,),
            partner_ids=[partner.id] if partner else [],
            subtype_xmlid='mail.mt_comment',
            body_is_html=True,
        )

""".strip() + "\n\n"

MARKER = "# --- Asignar diseñador según proyecto / campo x_studio_diseador ---"


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
    return {"db": db, "uid": uid, "pwd": pwd, "models": models, "prefix": prefix}


def kw(c, model, method, *args, **kwargs):
    return c["models"].execute_kw(c["db"], c["uid"], c["pwd"], model, method, list(args), kwargs or {})


def fix_instance(c):
    report = {"prefix": c["prefix"]}

    for auto_id in (5, 9):
        kw(c, "base.automation", "write", [auto_id], {"active": True})
    report["reactivated_fabricacion"] = [5, 9]

    dup_ids = kw(
        c, "base.automation", "search",
        [("name", "in", ["Asignar diseñador Fabricación Javier", "Asignar diseñador Fabricación Paola"])],
    )
    if dup_ids:
        kw(c, "base.automation", "write", dup_ids, {"active": False})
        report["deactivated_duplicates"] = dup_ids

    for sa_name in ("Fabricación Javier", "Fabricación Paola"):
        sa_ids = kw(c, "ir.actions.server", "search", [("name", "=", sa_name), ("state", "=", "code")])
        if not sa_ids:
            report[f"missing_{sa_name}"] = True
            continue
        sa = kw(c, "ir.actions.server", "read", [sa_ids[0]], fields=["code"])[0]
        code = sa.get("code") or ""
        if MARKER not in code:
            kw(c, "ir.actions.server", "write", [sa_ids[0]], {"code": ASSIGN_PREFIX + code})
            report[f"merged_{sa_name}"] = sa_ids[0]
        else:
            report[f"already_merged_{sa_name}"] = sa_ids[0]

    default_ids = kw(c, "base.automation", "search", [("name", "=", "Default diseñador Paola al crear tarea")])
    if default_ids:
        kw(c, "base.automation", "write", default_ids, {"active": True})
        report["default_paola_automation"] = default_ids

    paola = kw(c, "project.project", "search_read", [("name", "ilike", "paola")], fields=["id"], limit=1)
    jose = kw(c, "res.users", "search_read", [("name", "ilike", "jose dise")], fields=["partner_id"], limit=1)
    if paola and jose:
        jose_pid = jose[0]["partner_id"][0]
        fl = kw(
            c, "mail.followers", "search",
            [("res_model", "=", "project.project"), ("res_id", "=", paola[0]["id"]), ("partner_id", "=", jose_pid)],
        )
        if fl:
            kw(c, "mail.followers", "unlink", fl)
            report["removed_jose_from_paola_project"] = fl

    report["final_automations"] = kw(
        c, "base.automation", "search_read",
        [("model_name", "=", "project.task"), "|", ("name", "ilike", "fabric"), ("name", "ilike", "dise")],
        fields=["id", "name", "active", "action_server_ids", "filter_domain"],
    )
    return report


def main():
    load_env()
    results = {prefix: fix_instance(client(prefix)) for prefix in ("test", "prod")}
    print(json.dumps(results, indent=2, default=str))


if __name__ == "__main__":
    main()
