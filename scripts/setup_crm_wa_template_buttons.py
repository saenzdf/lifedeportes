#!/usr/bin/env python3
"""Setup botones Odoo crm.lead → Kapso templates WhatsApp (retoma / abono 50%).

Crea 2 ir.actions.server (Execute Code) con binding en formulario de oportunidad.
POST a Kapso odoo-send-wa-template (header X-Life-Webhook-Secret).

safe_eval Odoo 19 SaaS: requests disponible (mismo patrón Proposition);
sin import / re — digits_only a mano.

Uso:
  python scripts/setup_crm_wa_template_buttons.py prod
  python scripts/setup_crm_wa_template_buttons.py prod \\
    --webhook-url URL --secret SECRET
  python scripts/setup_crm_wa_template_buttons.py prod --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
SCRATCH = Path(__file__).resolve().parent.parent / "scratch"

PARAM_URL = "life.kapso.wa_template_webhook_url"
PARAM_SECRET = "life.kapso.wa_template_webhook_secret"

SA_RETOMAR = "WA: Enviar retoma (template)"
SA_ABONO = "WA: Enviar abono 50% (cuentas)"


def make_code(template: str) -> str:
    """Python Execute Code — Odoo 19 Studio safe_eval (sin import/re)."""
    return f"""
TEMPLATE = {template!r}

ICP = env['ir.config_parameter'].sudo()
webhook_url = ICP.get_param({PARAM_URL!r}) or ''
webhook_secret = ICP.get_param({PARAM_SECRET!r}) or ''

if not webhook_url:
    raise UserError('Falta parámetro {PARAM_URL}. Ejecute setup_crm_wa_template_buttons.py')

def digits_only(s):
    out = ''
    for ch in (s or ''):
        if ch >= '0' and ch <= '9':
            out += ch
    return out

for lead in records:
    phone = digits_only(lead.phone or '')
    partner = lead.partner_id
    if partner and not phone:
        phone = digits_only(partner.mobile or partner.phone or '')
    if len(phone) == 10 and phone[0] == '3':
        phone = '57' + phone
    if len(phone) < 10:
        raise UserError(
            'La oportunidad %s no tiene teléfono WhatsApp (phone / partner).'
            % (lead.display_name,)
        )

    customer_name = (lead.contact_name or lead.partner_name or '')
    if not customer_name and partner:
        customer_name = partner.name or ''
    if not customer_name:
        customer_name = lead.name or ''

    payload = {{
        'event': 'crm.wa_template',
        'template': TEMPLATE,
        'lead_id': lead.id,
        'customer_phone': phone,
        'customer_name': customer_name[:80],
        'order_summary': (lead.name or '')[:120],
    }}
    headers = {{
        'Content-Type': 'application/json',
        'X-Life-Webhook-Secret': webhook_secret or '',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }}
    resp = requests.post(webhook_url, json=payload, headers=headers, timeout=25)
    body_txt = ''
    try:
        body_txt = (resp.text or '')[:240]
    except Exception:
        body_txt = ''
    if resp.status_code >= 400:
        raise UserError(
            'Kapso rechazó %s (HTTP %s): %s'
            % (TEMPLATE, resp.status_code, body_txt)
        )
    lead.message_post(
        body='WhatsApp template <b>%s</b> enviado a <b>%s</b>.'
        % (TEMPLATE, phone)
    )
    log('WA template %s → %s (lead %s) HTTP %s' % (TEMPLATE, phone, lead.id, resp.status_code))
""".strip()


CODE_RETOMAR = make_code("retomar_pedido_v2")
CODE_ABONO = make_code("abono_50_cuentas")


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
    # Odoo 19: binding_type action (menú Acción / botón)
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
        inv = SCRATCH / "odoo_send_wa_template_invoke.txt"
        if inv.exists():
            url = inv.read_text().strip()
    if not url:
        reg = Path(__file__).resolve().parent.parent / "kapso" / "service_registry.json"
        if reg.exists():
            data = json.loads(reg.read_text())
            url = (
                data.get("order_detail", {})
                .get("odoo_send_wa_template", {})
                .get("invoke_url")
                or ""
            )
            fn_id = (
                data.get("order_detail", {})
                .get("odoo_send_wa_template", {})
                .get("kapso_function_id")
                or ""
            )
            if not url and fn_id:
                url = f"https://api.kapso.ai/platform/v1/functions/{fn_id}/invoke"
    if not secret:
        secret = os.environ.get("LIFE_WA_TEMPLATE_WEBHOOK_SECRET") or ""
    if not secret:
        for p in (
            SCRATCH / "wa_template_webhook_secret.txt",
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
    model = kw(c, "ir.model", "search_read", [("model", "=", "crm.lead")], fields=["id"])[0]
    model_id = model["id"]

    upsert_param(c, PARAM_URL, webhook_url)
    upsert_param(c, PARAM_SECRET, secret)

    sa_retomar = upsert_server_action(c, model_id, SA_RETOMAR, CODE_RETOMAR)
    sa_abono = upsert_server_action(c, model_id, SA_ABONO, CODE_ABONO)

    return {
        "prefix": c["prefix"],
        "url": c["url"],
        "model_id": model_id,
        "server_actions": {
            "retomar": {"id": sa_retomar, "name": SA_RETOMAR, "template": "retomar_pedido_v2"},
            "abono": {"id": sa_abono, "name": SA_ABONO, "template": "abono_50_cuentas"},
        },
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
        print("ERROR: falta --webhook-url (o scratch/odoo_send_wa_template_invoke.txt)", file=sys.stderr)
        sys.exit(1)
    if not secret:
        print("ERROR: falta --secret (o scratch/wa_template_webhook_secret.txt)", file=sys.stderr)
        sys.exit(1)

    print("target", args.target)
    print("webhook_url", webhook_url)
    print("secret_len", len(secret))
    if args.dry_run:
        print("DRY RUN — código retomar (primeras líneas):")
        print("\n".join(CODE_RETOMAR.splitlines()[:25]))
        return

    c = client(args.target)
    # Inventory existing actions
    existing = kw(
        c,
        "ir.actions.server",
        "search_read",
        [("model_id.model", "=", "crm.lead"), ("name", "ilike", "WA:")],
        fields=["id", "name", "state", "binding_model_id"],
    )
    print("existing WA actions", existing)

    result = setup(c, webhook_url, secret)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print("OK — en oportunidad: menú Acción →", SA_RETOMAR, "/", SA_ABONO)


if __name__ == "__main__":
    main()
