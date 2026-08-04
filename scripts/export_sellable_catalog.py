import csv
import json
import os
import re
import sys
import xmlrpc.client
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


def normalize_category(name: str) -> str:
    text = (name or "").lower()
    if "uniforme" in text:
        return "uniforme"
    if "camiseta" in text:
        return "camiseta"
    if "pantaloneta" in text or "short" in text:
        return "pantaloneta"
    if "media" in text:
        return "medias"
    return "otros"


def extract_variant(name: str) -> str:
    n = (name or "").lower()
    rules = [
        ("manga larga", "manga_larga"),
        ("manga corta", "manga_corta"),
        ("sin botones", "polo_sin_botones"),
        ("con botones", "polo_con_botones"),
        ("arquero", "arquero"),
        ("sisa", "sisa"),
        ("lycra", "lycra"),
        ("lluvia", "lluvia"),
        ("dumonti", "dumonti"),
        ("falcao", "falcao"),
        ("dry fit", "dry_fit"),
        ("dryfit", "dry_fit"),
        ("hidrotec", "hidrotec"),
        ("polo", "polo"),
        ("bolsillos", "bolsillos"),
        ("impermeable", "impermeable"),
        ("mariposa", "mariposa"),
    ]
    for token, variant in rules:
        if token in n:
            return variant
    return "base"


def extract_material(name: str, variant: str) -> str:
    n = (name or "").lower()
    if "hidrotec" in n:
        return "hidrotec"
    if "dumonti" in n or "falcao" in n:
        return "dumonti"
    if "lluvia" in n:
        return "lluvia"
    if "dry fit" in n or "dryfit" in n or variant == "dry_fit":
        return "dry_fit"
    if variant in ("dumonti", "falcao", "hidrotec", "lluvia", "dry_fit"):
        return variant if variant != "falcao" else "dumonti"
    return "dry_fit"


UNIFORM_BASE_MIN_QTY = 6


def infer_commercial_role(category: str, name: str) -> str:
    n = (name or "").lower()
    if "diseño" in n or "diseno" in n:
        return "design"
    if category == "uniforme":
        return "base_uniform"
    if category in ("camiseta", "pantaloneta", "medias", "otros"):
        return "extra"
    return "extra"


def commercial_metadata(category: str, name: str) -> dict:
    role = infer_commercial_role(category, name)
    return {
        "commercial_role": role,
        "min_qty_standalone": UNIFORM_BASE_MIN_QTY if role == "base_uniform" else 1,
        "allow_without_base": role == "design",
    }


def family_key(category: str, name: str) -> str:
    n = (name or "").lower()
    if category == "camiseta":
        if "polo" in n:
            return "camiseta_polo"
        if "manga larga" in n:
            return "camiseta_manga_larga"
        return "camiseta_manga_corta"
    if category == "uniforme":
        if "polo" in n:
            return "uniforme_polo"
        if "manga larga" in n:
            return "uniforme_manga_larga"
        if "dumonti" in n or "falcao" in n:
            return "uniforme_dumonti"
        return "uniforme_manga_corta"
    if category == "medias":
        return "medias"
    if category == "pantaloneta":
        return "pantaloneta"
    return f"{category}_general"


def product_entry(
    odoo_id,
    name: str,
    price,
    *,
    is_published: bool = False,
    description_sale: str | None = None,
    commercial_role: str | None = None,
) -> dict:
    cat = normalize_category(name)
    var = extract_variant(name)
    mat = extract_material(name, var)
    fk = family_key(cat, name)
    meta = commercial_metadata(cat, name)
    if commercial_role:
        meta["commercial_role"] = commercial_role
        meta["min_qty_standalone"] = (
            UNIFORM_BASE_MIN_QTY if commercial_role == "base_uniform" else 1
        )
        meta["allow_without_base"] = commercial_role == "design"
    entry = {
        "odoo_id": odoo_id,
        "name": name.strip(),
        "category": cat,
        "variant": var,
        "material": mat,
        "list_price_cop": int(price or 0),
        "family_key": fk,
        "is_published": bool(is_published),
        "description_sale": (description_sale or "").strip() or None,
        **meta,
    }
    return entry


