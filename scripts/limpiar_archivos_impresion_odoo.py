#!/usr/bin/env python3
"""
limpiar_archivos_impresion_odoo.py — Limpieza de archivos de impresión PDF en Odoo Life Deportes.

Reglas de negocio:
1. Aplica EXCLUSIVAMENTE a tareas en etapa "Hecho" o "Cancelado" (stage_id o state=1_done/1_canceled).
2. NUNCA borra:
   - Archivos que no sean PDF (Excels, imágenes, etc.).
   - Listas en PDF (nombres con lista, listado, tallas, nombres, planilla, camscanner, etc.).
   - Referencias / Bocetos en PDF (nombres con referencia, boceto, diseno, mockup, logo, escudo, etc.).
3. Borra:
   - PDFs de más de 15 MB con más de 4 meses de antigüedad (salvo listas/referencias protegidas).
   - PDFs de órdenes de trabajo / maquetas de impresión (ORDEN DE TRABAJO, despieces CAM, PANT, etc.) en Hecho/Cancelado.
   - PDFs de documentos del sistema (Pedido - S*, liquidaciones, facturas en tareas finalizadas).

Modo por defecto: --dry-run (no borra nada, solo reporta).
Para ejecutar: --apply (requiere confirmación o flag explícito).
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import sys
import unicodedata
from urllib.request import Request, urlopen

PROTECTED_TERMS = [
    "lista", "listado", "talla", "tallas", "nombre", "nombres", "planilla",
    "camscanner", "formulario", "pedido de", "relacion", "cuadro",
    "referencia", "boceto", "diseno", "mockup", "logo", "escudo",
    "muestra", "paleta", "pantone"
]

SYSTEM_DOC_TERMS = [
    "pedido - s", "presupuesto", "cotizacion", "factura", "liquidacion", "recibo"
]

PRINT_PATTERNS = [
    r"orden\s*(de\s*)?trabajo",
    r"\bot\b",
    r"\bcam(\.|\b)",
    r"\bpant(\.|\b)",
    r"\bbermuda(\.|\b)",
    r"\bpolo(\.|\b)",
    r"\blycra(\.|\b)",
    r"\bmangas(\.|\b)",
    r"\bparte\s*\d+",
]


def load_env() -> dict[str, str]:
    """Carga credenciales desde .env buscando en lifedeportes o raíz Sync."""
    paths = [
        Path(__file__).resolve().parent.parent / ".env",
        Path(__file__).resolve().parents[3] / ".env",
    ]
    env = {}
    for p in paths:
        if p.is_file():
            for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip("\"'")
    return env


def odoo_rpc(url: str, service: str, method: str, args: list) -> any:
    endpoint = url.rstrip("/") + "/jsonrpc"
    payload = json.dumps({
        "jsonrpc": "2.0",
        "method": "call",
        "params": {"service": service, "method": method, "args": args}
    }).encode("utf-8")
    req = Request(endpoint, data=payload, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=60) as resp:
        res = json.loads(resp.read().decode("utf-8", errors="replace"))
    if res.get("error"):
        raise RuntimeError(f"Odoo Error: {res['error']}")
    return res["result"]


def normalize_str(s: str) -> str:
    if not s:
        return ""
    normalized = unicodedata.normalize("NFKD", s).encode("ASCII", "ignore").decode("utf-8")
    return normalized.lower().strip()


def classify_attachment(
    att: dict,
    threshold_date_str: str,
    limit_size_bytes: int
) -> tuple[str, str]:
    """
    Retorna (categoria, razon).
    Categorias posibles:
      - 'PROTECTED_NON_PDF'
      - 'PROTECTED_LIST_OR_REF'
      - 'DELETE_BIG_OLD'
      - 'DELETE_PRINT_PDF'
      - 'DELETE_SYSTEM_DOC'
      - 'UNCLASSIFIED_KEEP'
    """
    name = att.get("name") or ""
    mimetype = att.get("mimetype") or ""
    size = att.get("file_size") or 0
    cdate = att.get("create_date") or ""

    # 1. Validar si es PDF
    if mimetype != "application/pdf" and not name.lower().endswith(".pdf"):
        return "PROTECTED_NON_PDF", "No es PDF (Excel, imagen o documento protegido)"

    norm = normalize_str(name)

    # 2. Verificar lista o referencia protegida
    for term in PROTECTED_TERMS:
        if term in norm:
            return "PROTECTED_LIST_OR_REF", f"Contiene término de lista/referencia protegido: '{term}'"

    # 3. Regla rápida: > 15MB y más de 4 meses de antigüedad
    if size > limit_size_bytes and cdate < threshold_date_str:
        mb = round(size / (1024 * 1024), 2)
        return "DELETE_BIG_OLD", f"PDF de {mb} MB (>15 MB) y antigüedad >4 meses ({cdate[:10]})"

    # 4. Documento de sistema en tarea finalizada
    for term in SYSTEM_DOC_TERMS:
        if term in norm:
            return "DELETE_SYSTEM_DOC", f"Documento de sistema en tarea finalizada: '{term}'"

    # 5. Archivo de impresión por patrón
    for pat in PRINT_PATTERNS:
        if re.search(pat, norm):
            return "DELETE_PRINT_PDF", f"Coincide con patrón de impresión: '{pat}'"

    # 6. No clasificado como borrado -> Se conserva por precaución
    return "UNCLASSIFIED_KEEP", "No coincide con criterios de borrado (se conserva por precaución)"


def main() -> int:
    parser = argparse.ArgumentParser(description="Limpieza de archivos de impresión PDF en Odoo Life Deportes.")
    parser.add_argument("--dry-run", action="store_true", default=False, help="Modo simulación")
    parser.add_argument("--apply", action="store_true", help="Ejecutar eliminación real en la base de datos")
    parser.add_argument("--task-id", type=int, help="Filtrar por una tarea específica")
    parser.add_argument("--min-age-months", type=int, default=4, help="Meses mínimos de antigüedad (default: 4)")
    parser.add_argument("--max-size-mb", type=float, default=15.0, help="Tamaño en MB para borrado directo (default: 15.0)")
    parser.add_argument("--limit", type=int, default=0, help="Límite máximo de adjuntos a procesar (0 = sin límite)")
    parser.add_argument("--batch-size", type=int, default=50, help="Tamaño de lote para borrado (default: 50)")

    args = parser.parse_args()
    # Si no se especifica --apply, por seguridad se corre en dry-run
    is_dry_run = not args.apply

    env = load_env()
    url = env.get("ODOO_LIFEDEPORTES_PROD_URL") or env.get("ODOO_URL")
    db = env.get("ODOO_LIFEDEPORTES_PROD_DB") or env.get("ODOO_DB")
    user = env.get("ODOO_LIFEDEPORTES_PROD_USERNAME") or env.get("ODOO_USERNAME")
    pwd = env.get("ODOO_LIFEDEPORTES_PROD_PASSWORD") or env.get("ODOO_PASSWORD")

    if not all([url, db, user, pwd]):
        sys.exit("❌ Error: Faltan credenciales Odoo en .env (ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD)")

    print(f"🔌 Conectando a Odoo: {url} (DB: {db})...")
    uid = odoo_rpc(url, "common", "authenticate", [db, user, pwd, {}])
    if not uid:
        sys.exit("❌ Error de autenticación en Odoo")
    print(f"✅ Autenticado como UID {uid}")

    # Calcular fecha umbral
    now = datetime.now(timezone.utc)
    threshold_dt = now - timedelta(days=args.min_age_months * 30)
    threshold_str = threshold_dt.strftime("%Y-%m-%d %H:%M:%S")
    limit_bytes = int(args.max_size_mb * 1024 * 1024)

    print(f"\n⚙️  Configuración de limpieza:")
    print(f"   • Modo: {'🧪 SIMULACIÓN (DRY-RUN)' if is_dry_run else '🚨 EJECUCIÓN REAL (--apply)'}")
    print(f"   • Antigüedad mínima para archivos grandes: {args.min_age_months} meses (antes de {threshold_str[:10]})")
    print(f"   • Umbral archivo grande: > {args.max_size_mb} MB")
    print(f"   • Alcance de etapas: EXCLUSIVAMENTE 'Hecho' o 'Cancelado'")

    # 1. Obtener IDs de tareas en Hecho o Cancelado
    if args.task_id:
        task_info = odoo_rpc(url, "object", "execute_kw", [db, uid, pwd, "project.task", "read", [[args.task_id]], {"fields": ["id", "name", "stage_id", "state"]}])
        if not task_info:
            sys.exit(f"❌ Tarea {args.task_id} no encontrada.")
        stage_name = task_info[0].get("stage_id", [0, ""])[1]
        state = task_info[0].get("state")
        is_done = ("hecho" in stage_name.lower() or "cancel" in stage_name.lower() or state in ["1_done", "1_canceled"])
        if not is_done:
            sys.exit(f"❌ La tarea {args.task_id} está en etapa '{stage_name}' (state={state}). Solo se permiten tareas en Hecho o Cancelado.")
        target_task_ids = [args.task_id]
        print(f"🎯 Evaluando tarea específica: {args.task_id} ('{task_info[0].get('name')}')")
    else:
        print("\n🔍 Buscando tareas en etapa 'Hecho' o 'Cancelado'...")
        task_domain = [
            "|",
            ["stage_id.name", "in", ["Hecho", "Cancelado"]],
            ["state", "in", ["1_done", "1_canceled"]]
        ]
        target_task_ids = odoo_rpc(url, "object", "execute_kw", [db, uid, pwd, "project.task", "search", [task_domain]])
        print(f"📋 Encontradas {len(target_task_ids)} tareas finalizadas o canceladas.")

    if not target_task_ids:
        print("ℹ️  No hay tareas para evaluar.")
        return 0

    # 2. Buscar adjuntos en estas tareas
    print("\n🔍 Consultando adjuntos en las tareas seleccionadas...")
    att_domain = [
        ["res_model", "=", "project.task"],
        ["res_id", "in", target_task_ids]
    ]
    read_kwargs = {
        "fields": ["id", "name", "mimetype", "file_size", "create_date", "res_id"],
        "order": "file_size desc, id desc"
    }
    if args.limit > 0:
        read_kwargs["limit"] = args.limit

    attachments = odoo_rpc(url, "object", "execute_kw", [db, uid, pwd, "ir.attachment", "search_read", [att_domain], read_kwargs])
    print(f"📦 Total adjuntos encontrados: {len(attachments)}")

    # 3. Clasificar cada adjunto
    deletions = []
    protected = []
    unclassified = []

    category_counts = {
        "PROTECTED_NON_PDF": 0,
        "PROTECTED_LIST_OR_REF": 0,
        "DELETE_BIG_OLD": 0,
        "DELETE_PRINT_PDF": 0,
        "DELETE_SYSTEM_DOC": 0,
        "UNCLASSIFIED_KEEP": 0,
    }
    bytes_to_delete = 0

    for att in attachments:
        cat, reason = classify_attachment(att, threshold_str, limit_bytes)
        category_counts[cat] += 1
        att_entry = {
            "id": att["id"],
            "name": att.get("name") or "",
            "size": att.get("file_size") or 0,
            "size_mb": round((att.get("file_size") or 0) / (1024 * 1024), 2),
            "create_date": att.get("create_date") or "",
            "task_id": att.get("res_id"),
            "category": cat,
            "reason": reason
        }

        if cat in ["DELETE_BIG_OLD", "DELETE_PRINT_PDF", "DELETE_SYSTEM_DOC"]:
            deletions.append(att_entry)
            bytes_to_delete += att_entry["size"]
        elif cat in ["PROTECTED_NON_PDF", "PROTECTED_LIST_OR_REF"]:
            protected.append(att_entry)
        else:
            unclassified.append(att_entry)

    mb_to_delete = round(bytes_to_delete / (1024 * 1024), 2)
    gb_to_delete = round(bytes_to_delete / (1024 * 1024 * 1024), 2)

    print("\n" + "=" * 60)
    print("📊 RESUMEN DE CLASIFICACIÓN")
    print("=" * 60)
    print(f"  🟢 Excels / Imágenes / Otros no-PDF (Protegidos) : {category_counts['PROTECTED_NON_PDF']}")
    print(f"  🟢 Listas y Referencias en PDF (Protegidos)       : {category_counts['PROTECTED_LIST_OR_REF']}")
    print(f"  ⚪ PDFs conservados por precaución                : {category_counts['UNCLASSIFIED_KEEP']}")
    print(f"  🔴 PDFs pesados (>15 MB y >4 meses) a eliminar    : {category_counts['DELETE_BIG_OLD']}")
    print(f"  🔴 PDFs de maquetas / impresión a eliminar        : {category_counts['DELETE_PRINT_PDF']}")
    print(f"  🔴 PDFs de documentos de sistema a eliminar       : {category_counts['DELETE_SYSTEM_DOC']}")
    print("-" * 60)
    print(f"  🗑️  TOTAL ARCHIVOS A ELIMINAR                     : {len(deletions)}")
    print(f"  💾 ESPACIO A LIBERAR                             : {gb_to_delete} GB ({mb_to_delete:,.2f} MB)")
    print("=" * 60)

    # Mostrar muestra de eliminaciones
    if deletions:
        print("\n🔎 Muestra de archivos a eliminar (primeros 15):")
        for d in deletions[:15]:
            print(f"  • ID {d['id']:<6} | {d['size_mb']:>6.2f} MB | Tarea {d['task_id']:<5} | [{d['category']}] {d['name']}")
        if len(deletions) > 15:
            print(f"    ... y {len(deletions) - 15} archivos más.")

    # Guardar manifiesto de auditoría en scratch
    scratch_dir = Path("/Users/diego/Documents/Sync/scratch")
    scratch_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = scratch_dir / f"odoo_pdf_cleanup_manifest_{now.strftime('%Y%m%d_%H%M%S')}.json"
    
    manifest_data = {
        "timestamp": now.isoformat(),
        "mode": "dry-run" if is_dry_run else "apply",
        "min_age_months": args.min_age_months,
        "max_size_mb": args.max_size_mb,
        "bytes_to_delete": bytes_to_delete,
        "gb_to_delete": gb_to_delete,
        "counts": category_counts,
        "deletions": deletions,
    }
    manifest_path.write_text(json.dumps(manifest_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n📄 Manifiesto completo guardado en:\n   {manifest_path}")

    # 4. Ejecución del borrado si se especificó --apply
    if is_dry_run:
        print("\n💡 Para proceder con la eliminación real, ejecuta el script agregando el flag:")
        print("   python3 projects/lifedeportes/scripts/limpiar_archivos_impresion_odoo.py --apply")
        return 0

    if not deletions:
        print("\nℹ️  No hay archivos candidatos para eliminar.")
        return 0

    print(f"\n🚨 INICIANDO ELIMINACIÓN DE {len(deletions)} ARCHIVOS ({gb_to_delete} GB)...")
    ids_to_unlink = [d["id"] for d in deletions]
    total_unlinked = 0

    for i in range(0, len(ids_to_unlink), args.batch_size):
        batch = ids_to_unlink[i : i + args.batch_size]
        print(f"   🗑️  Eliminando lote {i + 1} a {min(i + len(batch), len(ids_to_unlink))} de {len(ids_to_unlink)}...")
        try:
            odoo_rpc(url, "object", "execute_kw", [db, uid, pwd, "ir.attachment", "unlink", [batch]])
            total_unlinked += len(batch)
        except Exception as e:
            print(f"❌ Error al eliminar lote {batch}: {e}")
            break

    print(f"\n✅ Proceso finalizado. Total adjuntos eliminados: {total_unlinked} / {len(ids_to_unlink)}.")
    print(f"🎉 Espacio liberado estimado: ~{gb_to_delete} GB.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
