#!/usr/bin/env python3
"""Replace Odoo /gallery images with real photos from Life Deportes Facebook album."""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import textwrap
import xmlrpc.client
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "gallery_social"
MANIFEST_PATH = ASSETS / "manifest.json"
DOCS_PATH = ASSETS / "SOURCES.md"

WEBSITE_ID = 2
GALLERY_PAGE_ID = 10
GALLERY_VIEW_ID = 5323
GALLERY_MENU_ID = 17
FB_ALBUM_URL = (
    "https://www.facebook.com/people/Life-Soluciones-Deportivas/100064176332051/"
)
IG_URL = "https://www.instagram.com/lifedeportes/"

PER_CATEGORY = 12
CATEGORIES = ("futbol", "voleibol", "baloncesto", "sudaderas")

ALT_TEMPLATES = {
    "futbol": "Equipo de fútbol con uniformes personalizados Life Deportes — publicación Facebook {fb_id}",
    "voleibol": "Equipo de voleibol con uniformes personalizados Life Deportes — publicación Facebook {fb_id}",
    "baloncesto": "Equipo de baloncesto con uniformes personalizados Life Deportes — publicación Facebook {fb_id}",
    "sudaderas": "Sudaderas y ropa deportiva personalizada Life Deportes — publicación Facebook {fb_id}",
}


def odoo_client() -> tuple[xmlrpc.client.ServerProxy, int, str, str, str, str]:
    url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
    db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
    password = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, password, {})
    if not uid:
        raise RuntimeError("Odoo auth failed")
    return xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object"), uid, db, user, password, url


def compress_image(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["sips", "-s", "format", "jpeg", "-Z", "1400", str(src), "--out", str(dest)],
        check=True,
        capture_output=True,
    )