def build_families(products: list[dict]) -> dict:
    grouped = defaultdict(list)
    for p in products:
        grouped[p["family_key"]].append(p)
    families = {}
    for fk, members in grouped.items():
        members_sorted = sorted(members, key=lambda x: x["list_price_cop"])
        base = members_sorted[0]
        families[fk] = {
            "family_key": fk,
            "price_from_cop": base["list_price_cop"],
            "base_odoo_id": base["odoo_id"],
            "base_name": base["name"],
            "member_count": len(members),
            "members": [
                {
                    "odoo_id": m["odoo_id"],
                    "name": m["name"],
                    "list_price_cop": m["list_price_cop"],
                    "material": m["material"],
                    "variant": m["variant"],
                }
                for m in members_sorted
            ],
        }
    return families


def write_catalog_for_agent(path: Path, products: list[dict], families: dict, synced_at: str) -> None:
    published = [p for p in products if p.get("is_published")]
    with path.open("w", encoding="utf-8") as f:
        f.write("# Catálogo Life Deportes (precios para agente — lenguaje simple)\n\n")
        f.write(f"Actualizado: {synced_at}\n")
        f.write(f"- Productos vendibles: {len(products)}\n")
        f.write(f"- Publicados en tienda: {len(published)}\n\n")
        if published:
            f.write("## Productos publicados en tienda (prioridad ventas)\n\n")
            for p in sorted(published, key=lambda x: (x["category"], x["name"].lower())):
                role = p.get("commercial_role", "extra")
                role_label = {
                    "base_uniform": "base (mín. 6)",
                    "extra": "extra",
                    "design": "diseño",
                }.get(role, role)
                f.write(
                    f"- **{p['name']}** — ${p['list_price_cop']:,} [{role_label}]\n".replace(",", ".")
                )
                if p.get("description_sale"):
                    f.write(f"  - {p['description_sale']}\n")
            f.write("\n")
        f.write("## Familias frecuentes (precio desde)\n\n")
        priority = [
            "camiseta_manga_corta",
            "camiseta_manga_larga",
            "camiseta_polo",
            "uniforme_manga_corta",
            "uniforme_manga_larga",
            "uniforme_polo",
            "uniforme_dumonti",
            "pantaloneta",
            "medias",
        ]
        labels = {
            "camiseta_manga_corta": "Camiseta manga corta",
            "camiseta_manga_larga": "Camiseta manga larga",
            "camiseta_polo": "Camiseta cuello tipo polo",
            "uniforme_manga_corta": "Uniforme completo manga corta",
            "uniforme_manga_larga": "Uniforme completo manga larga",
            "uniforme_polo": "Uniforme completo cuello polo",
            "uniforme_dumonti": "Uniforme tela Dumonti",
            "pantaloneta": "Pantaloneta / short",
            "medias": "Medias",
        }
        for fk in priority:
            if fk not in families:
                continue
            fam = families[fk]
            label = labels.get(fk, fk)
            f.write(f"### {label} — desde ${fam['price_from_cop']:,}\n".replace(",", "."))
            for m in fam["members"][:8]:
                f.write(f"- {m['name']}: ${m['list_price_cop']:,}\n".replace(",", "."))
            f.write("\n")
        f.write("## Listado completo por tipo de prenda\n\n")
        by_cat = defaultdict(list)
        for p in sorted(products, key=lambda x: (x["category"], x["list_price_cop"])):
            by_cat[p["category"]].append(p)
        for cat in sorted(by_cat.keys()):
            f.write(f"### {cat}\n")
            for p in by_cat[cat]:
                f.write(f"- {p['name']}: ${p['list_price_cop']:,}\n".replace(",", "."))
            f.write("\n")


