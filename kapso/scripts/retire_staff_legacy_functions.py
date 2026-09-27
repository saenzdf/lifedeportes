#!/usr/bin/env python3
"""
retire_staff_legacy_functions.py — archiva en el repo y borra en Kapso las functions
del carril staff legacy de Life Deportes (retiro 2026-09-16).

Contexto: el carril staff pasó a Hermes local (function `staff-hermes-forwarder` ->
webhook `staff-assistant`). Todo el toolset del agente staff embebido y las functions
de ruteo/nómina/inbox viejas quedaron sin uso.

Seguridad:
  1. Baja el código VIVO de cada function y lo guarda en `kapso/functions/_archive/<slug>.js`
     con cabecera (nombre, id, último deploy, fecha de archivo).
  2. Solo después borra en Kapso (DELETE).
  3. Refusa borrar si el nombre aparece cableado en el grafo vivo actual.

Uso:
  python3 kapso/scripts/retire_staff_legacy_functions.py --dry-run
  python3 kapso/scripts/retire_staff_legacy_functions.py --apply
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ARCHIVE = REPO / "kapso" / "functions" / "_archive"
WF_ID = "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6"

# Functions retiradas (nombre -> motivo)
RETIRE = {
    "route-staff-domain-guard": "ruteo del agente staff (nodo retirado)",
    "compile-staff-order-draft": "armado de borrador del agente staff (nodo retirado)",
    "validate-staff-write": "validación de subida legacy CONFIRMO SUBIR (camino retirado)",
    "route-staff-write": "decide de subida legacy (nodo retirado)",
    "build-quote-payload": "payload de presupuesto del agente staff (nodo retirado)",
    "odoo-create-lead-and-so": "subida CRM/SO legacy (ahora la hace Hermes)",
    "route-staff-lane-resume": "decide del carril staff legacy (nodo retirado)",
    "buscar-pedido-odoo": "tool del agente staff (Hermes usa MCP odoo-life-prod)",
    "corregir-pedido-odoo": "tool del agente staff (Hermes usa MCP odoo-life-prod)",
    "buscar-oportunidad-odoo": "tool del agente staff (Hermes usa MCP odoo-life-prod)",
    "buscar-conversacion-kapso": "tool del agente staff, sin cablear y sin uso",
    "clasificar-adjuntos-pedido": "tool del agente staff (Hermes + repo local)",
    "parsear-lista-excel-pedido": "tool del agente staff (Hermes + repo local)",
    "parsear-lista-texto-pedido": "tool del agente staff (Hermes + repo local)",
    "parsear-lista-imagen-pedido": "tool del agente staff (Hermes + repo local)",
    "parsear-lista-pdf-pedido": "tool del agente staff, sin uso (0 invocaciones)",
    "registrar-adjuntos-pedido": "tool del agente staff (Hermes + repo local)",
    "fusionar-borrador-lista": "tool del agente staff (Hermes + repo local)",
    "enviar-retomar-pedido": "tool del agente staff (SA 1553 usa odoo-send-wa-template)",
    "parse-nomina-attlog": "tool del agente staff (nómina fuera del carril staff)",
    "confirmar-nomina": "tool del agente staff, sin uso (0 invocaciones)",
    "crear-compra-odoo": "tool del agente staff, sin uso (0 invocaciones)",
    "sync-order-draft-from-odoo": "tool del agente staff",
    "prepare-inbox-upload": "cadena Jump/Inbox retirada",
    "staff-sales-notify-reply": "tool del agente staff, sin cablear (Hermes responde directo)",
    "get-service-status": "tool de ops retirado",
    "detect-staff-lane": "detección de carril staff legacy",
    "detect-staff-upload-command": "ya archivada localmente (graph-guard)",
    "route-staff-entry": "ya archivada localmente (graph-guard)",
    "route-staff-lane": "ruteo staff legacy",
    "route-staff-registration": "ya archivada localmente (graph-guard)",
    "route-nomina-confirm": "nómina legacy",
    "validate-nomina-confirm": "nómina legacy",
    "register-nomina-stub": "nómina legacy (stub)",
    "mark-maintenance-sent": "ruteo cliente legacy (marzo-julio)",
    "route-customer-entry": "ruteo cliente legacy sin cablear",
    "route-customer-paused": "ruteo cliente legacy sin cablear",
    "compute-fidelity-retention": "cadena Jump/Inbox retirada",
    "snapshot-upload-fidelity": "cadena Jump/Inbox retirada",
    "seed-crm-awaiting": "seed CRM legacy sin cablear",
}

# Functions del carril staff que se MANTIENEN a propósito (no tocar)
KEEP_NOTE = {
    "expire-stale-waiting": "la invoca el script externo expire_stale_waiting.sh",
    "morning-flush-staff-notifies": "flush 8am de avisos staff (caller externo desconocido)",
    "request-contact-info": "mecanismo BSUID/número privado (documentado activo)",
}


def env():
    out = subprocess.run(
        ["bash", "-lc", "cd %s && set -a; source .env; set +a; env | grep -E '^KAPSO_'" % REPO.parent],
        capture_output=True, text=True, check=True).stdout
    return dict(line.split("=", 1) for line in out.strip().splitlines())


def api(base, key, path, method="GET"):
    req = urllib.request.Request(f"{base.rstrip('/')}/platform/v1/{path}",
                                 headers={"X-API-Key": key, "User-Agent": "curl/8"}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(body) if body.strip().startswith(("{", "[")) else body)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    apply = "--apply" in sys.argv
    E = env()
    base, key = E["KAPSO_API_BASE_URL"], E["KAPSO_API_KEY"]

    # Grafo vivo: red de seguridad (no borrar nada cableado)
    _, g = api(base, key, f"workflows/{WF_ID}/definition")
    live = json.dumps(g, ensure_ascii=False)

    _, fns = api(base, key, "functions")
    by_name = {f["name"]: f for f in fns["data"]}
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    missing = [n for n in RETIRE if n not in by_name]
    if missing:
        print("AVISO: no existen en Kapso (ya borradas?):", missing)

    results = []
    for name, why in RETIRE.items():
        f = by_name.get(name)
        if not f:
            results.append((name, "no_existe", ""))
            continue
        # red de seguridad: nombre cableado en el grafo vivo
        if f'"{name}"' in live:
            results.append((name, "ABORTADO_cableado_en_grafo", f["id"]))
            continue
        status, detail = api(base, key, f"functions/{f['id']}")
        payload = (detail.get("data") if isinstance(detail, dict) else None) or detail
        code = payload.get("code", "") if isinstance(payload, dict) else ""
        slug = name.replace("-", "_")
        archive_file = ARCHIVE / f"{slug}.js"
        header = (f"// ARCHIVED {stamp} — retirada del carril Kapso (Life Deportes)\n"
                  f"// function: {name}  id: {f['id']}\n"
                  f"// ultimo deploy: {f.get('last_deployed_at')}  status: {f.get('status')}\n"
                  f"// motivo: {why}\n"
                  f"// Restaurar: recrear la function en Kapso con este código y volver a cablearla.\n\n")
        if apply:
            archive_file.write_text(header + code, encoding="utf-8")
            st, _ = api(base, key, f"functions/{f['id']}", method="DELETE")
            results.append((name, f"archivada+{st}", f["id"]))
        else:
            results.append((name, "dry-run", f"{f['id']} (~{len(code)} chars)"))

    print(json.dumps({"mode": "apply" if apply else "dry-run",
                      "archive_dir": str(ARCHIVE),
                      "retiradas": len(RETIRE),
                      "results": [{"fn": a, "accion": b, "detalle": c} for a, b, c in results],
                      "mantenidas": KEEP_NOTE}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
