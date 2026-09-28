#!/usr/bin/env python3
"""Restore Kapso + wa.me links on CRM descriptions that were reduced to 'Asignado a'."""
from __future__ import annotations

import os
import re
import urllib.error
import urllib.request
import json
import xmlrpc.client
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
PROJECT_ID = "b470d474-6a7a-4d84-a214-6cd4b198b4f3"
UUID_RE = re.compile(
    r"(?:conv=|conversation_id=|kapso:conv=)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
    re.I,
)
ASIGNADO_RE = re.compile(r"Asignado a:\s*(Paola|Javier)", re.I)
KAPSO_RE = re.compile(r"inbox\.kapso\.ai|Abrir chat en Kapso", re.I)
WAME_RE = re.compile(r"wa\.me/", re.I)
VISIBLE_CONV_RE = re.compile(
    r"<p>\s*conv=([0-9a-f-]{36})\s*</p>\s*",
    re.I,
)


def load_env():
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def kapso_url(conv_id: str) -> str:
    return f"https://inbox.kapso.ai/projects/{PROJECT_ID}?conversation_id={conv_id}"


def wa_me(phone: str | None) -> str | None:
    d = re.sub(r"\D", "", phone or "")
    if len(d) < 11:
        return None
    national = d if d.startswith("57") and len(d) >= 12 else d
    if len(national) < 11:
        return None
    text = "Hola, le escribo de Life Deportes para confirmar su pedido."
    from urllib.parse import quote

    return f"https://wa.me/{national}?text={quote(text)}"


def fetch_kapso_phone(conv_id: str, api_key: str) -> str:
    if not api_key:
        return ""
    url = f"https://api.kapso.ai/platform/v1/whatsapp/conversations/{conv_id}"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "X-API-Key": api_key})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return ""
    c = data.get("data") or data
    return re.sub(r"\D", "", str(c.get("phone_number") or c.get("phone") or ""))


def build_description(desc: str, conv: str, phone: str | None, create_date: str | None) -> str:
    next_desc = VISIBLE_CONV_RE.sub("", desc or "")
    wa = wa_me(phone)
    has_kapso = bool(KAPSO_RE.search(next_desc))
    has_wa = bool(WAME_RE.search(next_desc))
    has_date = bool(re.search(r"<b>Conversación:</b>", next_desc, re.I))

    bits = []
    if not has_date and create_date:
        day = str(create_date)[:10]
        bits.append(f"<p><b>Conversación:</b> {day}</p>")
    if not has_kapso:
        wa_bit = (
            f' · <a href="{wa}" target="_blank" rel="noopener noreferrer"><b>Escribir por WhatsApp</b></a>'
            if wa
            else ""
        )
        bits.append(
            f'<p><a href="{kapso_url(conv)}" target="_blank" rel="noopener noreferrer">'
            f"<b>Abrir chat en Kapso</b></a>{wa_bit}</p>"
        )
    elif wa and not has_wa:
        next_desc = re.sub(
            r"(<b>Abrir chat en Kapso</b></a>)",
            rf'\1 · <a href="{wa}" target="_blank" rel="noopener noreferrer"><b>Escribir por WhatsApp</b></a>',
            next_desc,
            count=1,
            flags=re.I,
        )
    prefix = "\n".join(bits)
    if prefix:
        next_desc = f"{prefix}\n{next_desc}".strip()
    if f"conv={conv}" not in next_desc:
        next_desc = f"{next_desc}\n<!-- kapso:conv={conv} source=backfill_links -->"
    return next_desc.strip()


def main():
    load_env()
    url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
    db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
    pwd = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    api_key = os.environ.get("KAPSO_API_KEY") or ""

    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", allow_none=True)
    uid = common.authenticate(db, user, pwd, {})
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True)

    ids = models.execute_kw(
        db,
        uid,
        pwd,
        "crm.lead",
        "search",
        [
            [
                ["type", "=", "opportunity"],
                ["active", "=", True],
                ["stage_id", "in", [1, 6]],
            ]
        ],
        {"order": "id desc", "limit": 200},
    )
    recs = models.execute_kw(
        db,
        uid,
        pwd,
        "crm.lead",
        "read",
        [ids],
        {"fields": ["id", "name", "phone", "description", "create_date", "stage_id"]},
    )

    updated = []
    skipped = []
    for r in recs:
        desc = r.get("description") or ""
        m = UUID_RE.search(desc) or VISIBLE_CONV_RE.search(desc)
        if not m:
            continue
        conv = m.group(1)
        needs_kapso = not KAPSO_RE.search(desc)
        needs_wa = not WAME_RE.search(desc)
        if not needs_kapso and not needs_wa:
            skipped.append((r["id"], r["name"], "already_linked"))
            continue
        phone = re.sub(r"\D", "", str(r.get("phone") or ""))
        if len(phone) < 11:
            phone = fetch_kapso_phone(conv, api_key)
        if not needs_kapso and needs_wa and len(phone) < 11:
            skipped.append((r["id"], r["name"], "private_number_no_wame"))
            continue
        new_desc = build_description(desc, conv, phone, r.get("create_date"))
        if new_desc == desc:
            skipped.append((r["id"], r["name"], "unchanged"))
            continue
        vals = {"description": new_desc}
        if phone and len(phone) >= 11 and len(re.sub(r"\D", "", str(r.get("phone") or ""))) < 11:
            vals["phone"] = f"+{phone}" if not str(phone).startswith("+") else phone
        models.execute_kw(db, uid, pwd, "crm.lead", "write", [[r["id"]], vals])
        updated.append(
            {
                "id": r["id"],
                "name": r["name"],
                "kapso": kapso_url(conv),
                "wame": bool(wa_me(phone)),
                "phone": bool(phone),
            }
        )
        print(f"OK #{r['id']} {r['name']!r} kapso=yes wa.me={'yes' if wa_me(phone) else 'no'}")

    print(f"\nupdated={len(updated)} skipped={len(skipped)}")
    for sid, name, why in skipped:
        if why != "already_linked":
            print(f" skip #{sid} {name!r} ({why})")


if __name__ == "__main__":
    main()
