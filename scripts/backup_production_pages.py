#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Backup and document Odoo website pages for life-soluciones.odoo.com
"""

import os
import ssl
import json
import xmlrpc.client
from pathlib import Path

def xmlrpc_clients(url: str):
    url = url.rstrip("/")
    ctx = ssl.create_default_context()
    # Disable certificate verification if needed, but default context is safer.
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", context=ctx, allow_none=True)
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", context=ctx, allow_none=True)
    return common, models

def main():
    # Load .env
    env_path = Path(__file__).resolve().parent.parent / ".env"
    env_vars = {}
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env_vars[k.strip()] = v.strip().strip('"').strip("'")

    # Get production credentials
    url = env_vars.get("ODOO_LIFEDEPORTES_PROD_URL")
    db = env_vars.get("ODOO_LIFEDEPORTES_PROD_DB")
    username = env_vars.get("ODOO_LIFEDEPORTES_PROD_USERNAME")
    password = env_vars.get("ODOO_LIFEDEPORTES_PROD_PASSWORD")

    if not url or not db or not username or not password:
        print("Missing production Odoo credentials in .env")
        return 1

    print(f"Connecting to production Odoo at {url} (DB: {db})...")
    common, models = xmlrpc_clients(url)
    try:
        uid = common.authenticate(db, username, password, {})
    except Exception as e:
        print(f"Authentication failed: {e}")
        return 1

    if not uid:
        print("Failed to authenticate.")
        return 1
    print(f"Authenticated successfully. User ID: {uid}")

    # Fetch websites
    websites = models.execute_kw(
        db, uid, password, "website", "search_read",
        [[], ["name", "domain"]]
    )
    print(f"Found {len(websites)} websites:")
    for w in websites:
        print(f"  - ID: {w['id']}, Name: {w['name']}, Domain: {w['domain']}")

    # Fetch all website pages
    pages = models.execute_kw(
        db, uid, password, "website.page", "search_read",
        [[], ["name", "url", "view_id", "website_id", "is_published", "write_date"]]
    )
    print(f"\nFound {len(pages)} pages in website.page model.")

    backup_dir = Path(__file__).resolve().parent.parent / "odoo_website" / "backup_production_2026_07_08"
    backup_dir.mkdir(parents=True, exist_ok=True)
    print(f"Backing up pages to: {backup_dir}")

    doc_content = []
    doc_content.append("# Odoo Website Production Backup - life-soluciones.odoo.com")
    doc_content.append(f"**Date:** 2026-07-08")
    doc_content.append(f"**Base URL:** {url}")
    doc_content.append(f"**Database:** {db}\n")

    doc_content.append("## Websites Configured\n")
    for w in websites:
        doc_content.append(f"- **ID:** {w['id']} | **Name:** {w['name']} | **Domain:** {w['domain']}")
    doc_content.append("\n## Pages Summary\n")
    doc_content.append("| Page ID | Name | URL | Website | Published | View ID | Last Updated |")
    doc_content.append("|---|---|---|---|---|---|---|")

    for pg in sorted(pages, key=lambda x: (x.get("website_id") or [0, ""])[0]):
        web_name = pg["website_id"][1] if pg["website_id"] else "Global (All)"
        vid = pg["view_id"][0] if pg["view_id"] else "None"
        vname = pg["view_id"][1] if pg["view_id"] else "None"
        doc_content.append(f"| {pg['id']} | {pg['name']} | `{pg['url']}` | {web_name} | {pg['is_published']} | {vid} ({vname}) | {pg['write_date']} |")

    doc_content.append("\n## Detailed Page Configurations & QWeb Architecture\n")

    for pg in pages:
        if not pg["view_id"]:
            continue
        vid = pg["view_id"][0]
        vname = pg["view_id"][1]
        
        # Read the view architecture
        view = models.execute_kw(
            db, uid, password, "ir.ui.view", "read",
            [[vid], ["name", "key", "arch_db", "type", "write_date"]]
        )[0]
        
        web_name = pg["website_id"][1] if pg["website_id"] else "Global"
        safe_name = pg['name'].lower().replace(" ", "_").replace("/", "").replace("(", "").replace(")", "")
        filename = f"view_{vid}_{safe_name}.xml"
        
        # Write individual xml file
        file_path = backup_dir / filename
        file_path.write_text(view["arch_db"], encoding="utf-8")
        print(f"Saved view {vid} ({pg['name']}) to {filename}")

        doc_content.append(f"### {pg['name']} ({pg['url']})")
        doc_content.append(f"- **Website:** {web_name}")
        doc_content.append(f"- **URL:** `{pg['url']}`")
        doc_content.append(f"- **View Name/ID:** {vname} (ID: {vid})")
        doc_content.append(f"- **View Key:** `{view['key']}`")
        doc_content.append(f"- **Type:** {view['type']}")
        doc_content.append(f"- **Last Updated:** {view['write_date']}")
        doc_content.append(f"- **Backup File:** [{filename}](./{filename})")
        doc_content.append("\n#### Architecture (QWeb/XML):\n")
        doc_content.append("```xml")
        doc_content.append(view["arch_db"])
        doc_content.append("```\n---\n")

    # Write summary doc
    summary_path = backup_dir / "README.md"
    summary_path.write_text("\n".join(doc_content), encoding="utf-8")
    print(f"Created documentation index at {summary_path}")
    return 0

if __name__ == "__main__":
    import sys
    sys.exit(main())
