#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import ssl
import re
import xmlrpc.client
from pathlib import Path

def xmlrpc_clients(url: str):
    url = url.rstrip("/")
    ctx = ssl.create_default_context()
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", context=ctx, allow_none=True)
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", context=ctx, allow_none=True)
    return common, models

def main():
    # Load env vars
    env_path = Path(__file__).resolve().parent.parent / ".env"
    env_vars = {}
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env_vars[k.strip()] = v.strip().strip('"').strip("'")

    url = env_vars.get("ODOO_LIFEDEPORTES_PROD_URL")
    db = env_vars.get("ODOO_LIFEDEPORTES_PROD_DB")
    username = env_vars.get("ODOO_LIFEDEPORTES_PROD_USERNAME")
    password = env_vars.get("ODOO_LIFEDEPORTES_PROD_PASSWORD")

    if not url or not db or not username or not password:
        print("Missing production Odoo credentials in .env")
        return 1

    common, models = xmlrpc_clients(url)
    uid = common.authenticate(db, username, password, {})
    if not uid:
        print("Failed to authenticate.")
        return 1

    view_id = 5323
    print(f"Reading view {view_id} from Odoo...")
    view = models.execute_kw(
        db, uid, password, "ir.ui.view", "read",
        [[view_id], ["arch_db", "key"]]
    )[0]
    
    arch = view["arch_db"]
    
    # Remove image 29019
    pattern_29019 = re.compile(
        r'\s*<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="baloncesto">\s*<div class="ld-gallery-thumb">\s*<img[^>]*src="[^"]*29019[^"]*"[^>]*/>\s*</div>\s*</div>',
        re.DOTALL
    )
    # Remove image 29020
    pattern_29020 = re.compile(
        r'\s*<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="baloncesto">\s*<div class="ld-gallery-thumb">\s*<img[^>]*src="[^"]*29020[^"]*"[^>]*/>\s*</div>\s*</div>',
        re.DOTALL
    )
    
    new_arch, count1 = pattern_29019.subn("", arch)
    new_arch, count2 = pattern_29020.subn("", new_arch)
    
    print(f"Removed {count1} block for image 29019.")
    print(f"Removed {count2} block for image 29020.")

    # Save a backup locally
    output_dir = Path(__file__).resolve().parent.parent / "odoo_website" / "backup_production_2026_07_08"
    output_dir.mkdir(parents=True, exist_ok=True)
    optimized_file = output_dir / "view_5323_galería_de_diseños_optimized.xml"
    optimized_file.write_text(new_arch, encoding="utf-8")
    print(f"Saved local optimized file to {optimized_file}")

    # Write the changes back to Odoo
    print("Writing optimized view back to Odoo production...")
    models.execute_kw(
        db, uid, password, "ir.ui.view", "write",
        [[view_id], {"arch_db": new_arch}]
    )
    print("View successfully updated on production!")
    return 0

if __name__ == "__main__":
    import sys
    sys.exit(main())
