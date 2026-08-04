#!/usr/bin/env python3
"""Complete S02526 VALENTINA SILVA / Hub Ball from Kapso staff thread."""
import base64
import os
import xmlrpc.client
from pathlib import Path

ORDER_ID = 2524
LEAD_ID = 3394
LINE_DESIGN_ID = 6009
PRODUCT_UNIFORM_ID = 10219  # Uniforme de Fútbol dry-fit
DESIGN_PRODUCT_ID = 504

SCRATCH = Path(__file__).resolve().parent / "valentina_silva"
REF_IMAGE = SCRATCH / "referencia_diseno.jpeg"
LIST_IMAGE = SCRATCH / "lista.jpeg"

NOTE = """<h1>Pedido Hub Ball — VALENTINA SILVA</h1>

<h2>Resumen de uniformes</h2>
<ul>
  <li><strong>Hombre (7 u.):</strong> Uniforme completo de fútbol dry-fit, pantaloneta @ $50.000 COP c/u.</li>
  <li><strong>Mujer (6 u.):</strong> Uniforme completo dry-fit con short en lycra (corto, pegado) @ $55.000 COP c/u.</li>
  <li><strong>Diseño:</strong> Referencia estilo Wildcats → texto del equipo <strong>Hub Ball</strong>; dorsal con nombre de la persona y número atrás (ver imagen de referencia).</li>
</ul>

<hr>

<h2>Lista de jugadores (Hombre)</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:left; padding: 8px;">Manga</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="text-align:center; padding: 8px;">23</td><td style="padding: 8px;">Estiben</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">Manga larga</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">8</td><td style="padding: 8px;">Charli</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Manga sisa</td></tr>
    <tr><td style="text-align:center; padding: 8px;">2</td><td style="padding: 8px;">Juanse</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Manga sisa</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">22</td><td style="padding: 8px;">Leandro</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Manga sisa</td></tr>
    <tr><td style="text-align:center; padding: 8px;">18</td><td style="padding: 8px;">Willy</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">Manga sisa</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">19</td><td style="padding: 8px;">Javi</td><td style="text-align:center; padding: 8px;">XS</td><td style="padding: 8px;">Manga sisa</td></tr>
    <tr><td style="text-align:center; padding: 8px;">3</td><td style="padding: 8px;">Angelito</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Manga sisa</td></tr>
  </tbody>
</table>

<hr>

<h2>Lista de jugadoras (Mujer)</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:left; padding: 8px;">Manga</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="text-align:center; padding: 8px;">33</td><td style="padding: 8px;">Val</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">Manga normal</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">5</td><td style="padding: 8px;">Caro</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Manga normal</td></tr>
    <tr><td style="text-align:center; padding: 8px;">7</td><td style="padding: 8px;">MariaT</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">Manga normal</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">4</td><td style="padding: 8px;">May</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Manga normal</td></tr>
    <tr><td style="text-align:center; padding: 8px;">21</td><td style="padding: 8px;">Lorena</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">Manga normal</td></tr>
    <tr><td style="text-align:center; padding: 8px;">15</td><td style="padding: 8px;">Danna</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Manga normal</td></tr>
  </tbody>
</table>

<hr>

<h2>Referencias (Kapso / WhatsApp staff)</h2>
<ul>
  <li>referencia_diseno.jpeg — estilo Hub Ball (reemplaza Wildcats), nombre y número atrás</li>
  <li>lista.jpeg — lista original nombres, tallas, dorsales y manga</li>
</ul>

<p>Cliente: VALENTINA SILVA · Tel. 321 3799926 · Proyecto Paola · Ingreso staff Kapso.</p>
"""


def connect():
    url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"]
    db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
    pwd = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, pwd, {})
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
    return db, uid, pwd, models


def attach_file(models, db, uid, pwd, res_model, res_id, path: Path):
    data = base64.b64encode(path.read_bytes()).decode()
    att_id = models.execute_kw(
        db,
        uid,
        pwd,
        "ir.attachment",
        "create",
        [
            {
                "name": path.name,
                "type": "binary",
                "datas": data,
                "res_model": res_model,
                "res_id": res_id,
                "mimetype": "image/jpeg",
            }
        ],
    )
    return att_id


def main():
    db, uid, pwd, models = connect()

    # Fix design line ($0)
    models.execute_kw(
        db,
        uid,
        pwd,
        "sale.order.line",
        "write",
        [
            [LINE_DESIGN_ID],
            {
                "product_id": DESIGN_PRODUCT_ID,
                "name": "Diseño",
                "product_uom_qty": 1,
                "price_unit": 0,
            },
        ],
    )
    print("Fixed design line", LINE_DESIGN_ID)

    # Commercial lines
    line_male = models.execute_kw(
        db,
        uid,
        pwd,
        "sale.order.line",
        "create",
        [
            {
                "order_id": ORDER_ID,
                "product_id": PRODUCT_UNIFORM_ID,
                "name": "Uniforme de Fútbol dry-fit (hombre — pantaloneta)",
                "product_uom_qty": 7,
                "price_unit": 50000,
            }
        ],
    )
    line_female = models.execute_kw(
        db,
        uid,
        pwd,
        "sale.order.line",
        "create",
        [
            {
                "order_id": ORDER_ID,
                "product_id": PRODUCT_UNIFORM_ID,
                "name": "Uniforme de Fútbol dry-fit (mujer — lycra corta)",
                "product_uom_qty": 6,
                "price_unit": 55000,
            }
        ],
    )
    print("Created lines", line_male, line_female)

    models.execute_kw(db, uid, pwd, "sale.order", "write", [[ORDER_ID], {"note": NOTE}])
    models.execute_kw(db, uid, pwd, "crm.lead", "write", [[LEAD_ID], {"description": NOTE}])
    print("Updated SO note + lead description")

    # Attach reference images to SO (draft) for traceability
    for img in (REF_IMAGE, LIST_IMAGE):
        if img.exists():
            aid = attach_file(models, db, uid, pwd, "sale.order", ORDER_ID, img)
            print("Attached to SO:", img.name, aid)

    order = models.execute_kw(
        db,
        uid,
        pwd,
        "sale.order",
        "read",
        [[ORDER_ID]],
        {"fields": ["name", "state", "amount_untaxed", "amount_total", "order_line"]},
    )[0]
    lines = models.execute_kw(
        db,
        uid,
        pwd,
        "sale.order.line",
        "read",
        [order["order_line"]],
        {"fields": ["name", "product_uom_qty", "price_unit", "price_subtotal"]},
    )
    print(f"\n=== {order['name']} ({order['state']}) ===")
    print(f"Untaxed: ${order['amount_untaxed']:,.0f} | Total: ${order['amount_total']:,.0f}")
    for ln in lines:
        print(
            f"  - {ln['name']}: {ln['product_uom_qty']} x ${ln['price_unit']:,.0f} = ${ln['price_subtotal']:,.0f}"
        )
    print("\nTask sync + adjunto en tarea: ejecutar tras action_confirm (no hay tarea en borrador).")


if __name__ == "__main__":
    main()