def embed_commercial_rules_in_functions(rules_path: Path, target_paths: list[Path]) -> None:
    if not rules_path.exists():
        return
    rules_source = rules_path.read_text(encoding="utf-8")
    start = "// <<COMMERCIAL_RULES_START>>"
    end = "// <<COMMERCIAL_RULES_END>>"
    replacement = f"{start}\n{rules_source}\n{end}"
    for target_path in target_paths:
        if not target_path.exists():
            continue
        text = target_path.read_text(encoding="utf-8")
        if start in text and end in text:
            text = re.sub(
                re.escape(start) + r"[\s\S]*?" + re.escape(end),
                replacement,
                text,
                count=1,
            )
        else:
            text = replacement + "\n\n" + text
        target_path.write_text(text, encoding="utf-8")


def embed_catalog_in_build_payload(catalog_path: Path, payload_path: Path) -> None:
    if not payload_path.exists():
        return
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    blob = json.dumps(catalog, ensure_ascii=False)
    text = payload_path.read_text(encoding="utf-8")
    start = "// <<CATALOG_CACHE_START>>"
    end = "// <<CATALOG_CACHE_END>>"
    replacement = f"{start}\nconst CATALOG_CACHE = {blob};\n{end}"
    if start in text and end in text:
        text = re.sub(
            re.escape(start) + r"[\s\S]*?" + re.escape(end),
            replacement,
            text,
            count=1,
        )
    else:
        text = replacement + "\n\n" + text
    payload_path.write_text(text, encoding="utf-8")


def odoo_client() -> tuple[xmlrpc.client.ServerProxy, int, str, str]:
    url = os.environ["ODOO_LIFEDEPORTES_URL"].rstrip("/")
    db = os.environ["ODOO_LIFEDEPORTES_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_USERNAME"]
    password = os.environ["ODOO_LIFEDEPORTES_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, password, {})
    if not uid:
        raise RuntimeError("Odoo authentication failed")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
    return models, uid, db, password


def export_from_odoo(out_dir: Path) -> list[dict]:
    models, uid, db, password = odoo_client()
    base_fields = ["id", "name", "list_price", "is_published", "description_sale"]
    optional_fields = ["x_ld_commercial_role"]
    fields = base_fields + optional_fields
    try:
        rows = models.execute_kw(
            db,
            uid,
            password,
            "product.template",
            "search_read",
            [[["sale_ok", "=", True]]],
            {"fields": fields, "limit": 500, "order": "name asc"},
        )
    except xmlrpc.client.Fault:
        rows = models.execute_kw(
            db,
            uid,
            password,
            "product.template",
            "search_read",
            [[["sale_ok", "=", True]]],
            {"fields": base_fields, "limit": 500, "order": "name asc"},
        )

    products = []
    grouped = defaultdict(list)
    for row in rows:
        name = row.get("name", "").strip()
        price = row.get("list_price", 0)
        entry = product_entry(
            row.get("id"),
            name,
            price,
            is_published=bool(row.get("is_published")),
            description_sale=row.get("description_sale"),
            commercial_role=row.get("x_ld_commercial_role") or None,
        )
        products.append(entry)
        cat = entry["category"]
        var = entry["variant"]
        grouped[(cat, var)].append((name, price, row.get("id")))

    csv_path = out_dir / "sellable_catalog_variants.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "odoo_id",
                "category",
                "variant",
                "material",
                "family_key",
                "commercial_role",
                "is_published",
                "product_name",
                "list_price",
                "description_sale",
            ]
        )
        for p in sorted(products, key=lambda x: (x["category"], x["name"].lower())):
            w.writerow(
                [
                    p["odoo_id"],
                    p["category"],
                    p["variant"],
                    p["material"],
                    p["family_key"],
                    p["commercial_role"],
                    int(bool(p.get("is_published"))),
                    p["name"],
                    p["list_price_cop"],
                    p.get("description_sale") or "",
                ]
            )

    md_path = out_dir / "sellable_catalog_summary.md"
    with md_path.open("w", encoding="utf-8") as f:
        f.write("# Catalogo vendible Life (producto primero, luego variante)\n\n")
        f.write(f"- Total productos consultados: {len(rows)}\n")
        f.write(f"- Total grupos categoria+variante: {len(grouped)}\n\n")
        for (cat, var), items in sorted(grouped.items()):
            f.write(f"## {cat} / {var}\n")
            for name, price, _pid in sorted(items, key=lambda x: x[0].lower())[:20]:
                f.write(f"- {name}: ${int(price or 0):,}\n".replace(",", "."))
            if len(items) > 20:
                f.write(f"- ... y {len(items) - 20} productos mas\n")
            f.write("\n")

    return products


