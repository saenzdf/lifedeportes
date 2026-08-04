#!/usr/bin/env python3
"""
Exporta clientes Odoo con teléfono duplicado (mismo phone_sanitized).
Salida: scratch/odoo_duplicate_phones.json + kapso/docs/odoo_duplicate_phones.md
"""
from __future__ import annotations

import json
import os
import xmlrpc.client
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "scratch" / "odoo_duplicate_phones.json"
OUT_MD = ROOT / "kapso" / "docs" / "odoo_duplicate_phones.md"


def odoo():
    url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
    db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
    pwd = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, pwd, {})
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
    return models, uid, db, pwd


def main():
    models, uid, db, pwd = odoo()
    partners = models.execute_kw(
        db,
        uid,
        pwd,
        "res.partner",
        "search_read",
        [[("phone_sanitized", "!=", False)]],
        {"fields": ["id", "name", "phone", "phone_sanitized", "active", "customer_rank"], "limit": 8000},
    )

    by_sanitized: dict[str, list] = defaultdict(list)
    for p in partners:
        san = p.get("phone_sanitized")
        if san:
            by_sanitized[san].append(p)

    duplicates = []
    for san, group in sorted(by_sanitized.items(), key=lambda x: (-len(x[1]), x[0])):
        if len(group) < 2:
            continue
        ids = [g["id"] for g in group]
        orders = models.execute_kw(
            db,
            uid,
            pwd,
            "sale.order",
            "search_read",
            [[("partner_id", "in", ids)]],
            {
                "fields": ["id", "name", "partner_id", "state", "date_order", "amount_total"],
                "order": "date_order desc, id desc",
                "limit": 100,
            },
        )
        orders_by_partner: dict[int, list] = defaultdict(list)
        for o in orders:
            pid = o["partner_id"][0]
            orders_by_partner[pid].append(o)

        members = []
        for g in sorted(group, key=lambda x: x["id"]):
            plist = orders_by_partner.get(g["id"], [])
            members.append(
                {
                    "id": g["id"],
                    "name": g["name"],
                    "phone": g.get("phone"),
                    "active": g.get("active"),
                    "order_count": len(plist),
                    "last_order": plist[0]["name"] if plist else None,
                    "last_order_date": plist[0].get("date_order") if plist else None,
                    "last_order_state": plist[0].get("state") if plist else None,
                }
            )

        recommended = sorted(
            members,
            key=lambda m: (
                m["order_count"],
                m["last_order_date"] or "",
                m["id"],
            ),
            reverse=True,
        )[0]

        has_orders = any(m["order_count"] > 0 for m in members)
        duplicates.append(
            {
                "phone_sanitized": san,
                "phone_display": group[0].get("phone"),
                "partner_count": len(group),
                "has_sale_orders": has_orders,
                "recommended_partner_id": recommended["id"],
                "recommended_partner_name": recommended["name"],
                "action_hint": (
                    "Mantener partner recomendado para WhatsApp/classify; "
                    "fusionar o corregir teléfono en los demás en Odoo."
                ),
                "members": members,
            }
        )

    duplicates.sort(key=lambda d: (0 if d["has_sale_orders"] else 1, -d["partner_count"], d["phone_sanitized"]))

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "odoo prod res.partner",
        "duplicate_phone_groups": len(duplicates),
        "duplicates": duplicates,
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Clientes Odoo — teléfonos duplicados",
        "",
        f"Generado: {payload['generated_at']}",
        f"Grupos duplicados: **{len(duplicates)}** (con pedidos: **{sum(1 for d in duplicates if d['has_sale_orders'])}**)",
        "",
        "El classify de Kapso elige el partner con **pedido más reciente** cuando hay ambigüedad.",
        "Revisa cada grupo y decide: fusionar contactos, corregir teléfono o archivar el duplicado.",
        "",
    ]
    for d in duplicates:
        flag = " **[tiene pedidos]**" if d["has_sale_orders"] else ""
        lines.append(f"## {d['phone_display']} (`{d['phone_sanitized']}`){flag}")
        lines.append("")
        lines.append(
            f"**Recomendado WhatsApp:** {d['recommended_partner_name']} (id {d['recommended_partner_id']})"
        )
        lines.append("")
        lines.append("| id | Nombre | Activo | Pedidos | Último SO | Estado |")
        lines.append("|----|--------|--------|---------|-----------|--------|")
        for m in d["members"]:
            mark = " ← recomendado" if m["id"] == d["recommended_partner_id"] else ""
            lines.append(
                f"| {m['id']} | {m['name']}{mark} | {'sí' if m['active'] else 'no'} | "
                f"{m['order_count']} | {m['last_order'] or '—'} | {m['last_order_state'] or '—'} |"
            )
        lines.append("")

    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_JSON}")
    print(f"Wrote {OUT_MD}")
    print(f"duplicate groups: {len(duplicates)}")


if __name__ == "__main__":
    main()
