#!/usr/bin/env python3
"""Finish Fredy Bram / CHAMEZA: CRM brief, design notes, attachments on task."""
from __future__ import annotations

import base64
import json
import os
import urllib.request
import xmlrpc.client
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
for line in (ROOT / ".env").read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, _, v = line.partition("=")
    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
pwd = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", allow_none=True)
uid = common.authenticate(db, user, pwd, {})
models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True)


def call(model, method, *args, **kwargs):
    return models.execute_kw(db, uid, pwd, model, method, list(args), kwargs or {})


ORDER_ID = 2787
TASK_ID = 2564
LEAD_ID = 3576
PROJ = "b470d474-6a7a-4d84-a214-6cd4b198b4f3"
FOLDER = ROOT / "scratch" / "fredy_bram_2026-07-27"

so = call(
    "sale.order",
    "read",
    [ORDER_ID],
    fields=["note", "x_studio_nombre_del_pedido"],
)[0]
note = so.get("note") or ""

design = """
<p><b>Notas de diseño (staff 2026-07-27):</b></p>
<ul>
<li>Colores: verde militar / aceituna con blanco y rojo.</li>
<li>Sudadera: bota recta; <b>todos los pantalones de sudadera en tela Loto</b>.</li>
<li>Incluye escudo y bandera (refs en adjuntos).</li>
<li>Refs visuales: UNIFORME CHAMEZA DISCAPACIDAD + fotos de cómo debe quedar.</li>
</ul>
""".strip()

if "Notas de diseño" not in note:
    new_note = design + "\n" + note
    call(
        "sale.order",
        "write",
        [ORDER_ID],
        {
            "note": new_note,
            "x_studio_nombre_del_pedido": "CHAMEZA DISCAPACIDAD",
        },
    )
    call("project.task", "write", [TASK_ID], {"description": new_note})
    print("design notes written")
else:
    call(
        "sale.order",
        "write",
        [ORDER_ID],
        {"x_studio_nombre_del_pedido": "CHAMEZA DISCAPACIDAD"},
    )
    print("nombre only")

# Find customer Kapso conversation by phone
key = os.environ["KAPSO_API_KEY"]
conv_id = None
for q in ("573132954709", "3132954709", "FREDY"):
    req = urllib.request.Request(
        f"https://api.kapso.ai/platform/v1/whatsapp/conversations?q={q}&limit=20",
        headers={"X-API-Key": key, "User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = json.loads(resp.read().decode()).get("data") or []
    for c in rows:
        phone = str(c.get("phone_number") or "")
        name = str(c.get("contact_name") or "")
        if "3132954709" in phone or "FREDY" in name.upper() or "BRAM" in name.upper():
            conv_id = c["id"]
            print("found conv", conv_id, phone, name)
            break
    if conv_id:
        break

# Fallback: staff thread where the dump arrived
staff_conv = "d2af64e3-d7df-4ed0-8ca2-8c2ed0785d38"
link_id = conv_id or staff_conv
kapso_link = f"https://inbox.kapso.ai/projects/{PROJ}?conversation_id={link_id}"
link_label = "Abrir chat en Kapso" if conv_id else "Abrir hilo staff (retoma) en Kapso"

desc = "\n".join(
    [
        "<p><b>Conversación:</b> 2026-07-27</p>",
        f'<p><a href="{kapso_link}" target="_blank" rel="noopener noreferrer"><b>{link_label}</b></a></p>',
        "<p><b>Pedido:</b> 7 × uniforme fútbol + 7 × pantalón sudadera (Loto, bota recta).</p>",
        "<p>Equipo <b>CHAMEZA DISCAPACIDAD</b>. Colores verde militar/aceituna + blanco y rojo. Escudo y bandera.</p>",
        "<p><b>Estado:</b> SO S02789 confirmado · tarea Coordinación Diseño · lista Excel cargada.</p>",
        f"<!-- kapso:conv={link_id} phone=573132954709 source=staff_retoma_fredy_bram -->",
    ]
)
call(
    "crm.lead",
    "write",
    [LEAD_ID],
    {
        "name": "CHAMEZA DISCAPACIDAD",
        "description": desc,
        "expected_revenue": 665000.0,
    },
)
print("lead updated", LEAD_ID)

files = [
    "UNIFORME CHAMEZA DISCAPACIDAD.png",
    "FORMATO PEDIDO LIFE 1.xlsx",
    "img_1514555476602445.jpg",
    "img_4167065253429439.jpg",
    "img_2492798031222584.jpg",
    "img_2048877359351931.jpg",
    "img_1118567727663659.jpg",
    "img_889238387592840.jpg",
    "img_2026473318238401.jpg",
]
created = []
for name in files:
    p = FOLDER / name
    if not p.exists():
        continue
    exist = call(
        "ir.attachment",
        "search",
        [
            ("res_model", "=", "project.task"),
            ("res_id", "=", TASK_ID),
            ("name", "=", name),
        ],
        limit=1,
    )
    if exist:
        print("skip", name)
        continue
    if name.endswith(".xlsx"):
        mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif name.endswith(".png"):
        mime = "image/png"
    else:
        mime = "image/jpeg"
    att_id = call(
        "ir.attachment",
        "create",
        [
            {
                "name": name,
                "res_model": "project.task",
                "res_id": TASK_ID,
                "type": "binary",
                "mimetype": mime,
                "datas": base64.b64encode(p.read_bytes()).decode(),
            }
        ],
    )
    created.append(att_id)
    print("att", name, att_id)

print("attachments_created", len(created))
print(
    json.dumps(
        {
            "lead": f"{url}/odoo/crm/{LEAD_ID}",
            "so": f"{url}/odoo/sales/{ORDER_ID}",
            "task": f"{url}/odoo/project/{TASK_ID}",
            "kapso": kapso_link,
        },
        indent=2,
    )
)