def export_from_csv(csv_path: Path) -> list[dict]:
    products = []
    with csv_path.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get("product_name", "").strip()
            if not name:
                continue
            odoo_id = row.get("odoo_id") or None
            if odoo_id:
                try:
                    odoo_id = int(odoo_id)
                except ValueError:
                    odoo_id = None
            price = int(float(row.get("list_price") or 0))
            entry = product_entry(
                odoo_id,
                name,
                price,
                is_published=bool(int(row.get("is_published") or 0)),
                description_sale=row.get("description_sale") or None,
                commercial_role=row.get("commercial_role") or None,
            )
            if row.get("category"):
                entry["category"] = row["category"]
            if row.get("variant"):
                entry["variant"] = row["variant"]
            if row.get("material"):
                entry["material"] = row["material"]
            if row.get("family_key"):
                entry["family_key"] = row["family_key"]
            products.append(entry)
    return products


def main():
    out_dir = Path("kapso")
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "sellable_catalog_variants.csv"
    from_csv_only = "--from-csv" in sys.argv

    products = None
    export_source = "csv"
    if not from_csv_only:
        try:
            products = export_from_odoo(out_dir)
            export_source = "odoo"
            print(f"OK exported from Odoo ({len(products)} products)")
        except Exception as exc:
            print(f"WARN Odoo export failed ({exc}); using existing CSV")

    if products is None:
        if not csv_path.exists():
            raise SystemExit(f"No CSV at {csv_path}")
        products = export_from_csv(csv_path)
        print(f"OK loaded from CSV ({len(products)} products)")

    synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for p in products:
        members = [x for x in products if x["family_key"] == p["family_key"]]
        min_price = min(m["list_price_cop"] for m in members)
        p["is_base"] = p["list_price_cop"] == min_price

    families = build_families(products)
    published_count = sum(1 for p in products if p.get("is_published"))
    cache = {
        "schema_version": "catalog_cache_v3",
        "synced_at": synced_at,
        "source": export_source,
        "counts": {
            "sellable": len(products),
            "published": published_count,
        },
        "commercial_rules": {
            "uniform_base_min_qty": UNIFORM_BASE_MIN_QTY,
            "base_role": "base_uniform",
            "extra_roles": ["extra"],
            "design_role": "design",
        },
        "products": products,
        "families": families,
    }

    cache_path = out_dir / "catalog_cache.json"
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK {cache_path}")

    agent_md = out_dir / "catalog_for_agent.md"
    write_catalog_for_agent(agent_md, products, families, synced_at)
    print(f"OK {agent_md}")

    payload_path = out_dir / "functions" / "build_quote_payload.js"
    embed_catalog_in_build_payload(cache_path, payload_path)
    print(f"OK embedded catalog in {payload_path}")

    rules_path = out_dir / "functions" / "order_commercial_rules.js"
    odoo_fn_path = out_dir / "functions" / "odoo_create_lead_and_so.js"
    embed_commercial_rules_in_functions(rules_path, [payload_path, odoo_fn_path])
    print(f"OK embedded commercial rules in {payload_path}, {odoo_fn_path}")


if __name__ == "__main__":
    main()
