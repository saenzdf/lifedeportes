#!/usr/bin/env python3
"""Setup botón Odoo project.task → Kapso interpretar lista (Excel/PDF/imagen).

Crea ir.actions.server (Execute Code) con binding en formulario/lista de tarea.
POST a Kapso on-odoo-task-lista (header X-Life-Webhook-Secret).

safe_eval Odoo 19 SaaS: requests disponible; sin import / re.

Uso:
  python scripts/setup_task_lista_server_action.py prod
  python scripts/setup_task_lista_server_action.py prod \\
    --webhook-url URL --secret SECRET
  python scripts/setup_task_lista_server_action.py prod --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
SCRATCH = Path(__file__).resolve().parent.parent / "scratch"

PARAM_URL = "life.kapso.task_lista_webhook_url"
PARAM_SECRET = "life.kapso.task_lista_webhook_secret"

SA_NAME = "Interpretar lista (Excel/PDF/imagen)"

CODE = f"""
ICP = env['ir.config_parameter'].sudo()
webhook_url = ICP.get_param({PARAM_URL!r}) or ''
webhook_secret = ICP.get_param({PARAM_SECRET!r}) or ''

if not webhook_url:
    raise UserError('Falta parámetro {PARAM_URL}. Ejecute setup_task_lista_server_action.py')

for task in records:
    payload = {{
        'event': 'project.task.interpretar_lista',
        'task_id': task.id,
        'force': True,
        'sync_commercial': True,
        'task_name': (task.name or '')[:120],
    }}
    headers = {{
        'Content-Type': 'application/json',
        'X-Life-Webhook-Secret': webhook_secret or '',
    }}
    resp = requests.post(webhook_url, json=payload, headers=headers, timeout=90)
    body_txt = ''
    try:
        body_txt = (resp.text or '')[:400]
    except Exception:
        body_txt = ''
    if resp.status_code >= 400:
        raise UserError(
            'Kapso rechazó interpretar lista (HTTP %s): %s'
            % (resp.status_code, body_txt)
        )
    ok = True
    try:
        data = resp.json()
        ok = bool(data.get('ok'))
        msg = data.get('message') or body_txt
        if not ok:
            raise UserError('No se pudo organizar la lista: %s' % (msg,))
        task.message_post(
            body='Lista interpretada vía Kapso: <b>%s</b>.'
            % (msg or 'OK',)
        )
    except UserError:
        raise
    except Exception:
        task.message_post(
            body='Kapso interpretar lista HTTP %s: %s'
            % (resp.status_code, body_txt)
        )
    log('Interpretar lista task %s HTTP %s' % (task.id, resp.status_code))
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
        url = (os.environ.get("ODOO_URL") or os.environ["ODOO_LIFEDEPORTES_URL"]).rstrip("/")
        db = os.environ.get("ODOO_DB") or os.environ["ODOO_LIFEDEPORTES_DB"]
        user = os.environ.get("ODOO_USERNAME") or os.environ["ODOO_LIFEDEPORTES_USERNAME"]
        pwd = os.environ.get("ODOO_PASSWORD") or os.environ["ODOO_LIFEDEPORTES_PASSWORD"]
    import xmlrpc.client

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
        "binding_model_id": model_id,
        "binding_view_types": "list,form",
    }
    fields_get = kw(c, "ir.actions.server", "fields_get", [], {"attributes": ["type"]})
    if "binding_type" in fields_get:
        payload["binding_type"] = "action"
    if ids:
        kw(c, "ir.actions.server", "write", ids, payload)
        return ids[0]
    created = kw(c, "ir.actions.server", "create", [payload])
    return created[0] if isinstance(created, list) else created


def resolve_defaults(args: argparse.Namespace) -> tuple[str, str]:
    url = args.webhook_url
    secret = args.secret
    if not url:
        inv = SCRATCH / "odoo_task_lista_invoke.txt"
        if inv.exists():
            url = inv.read_text().strip()
    if not url:
        reg = Path(__file__).resolve().parent.parent / "kapso" / "service_registry.json"
        if reg.exists():
            data = json.loads(reg.read_text())
            entry = (data.get("order_detail") or {}).get("on_odoo_task_lista") or {}
            url = entry.get("invoke_url") or ""
            fn_id = entry.get("kapso_function_id") or ""
            if not url and fn_id:
                url = f"https://api.kapso.ai/platform/v1/functions/{fn_id}/invoke"
    if not secret:
        secret = os.environ.get("LIFE_TASK_LISTA_WEBHOOK_SECRET") or ""
    if not secret:
        for p in (
            SCRATCH / "task_lista_webhook_secret.txt",
            SCRATCH / "presupuesto_webhook_secret.txt",
        ):
            if p.exists():
                secret = p.read_text().strip()
                if secret:
                    break
    if not secret:
        secret = os.environ.get("LIFE_ODOO_WEBHOOK_SECRET") or ""
    return url, secret


def setup(c: dict, webhook_url: str, secret: str) -> dict:
    model = kw(c, "ir.model", "search_read", [("model", "=", "project.task")], fields=["id"])[0]
    model_id = model["id"]

    upsert_param(c, PARAM_URL, webhook_url)
    upsert_param(c, PARAM_SECRET, secret)

    sa_id = upsert_server_action(c, model_id, SA_NAME, CODE)

    return {
        "prefix": c["prefix"],
        "url": c["url"],
        "model_id": model_id,
        "server_action": {"id": sa_id, "name": SA_NAME},
        "params": {PARAM_URL: webhook_url, PARAM_SECRET: "(set)"},
    }


def main() -> None:
    load_env()
    parser = argparse.ArgumentParser()
    parser.add_argument("target", choices=["test", "prod"], nargs="?", default="prod")
    parser.add_argument("--webhook-url", default="")
    parser.add_argument("--secret", default="")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    webhook_url, secret = resolve_defaults(args)
    if not webhook_url:
        print(
            "ERROR: falta --webhook-url (o scratch/odoo_task_lista_invoke.txt). "
            "Primero: node kapso/scripts/deploy_on_odoo_task_lista.js",
            file=sys.stderr,
        )
        sys.exit(1)
    if not secret:
        print("ERROR: falta --secret (o scratch/task_lista_webhook_secret.txt)", file=sys.stderr)
        sys.exit(1)

    print("target", args.target)
    print("webhook_url", webhook_url)
    print("secret_len", len(secret))
    if args.dry_run:
        print("DRY RUN — código (primeras líneas):")
        print("\n".join(CODE.splitlines()[:20]))
        return

    c = client(args.target)
    existing = kw(
        c,
        "ir.actions.server",
        "search_read",
        [("model_id.model", "=", "project.task"), ("name", "ilike", "Interpretar lista")],
        fields=["id", "name", "state", "binding_model_id"],
    )
    print("existing", existing)

    result = setup(c, webhook_url, secret)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print("OK — en tarea: menú Acción →", SA_NAME)


if __name__ == "__main__":
    main()
