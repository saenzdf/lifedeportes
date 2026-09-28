#!/usr/bin/env python3
"""Barrido automático de oportunidades inactivas en Odoo CRM (+7 días sin respuesta).

Marca oportunidades de preventa (Asistente Kapso, Proposition, etc.) como Perdidas:
  - active = False
  - stage_id = 5 (Perdida)
  - probability = 0.0
  - lost_reason_id = ID de 'Sin respuesta del cliente (+7 días)'
  - Nota en Chatter

Reglas de seguridad estrictas:
  - NUNCA tocar la etapa 'Pasa a diseño' (ID 4 / is_won = True).
  - NUNCA tocar oportunidades con órdenes de venta confirmadas (sale, done).

Uso:
  python scripts/sweep_inactive_crm_leads.py --dry-run
  python scripts/sweep_inactive_crm_leads.py --live
  python scripts/sweep_inactive_crm_leads.py --install-cron
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
import os
import sys
import xmlrpc.client
from pathlib import Path

ENV_PATHS = [
    Path(__file__).resolve().parent.parent / ".env",
    Path(__file__).resolve().parents[2] / ".env",
]

STAGE_DESIGN_ID = 4
STAGE_LOST_ID = 5
LOST_REASON_NAME = "Sin respuesta del cliente (+7 días)"
CRON_NAME = "CRM: Marcar leads inactivos (+7 días) como Perdida"

CRON_PYTHON_CODE = """
STAGE_DESIGN = 4
STAGE_LOST = 5
REASON_NAME = 'Sin respuesta del cliente (+7 días)'

# 1. Obtener o crear razón de pérdida
Reason = env['crm.lost.reason'].sudo()
reason = Reason.search([('name', '=', REASON_NAME)], limit=1)
if not reason:
    reason = Reason.create({'name': REASON_NAME})