def load_manifest(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def select_items(manifest: list[dict]) -> dict[str, list[dict]]:
    by_cat: dict[str, list[dict]] = {c: [] for c in CATEGORIES}
    for item in manifest:
        cat = item.get("category")
        if cat not in by_cat:
            continue
        by_cat[cat].append(item)
    selected: dict[str, list[dict]] = {}
    for cat in CATEGORIES:
        pool = sorted(
            by_cat[cat],
            key=lambda x: Path(x.get("file") or x.get("local", "")).stat().st_size
            if Path(x.get("file") or x.get("local", "")).is_file()
            else 0,
            reverse=True,
        )
        selected[cat] = pool[:PER_CATEGORY]
    return selected


def select_from_assets() -> dict[str, list[dict]]:
    """Restore from assets/gallery_social fb-*.jpg; honor team_curation.json (max 2/team)."""
    keep_ids: set[str] | None = None
    curation_path = ASSETS / "team_curation.json"
    if curation_path.is_file():
        curation = json.loads(curation_path.read_text(encoding="utf-8"))
        keep_ids = set()
        for team in curation.get("teams", []):
            keep = team.get("keep") or []
            if len(keep) > 2:
                raise RuntimeError(f"{team.get('team_key')}: keep has {len(keep)} > max 2")
            keep_ids.update(str(x) for x in keep)
        print(f"Using team_curation.json keep-list ({len(keep_ids)} photos, max 2/team)")

    selected: dict[str, list[dict]] = {}
    for cat in CATEGORIES:
        files = sorted((ASSETS / cat).glob("fb-*.jpg"), key=lambda p: p.stat().st_size, reverse=True)
        items = []
        for p in files:
            fb_id = p.stem.removeprefix("fb-")
            if keep_ids is not None and fb_id not in keep_ids:
                continue
            items.append({"fb_id": fb_id, "file": str(p), "category": cat})
        selected[cat] = items[:PER_CATEGORY]
    return selected


def upload_attachment(
    models, uid, db, user, password, base_url: str, local: Path, fb_id: str, category: str
) -> dict:
    data = local.read_bytes()
    name = f"gallery-{category}-fb-{fb_id}.jpg"
    existing = models.execute_kw(
        db,
        uid,
        password,
        "ir.attachment",
        "search",
        [[["name", "=", name], ["website_id", "=", WEBSITE_ID]]],
    )
    vals = {
        "name": name,
        "type": "binary",
        "datas": base64.b64encode(data).decode(),
        "mimetype": "image/jpeg",
        "public": True,
        "website_id": WEBSITE_ID,
        "description": f"Facebook photo {fb_id} — {category} — {FB_ALBUM_URL}",
    }
    if existing:
        models.execute_kw(db, uid, password, "ir.attachment", "write", [[existing[0]], vals])
        att_id = existing[0]
    else:
        att_id = models.execute_kw(db, uid, password, "ir.attachment", "create", [vals])
    url = f"{base_url}/web/content/{att_id}"
    return {"attachment_id": att_id, "url": url, "fb_id": fb_id, "category": category, "local": str(local)}


def gallery_item_html(url: str, alt: str, category: str) -> str:
    return textwrap.dedent(
        f"""
        <div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="{category}">
            <div class="ld-gallery-thumb">
                <img class="img img-fluid rounded w-100" src="{url}" alt="{alt}" loading="lazy" data-name="Image"/>
            </div>
        </div>
        """
    ).strip()


def section_titles() -> dict[str, tuple[str, str]]:
    return {
        "futbol": (
            "Galería de Uniformes de Fútbol — Trabajos Reales",
            "Equipos de fútbol en Colombia con uniformes personalizados fabricados por Life Deportes. "
            "Fotos tomadas de publicaciones oficiales en Facebook.",
        ),
        "voleibol": (
            "Galería de Uniformes de Voleibol — Trabajos Reales",
            "Equipos de voleibol femenino y masculino con diseños exclusivos en sublimación digital.",
        ),
        "baloncesto": (
            "Galería de Uniformes de Baloncesto — Trabajos Reales",
            "Uniformes de baloncesto personalizados en cancha y torneos locales.",
        ),
        "sudaderas": (
            "Galería de Sudaderas y Prendas — Trabajos Reales",
            "Sudaderas, chaquetas y conjuntos deportivos personalizados para equipos y clubes.",
        ),
    }


def build_wall_html(category: str, items: list[dict]) -> str:
    tiles = "\n".join(
        gallery_item_html(
            it["url"],
            ALT_TEMPLATES[category].format(fb_id=it["fb_id"]),
            category,
        )
        for it in items
    )
    title, desc = section_titles()[category]
    anchor = category if category != "sudaderas" else "sudaderas"
    return textwrap.dedent(
        f"""
        <div id="{anchor}" class="gallery-section-title s_title oe_structure" data-cat="{category}">
            <h2>{title}</h2>
            <p>{desc}</p>
        </div>
        <section class="s_image_gallery ld-gallery-wall o_spc-small pt24 pb56" data-wall-cat="{category}" style="overflow: hidden;">
            <div class="container px-0 px-lg-1">
                <div class="row s_nb_column_fixed g-3 g-lg-4 mx-0 mx-lg-n1">
        {tiles}
                </div>
            </div>
        </section>
        """
    ).strip()


def replace_gallery_walls(arch: str, walls: dict[str, str]) -> str:
    for cat in CATEGORIES:
        pattern = rf'(<div id="{cat}".*?</section>)'
        if cat == "futbol":
            pattern = rf'(<div id="futbol".*?</section>)'
        wall_html = walls[cat]
        arch, n = re.subn(pattern, wall_html, arch, count=1, flags=re.DOTALL)
        if n != 1:
            raise RuntimeError(f"Could not replace gallery wall for {cat!r}")
    return arch


def restore_gallery_access(models, uid, db, user, password, dry_run: bool) -> None:
    print("Restore /gallery (remove redirect, publish, show menu)")
    if dry_run:
        return
    rewrites = models.execute_kw(
        db,
        uid,
        password,
        "website.rewrite",
        "search",
        [[["url_from", "=", "/gallery"], ["website_id", "=", WEBSITE_ID]]],
    )
    if rewrites:
        models.execute_kw(db, uid, password, "website.rewrite", "unlink", [rewrites])
    models.execute_kw(
        db,
        uid,
        password,
        "website.page",
        "write",
        [[GALLERY_PAGE_ID], {"is_published": True, "website_indexed": False}],
    )
    models.execute_kw(
        db,
        uid,
        password,
        "website.menu",
        "write",
        [[GALLERY_MENU_ID], {"is_visible": True, "name": "Galería", "sequence": 5}],
    )


def write_docs(uploaded: list[dict]) -> None:
    lines = [
        "# Galería Odoo — fuentes de imágenes",
        "",
        f"Actualizado automáticamente por `scripts/update_odoo_gallery_from_social.py`.",
        "",
        "## Redes oficiales",
        "",
        f"- **Facebook:** {FB_ALBUM_URL}",
        f"- **Instagram:** {IG_URL} (no accesible sin login desde el scraper; pendiente añadir manualmente)",
        "",
        "## Álbum usado",
        "",
        "Fotos descargadas del álbum público «Photos» de la página Facebook oficial "
        "Life Soluciones Deportivas mediante `gallery-dl`.",
        "",
        "## Inventario",
        "",
        "| Categoría | FB photo ID | Archivo local | URL Odoo |",
        "|-----------|-------------|---------------|----------|",
    ]
    for row in uploaded:
        lines.append(
            f"| {row['category']} | {row['fb_id']} | `{Path(row['local']).name}` | {row['url']} |"
        )
    DOCS_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=Path("/tmp/ld-gallery-manifest.json"))
    parser.add_argument(
        "--from-assets",
        action="store_true",
        help="Restore from assets/gallery_social (fb-*.jpg + manifest). Prefer this over gallery-dl.",
    )
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--skip-restore", action="store_true", help="Do not republish /gallery")
    args = parser.parse_args()
    dry_run = not args.apply

    if args.from_assets:
        selected = select_from_assets()
    else:
        if not args.manifest.is_file():
            print(f"Manifest not found: {args.manifest}", file=sys.stderr)
            print("Use --from-assets or run gallery-dl first.", file=sys.stderr)
            return 1
        selected = select_items(load_manifest(args.manifest))

    for cat in CATEGORIES:
        print(f"{cat}: {len(selected[cat])} images selected")
        if not selected[cat]:
            print(f"ERROR: no images for {cat}", file=sys.stderr)
            return 1

    models, uid, db, user, password, base_url = odoo_client()
    uploaded: list[dict] = []
    walls: dict[str, list[dict]] = {c: [] for c in CATEGORIES}

    for cat in CATEGORIES:
        for item in selected[cat]:
            src = Path(item["file"])
            fb_id = str(item["fb_id"])
            local = ASSETS / cat / f"fb-{fb_id}.jpg"
            if dry_run:
                print(f"  [{cat}] {fb_id} <- {src.name}")
                walls[cat].append({"url": f"{base_url}/web/content/DRYRUN", "fb_id": fb_id, "local": str(local)})
                continue
            if src.resolve() != local.resolve():
                compress_image(src, local)
            elif not local.is_file():
                raise FileNotFoundError(local)
            row = upload_attachment(models, uid, db, user, password, base_url, local, fb_id, cat)
            walls[cat].append(row)
            uploaded.append(row)
            print(f"  ✓ [{cat}] {fb_id} → {row['url']}")

    if dry_run:
        print("\nDry run. Re-run with --apply")
        return 0

    arch = models.execute_kw(
        db, uid, password, "ir.ui.view", "read", [[GALLERY_VIEW_ID]], {"fields": ["arch_db", "key"]}
    )[0]["arch_db"]
    wall_html = {cat: build_wall_html(cat, walls[cat]) for cat in CATEGORIES}
    new_arch = replace_gallery_walls(arch, wall_html)
    models.execute_kw(db, uid, password, "ir.ui.view", "write", [[GALLERY_VIEW_ID], {"arch_db": new_arch}])
    models.execute_kw(
        db,
        uid,
        password,
        "website.page",
        "write",
        [[GALLERY_PAGE_ID], {
            "website_meta_title": "Galería de Trabajos Reales | Uniformes Life Deportes",
            "website_meta_description": (
                "Fotos reales de equipos con uniformes personalizados fabricados por Life Deportes. "
                "Fútbol, voleibol, baloncesto y sudaderas — publicaciones oficiales Facebook."
            ),
            "website_indexed": False,
        }],
    )

    if not args.skip_restore:
        restore_gallery_access(models, uid, db, user, password, dry_run=False)

    ASSETS.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(uploaded, indent=2, ensure_ascii=False), encoding="utf-8")
    write_docs(uploaded)
    print(f"\nGallery updated ({len(uploaded)} images). Docs: {DOCS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
