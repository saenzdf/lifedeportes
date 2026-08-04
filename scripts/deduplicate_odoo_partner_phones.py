#!/usr/bin/env python3
"""
Fusiona contactos Odoo con el mismo teléfono (phone_sanitized).
Mantiene el partner recomendado (pedido más reciente) y fusiona el resto vía wizard Odoo.

Uso:
  python scripts/deduplicate_odoo_partner_phones.py              # dry-run
  python scripts/deduplicate_odoo_partner_phones.py --apply    # ejecutar merges
  python scripts/deduplicate_odoo_partner_phones.py --apply --limit 5

Entrada: scratch/odoo_duplicate_phones.json (generar con export_odoo_duplicate_phones.py)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import xmlrpc.client
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IN_JSON = ROOT / "scratch" / "odoo_duplicate_phones.json"
LOG_JSON = ROOT / "scratch" / "deduplicate_partner_phones_log.json"


def odoo():
    url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
    db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
    pwd = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, pwd, {})
    if not uid:
        raise RuntimeError("Odoo auth failed")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
    return models, uid, db, pwd


def partner_exists(models, uid, db, pwd, partner_id: int) -> bool:
    rows = models.execute_kw(
        db, uid, pwd, "res.partner", "search_read", [[("id", "=", partner_id)]], {"fields": ["id"], "limit": 1}
    )
    return bool(rows)


def archive_duplicate_phone(models, uid, db, pwd, slave_id: int, master_id: int, apply: bool) -> dict:
    """Fallback cuando merge falla (usuarios vinculados, etc.): quita teléfono del duplicado."""
    rows = models.execute_kw(
        db,
        uid,
        pwd,
        "res.partner",
        "read",
        [[slave_id]],
        {"fields": ["name", "phone", "active", "comment"]},
    )
    if not rows:
        return {"status": "skip", "reason": "slave_missing", "slave_id": slave_id}
    row = rows[0]
    note = f"[Kapso dedup {datetime.now(timezone.utc).date()}] Teléfono movido al contacto maestro id={master_id}."
    existing_comment = (row.get("comment") or "").strip()
    new_comment = f"{existing_comment}\n{note}".strip() if existing_comment else note
    action = {
        "status": "planned_archive",
        "slave_id": slave_id,
        "master_id": master_id,
        "old_phone": row.get("phone"),
    }
    if not apply:
        action["status"] = "dry_run_archive"
        return action
    models.execute_kw(
        db,
        uid,
        pwd,
        "res.partner",
        "write",
        [[slave_id], {"phone": False, "comment": new_comment}],
    )
    action["status"] = "archived_phone"
    return action


def merge_group(models, uid, db, pwd, master_id: int, member_ids: list[int], apply: bool) -> dict:
    member_ids = sorted(set(member_ids))
    if master_id not in member_ids:
        member_ids.append(master_id)
    slaves = [i for i in member_ids if i != master_id]

    if not slaves:
        return {"status": "skip", "reason": "single_partner", "master_id": master_id}

    if not partner_exists(models, uid, db, pwd, master_id):
        return {"status": "skip", "reason": "master_missing", "master_id": master_id, "slaves": slaves}

    alive_slaves = [s for s in slaves if partner_exists(models, uid, db, pwd, s)]
    if not alive_slaves:
        return {"status": "skip", "reason": "slaves_already_merged", "master_id": master_id}

    action = {
        "status": "planned",
        "master_id": master_id,
        "merge_ids": [master_id] + alive_slaves,
        "slaves": alive_slaves,
    }

    if not apply:
        action["status"] = "dry_run"
        return action

    try:
        wiz_id = models.execute_kw(
            db,
            uid,
            pwd,
            "base.partner.merge.automatic.wizard",
            "create",
            [
                {
                    "state": "selection",
                    "dst_partner_id": master_id,
                    "partner_ids": [(6, 0, [master_id] + alive_slaves)],
                }
            ],
        )
        models.execute_kw(
            db, uid, pwd, "base.partner.merge.automatic.wizard", "action_merge", [[wiz_id]]
        )
        action["status"] = "merged"
        action["wizard_id"] = wiz_id
    except xmlrpc.client.Fault as fault:
        action["status"] = "error"
        action["error"] = str(fault)
        if apply and "cannot merge contacts linked" in str(fault).lower():
            archived = []
            for sid in alive_slaves:
                archived.append(archive_duplicate_phone(models, uid, db, pwd, sid, master_id, True))
            action["fallback"] = archived
            if all(a.get("status") == "archived_phone" for a in archived):
                action["status"] = "archived_phone_fallback"
    except Exception as exc:
        action["status"] = "error"
        action["error"] = str(exc)

    return action


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="Max grupos a procesar")
    parser.add_argument("--archive-fallback", action="store_true", help="Solo fallback: quitar teléfono a duplicados sin merge")
    parser.add_argument("--phone", help="Solo un phone_sanitized (+573...)")
    parser.add_argument("--master-id", type=int, help="Override partner maestro")
    args = parser.parse_args()

    if not IN_JSON.exists():
        print(f"Missing {IN_JSON}. Run: python scripts/export_odoo_duplicate_phones.py", file=sys.stderr)
        return 1

    data = json.loads(IN_JSON.read_text(encoding="utf-8"))
    groups = data.get("duplicates") or []
    if args.phone:
        groups = [g for g in groups if g.get("phone_sanitized") == args.phone]
    if args.limit:
        groups = groups[: args.limit]

    models, uid, db, pwd = odoo()
    print(f"Odoo uid={uid} | groups={len(groups)} | apply={args.apply}\n")

    results = []
    stats = {"merged": 0, "dry_run": 0, "skip": 0, "error": 0, "archived_phone_fallback": 0}

    for group in groups:
        master = args.master_id or group["recommended_partner_id"]
        member_ids = [m["id"] for m in group["members"]]
        phone = group["phone_sanitized"]
        name = group.get("recommended_partner_name", "")

        if args.archive_fallback:
            slaves = [i for i in member_ids if i != master]
            outcome = {"phone_sanitized": phone, "recommended_name": name, "master_id": master, "fallback": []}
            for sid in slaves:
                if partner_exists(models, uid, db, pwd, sid):
                    outcome["fallback"].append(archive_duplicate_phone(models, uid, db, pwd, sid, master, args.apply))
            outcome["status"] = "archived_phone_fallback" if args.apply else "dry_run_archive"
        else:
            outcome = merge_group(models, uid, db, pwd, master, member_ids, args.apply)
            outcome["phone_sanitized"] = phone
            outcome["recommended_name"] = name
        results.append(outcome)

        st = outcome["status"]
        if st in stats:
            stats[st] += 1
        elif st == "planned":
            stats["dry_run"] += 1

        icon = {"merged": "✅", "dry_run": "🔍", "planned": "🔍", "skip": "⏭", "error": "❌", "archived_phone_fallback": "📵", "dry_run_archive": "🔍"}.get(st, "•")
        extra = ""
        if st == "error":
            extra = f" — {outcome.get('error', '')[:120]}"
        elif st in ("dry_run", "planned"):
            extra = f" — fusionar {outcome.get('slaves', [])} → {master} ({name})"
        elif st == "skip":
            extra = f" — {outcome.get('reason')}"
        print(f"{icon} {phone} {extra}")

    log = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "apply": args.apply,
        "stats": stats,
        "results": results,
    }
    LOG_JSON.write_text(json.dumps(log, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nLog: {LOG_JSON}")
    print(f"Stats: {stats}")

    if args.apply:
        print("\nRe-export duplicates:")
        print("  python scripts/export_odoo_duplicate_phones.py")

    return 0 if stats.get("error", 0) == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
