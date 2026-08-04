#!/usr/bin/env python3
"""Backfill CRM description with Kapso inbox deep-link from <!-- kapso:conv=... -->."""
from __future__ import annotations

import os
import re
import xmlrpc.client
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
PROJECT_ID = "b470d474-6a7a-4d84-a214-6cd4b198b4f3"
LEAD_IDS = [3584, 3585, 3586, 3587, 3588, 3589, 3590, 3591]
CONV_RE = re.compile(r"<!--\s*kapso:[^>]*\bconv=([0-9a-f-]{36})", re.I)
LINK_RE = re.compile(r"Abrir chat en Kapso", re.I)


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


def inject_link(desc: str, conv_id: str) -> str:
    if LINK_RE.search(desc or ""):
        return desc
    link = (
        f'<p><a href="{kapso_url(conv_id)}" target="_blank" rel="noopener noreferrer">'
        f"<b>Abrir chat en Kapso</b></a> (enviar template / responder)</p>\n"
    )
    # Prefer after Conversación date line
    m = re.search(r"(<p><b>Conversación:</b>[^<]*</p>\s*)", desc or "", re.I)
    if m:
        i = m.end()
        return desc[:i] + link + desc[i:]
    return link + (desc or "")


def main():
    load_env()
    url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
    db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
    pwd = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", allow_none=True)
    uid = common.authenticate(db, user, pwd, {})
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True)

    recs = models.execute_kw(
        db,
        uid,
        pwd,
        "crm.lead",
        "read",
        [LEAD_IDS],
        {"fields": ["id", "name", "description"]},
    )
    for r in recs:
        desc = r.get("description") or ""
        m = CONV_RE.search(desc)
        if not m:
            print(r["id"], r["name"], "no conv id")
            continue
        conv = m.group(1)
        new = inject_link(desc, conv)
        if new == desc:
            print(r["id"], r["name"], "already linked", conv[:8])
            continue
        models.execute_kw(
            db, uid, pwd, "crm.lead", "write", [[r["id"]], {"description": new}]
        )
        print(r["id"], r["name"], "ok", conv)
        print(" ", kapso_url(conv))


if __name__ == "__main__":
    main()