# 2. Calcular corte de inactividad (7 días)
cutoff = (datetime.datetime.now() - datetime.timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')

# 3. Buscar leads candidatos activos en preventa
domain = [
    ('active', '=', True),
    ('stage_id', '!=', STAGE_DESIGN),
    ('write_date', '<', cutoff),
]
candidates = env['crm.lead'].search(domain)

count = 0
for lead in candidates:
    # Seguridad: no tocar etapas ganadas
    if lead.stage_id and lead.stage_id.is_won:
        continue
    # Seguridad: no tocar si tiene pedidos de venta confirmados
    if any(order.state in ('sale', 'done') for order in lead.order_ids):
        continue

    lead.write({
        'active': False,
        'stage_id': STAGE_LOST,
        'probability': 0.0,
        'lost_reason_id': reason.id,
    })
    lead.message_post(
        body='Oportunidad marcada automáticamente como perdida por inactividad (+7 días sin respuesta del cliente).',
        subtype_xmlid='mail.mt_note'
    )
    count += 1

log('Barrido CRM completado: %d oportunidades marcadas como perdidas.' % count)
""".strip()


def load_env() -> None:
    for env_file in ENV_PATHS:
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def get_client() -> dict:
    load_env()
    url = os.environ.get("ODOO_LIFEDEPORTES_PROD_URL", os.environ.get("ODOO_LIFEDEPORTES_URL", "")).rstrip("/")
    db = os.environ.get("ODOO_LIFEDEPORTES_PROD_DB", os.environ.get("ODOO_LIFEDEPORTES_DB", ""))
    user = os.environ.get("ODOO_LIFEDEPORTES_PROD_USERNAME", os.environ.get("ODOO_LIFEDEPORTES_USERNAME", ""))
    pwd = os.environ.get("ODOO_LIFEDEPORTES_PROD_PASSWORD", os.environ.get("ODOO_LIFEDEPORTES_PASSWORD", ""))

    if not all([url, db, user, pwd]):
        raise RuntimeError("Faltan credenciales Odoo en variables de entorno / .env")

    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", allow_none=True)
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True)
    uid = common.authenticate(db, user, pwd, {})
    if not uid:
        raise RuntimeError(f"Autenticación fallida con Odoo ({url}, db={db})")

    return {"db": db, "uid": uid, "pwd": pwd, "models": models, "url": url}


def kw(c: dict, model: str, method: str, *args, **kwargs):
    return c["models"].execute_kw(
        c["db"], c["uid"], c["pwd"], model, method, list(args), kwargs or {}
    )


def ensure_lost_reason(c: dict, name: str = LOST_REASON_NAME) -> int:
    reasons = kw(c, "crm.lost.reason", "search_read", [("name", "=", name)], fields=["id", "name"])
    if reasons:
        return reasons[0]["id"]
    created_id = kw(c, "crm.lost.reason", "create", [{"name": name}])
    if isinstance(created_id, list):
        return created_id[0]
    return created_id


def find_candidate_leads(c: dict, days: int = 7) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    domain = [
        ("active", "=", True),
        ("stage_id", "!=", STAGE_DESIGN_ID),
        ("write_date", "<", cutoff),
    ]

    leads = kw(
        c,
        "crm.lead",
        "search_read",
        domain,
        fields=["id", "name", "stage_id", "write_date", "order_ids", "partner_id", "probability", "priority"],
        order="write_date asc"
    )

    valid_candidates = []
    for lead in leads:
        stage_id = lead["stage_id"][0] if lead["stage_id"] else False
        # Verificar si la etapa es won
        if stage_id:
            stage_info = kw(c, "crm.stage", "read", [stage_id], fields=["is_won"])
            if stage_info and stage_info[0].get("is_won"):
                continue

        # Verificar si tiene pedidos en 'sale' o 'done'
        if lead["order_ids"]:
            orders = kw(c, "sale.order", "read", lead["order_ids"], fields=["id", "name", "state"])
            if any(o["state"] in ("sale", "done") for o in orders):
                continue

        valid_candidates.append(lead)

    return valid_candidates


def execute_sweep(c: dict, leads: list[dict], reason_id: int) -> int:
    success_count = 0
    note_body = "Oportunidad marcada automáticamente como perdida por inactividad (+7 días sin respuesta del cliente)."

    for lead in leads:
        lead_id = lead["id"]
        # 1. Modificar valores
        kw(c, "crm.lead", "write", [lead_id], {
            "active": False,
            "stage_id": STAGE_LOST_ID,
            "probability": 0.0,
            "lost_reason_id": reason_id,
        })
        # 2. Registrar nota en chatter
        try:
            kw(c, "crm.lead", "message_post", [lead_id], {
                "body": note_body,
                "subtype_xmlid": "mail.mt_note",
            })
        except Exception as e:
            print(f"  [WARN] No se pudo postear nota en lead {lead_id}: {e}")

        success_count += 1
        stage_name = lead["stage_id"][1] if lead["stage_id"] else "Sin etapa"
        print(f"  ✓ Lead #{lead_id} ('{lead['name']}') [{stage_name}] -> Perdida (Archivada)")

    return success_count


def upsert_cron(c: dict) -> dict:
    models = kw(c, "ir.model", "search_read", [("model", "=", "crm.lead")], fields=["id"])
    if not models:
        raise RuntimeError("No se encontró el modelo crm.lead en ir.model")
    model_id = models[0]["id"]

    cron_ids = kw(c, "ir.cron", "search", [("name", "=", CRON_NAME)])

    # Programar para las 07:00 UTC (02:00 AM Colombia) de mañana
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).replace(
        hour=7, minute=0, second=0, microsecond=0
    ).strftime("%Y-%m-%d %H:%M:%S")

    cron_vals = {
        "name": CRON_NAME,
        "model_id": model_id,
        "state": "code",
        "code": CRON_PYTHON_CODE,
        "user_id": 1,  # OdooBot
        "interval_number": 1,
        "interval_type": "days",
        "active": True,
        "nextcall": tomorrow,
        "priority": 5,
    }

    if cron_ids:
        kw(c, "ir.cron", "write", cron_ids, cron_vals)
        return {"id": cron_ids[0], "action": "updated", "name": CRON_NAME, "nextcall": tomorrow}

    created = kw(c, "ir.cron", "create", [cron_vals])
    cron_id = created[0] if isinstance(created, list) else created
    return {"id": cron_id, "action": "created", "name": CRON_NAME, "nextcall": tomorrow}


def main():
    parser = argparse.ArgumentParser(description="Barrido de oportunidades inactivas (+7 días) en Odoo CRM")
    parser.add_argument("--dry-run", action="store_true", help="Simular sin modificar datos en Odoo")
    parser.add_argument("--live", action="store_true", help="Aplicar cambios reales en la base de datos")
    parser.add_argument("--install-cron", action="store_true", help="Instalar o actualizar la acción programada diaria en Odoo")
    parser.add_argument("--days", type=int, default=7, help="Días de inactividad mínima (default: 7)")
    args = parser.parse_args()

    if not (args.dry_run or args.live or args.install_cron):
        parser.print_help()
        sys.exit(1)

    print(f"Conectando a Odoo Life Deportes...")
    c = get_client()
    print(f"Conexión exitosa a {c['url']} (db: {c['db']})")

    # 1. Asegurar razón de pérdida
    reason_id = ensure_lost_reason(c, LOST_REASON_NAME)
    print(f"Razón de pérdida '{LOST_REASON_NAME}' disponible con ID {reason_id}")

    # 2. Instalar cron si fue solicitado
    if args.install_cron:
        print("\nConfigurando Acción Programada (ir.cron)...")
        cron_info = upsert_cron(c)
        print(f"  ✓ Acción programada {cron_info['action']} con éxito (ID: {cron_info['id']})")
        print(f"    Nombre: {cron_info['name']}")
        print(f"    Próxima ejecución: {cron_info['nextcall']} UTC (02:00 AM COT)")

    # 3. Buscar candidatos para el barrido
    if args.dry_run or args.live:
        print(f"\nBuscando oportunidades inactivas con más de {args.days} días sin actividad...")
        leads = find_candidate_leads(c, days=args.days)
        print(f"Total oportunidades candidatas detectadas: {len(leads)}")

        if not leads:
            print("No hay oportunidades inactivas para procesar.")
            return

        print("\nDetalle de candidatos:")
        print(f"{'ID':<6} | {'Etapa':<18} | {'Última modif.':<20} | {'Nombre'}")
        print("-" * 75)
        for l in leads:
            stage_name = l["stage_id"][1] if l["stage_id"] else "Sin etapa"
            print(f"{l['id']:<6} | {stage_name:<18} | {l['write_date']:<20} | {l['name']}")

        if args.dry_run:
            print("\n[DRY-RUN] Modo simulación completado. No se modificó ningún registro.")
            print("Para aplicar los cambios en Odoo, ejecuta con el flag --live")

        elif args.live:
            print(f"\n[LIVE] Ejecutando barrido de {len(leads)} oportunidades...")
            swept = execute_sweep(c, leads, reason_id)
            print(f"\n✓ Barrido completado: {swept} oportunidades marcadas como Perdida (active=False).")


if __name__ == "__main__":
    main()
