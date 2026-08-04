#!/usr/bin/env python3
"""Desactiva base.automation id 17 — Tags en la descripción de una tarea.

Esa regla pisaba project.task.description con «Tipo de corte: …» (o vaciaba
la descripción) al tocar tag_ids, borrando la lista HTML de Kapso.

Uso:
  python scripts/disable_tags_description_automation.py prod
  python scripts/disable_tags_description_automation.py test
"""
from __future__ import annotations

import json
import os
import sys
import xmlrpc.client
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

AUTO_ID = 17
AUTO_NAME = "Tags en la descripción de una tarea"
SA_ID = 1443
SA_NAME = "Tag en la descripción"


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


def disable(c: dict) -> dict:
    autos = kw(
        c,
        "base.automation",
        "search_read",
        ["|", ("id", "=", AUTO_ID), ("name", "=", AUTO_NAME)],
        fields=["id", "name", "active", "action_server_ids", "filter_domain", "trigger"],
    )
    if not autos:
        raise RuntimeError(f"Automation not found (id={AUTO_ID} name={AUTO_NAME!r})")

    report = {"prefix": c["prefix"], "url": c["url"], "before": autos, "writes": []}
    for auto in autos:
        if auto.get("active"):
            kw(c, "base.automation", "write", [auto["id"]], {"active": False})
            report["writes"].append({"model": "base.automation", "id": auto["id"], "active": False})
        else:
            report["writes"].append(
                {
                    "model": "base.automation",
                    "id": auto["id"],
                    "active": False,
                    "already": True,
                }
            )

    after = kw(
        c,
        "base.automation",
        "search_read",
        [("id", "in", [a["id"] for a in autos])],
        fields=["id", "name", "active"],
    )
    report["after"] = after

    # Leave server action in place (inactive via automation); do not delete.
    sa = kw(
        c,
        "ir.actions.server",
        "search_read",
        ["|", ("id", "=", SA_ID), ("name", "=", SA_NAME)],
        fields=["id", "name"],
        limit=3,
    )
    report["server_action"] = sa
    report["note"] = (
        "Automation deactivated. Tags still drive Fabricación Javier/Paola; "
        "description is no longer overwritten."
    )
    return report


def main() -> None:
    load_env()
    prefix = sys.argv[1] if len(sys.argv) > 1 else "prod"
    if prefix not in ("test", "prod"):
        print("Usage: disable_tags_description_automation.py [test|prod]", file=sys.stderr)
        sys.exit(1)
    c = client(prefix)
    report = disable(c)
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    if not all(not a.get("active") for a in report["after"]):
        sys.exit(2)


if __name__ == "__main__":
    main()
