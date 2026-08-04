#!/usr/bin/env python3
"""Fix S02526: voleibol variants (not fútbol). Licra only exists on template 31."""
import os
import xmlrpc.client

ORDER_ID = 2524
LEAD_ID = 3394
TASK_ID = 2326
LINES_DELETE = [6013, 6014]
LINE_DESIGN_ID = 6009

# Uniforme de voleibol (template 31) — variantes Odoo reales
V_MASC_SISA_PANT_V = 11139   # Pantaloneta, Cuello en V, Siza
V_FEM_LICRA_CHINA_V = 11144  # Licra, Cuello en V, China

NOTE = """<h1>Pedido Hub Ball — VALENTINA SILVA (voleibol)</h1>

<h2>Resumen de uniformes</h2>
<ul>
  <li><strong>Deporte:</strong> Voleibol (template Odoo 31 — <em>no</em> fútbol).</li>
  <li><strong>Hombre (6 u. confirmadas en Odoo):</strong> Uniforme de voleibol · pantaloneta · manga sisa → variante <strong>11139</strong> (Pantaloneta, Cuello en V, Siza) @ $50.000 c/u.</li>
  <li><strong>Mujer (6 u.):</strong> Uniforme de voleibol · licra · manga normal/china → variante <strong>11144</strong> (Licra, Cuello en V, China) @ $50.000 c/u.</li>
  <li><strong>Diseño:</strong> Referencia estilo Wildcats → texto <strong>Hub Ball</strong>; dorsal con nombre y número atrás.</li>
</ul>

<p><strong>Nota comercial:</strong> En fútbol (template 115) <em>no existe</em> variante con licra; la licra es atributo solo del uniforme de voleibol.</p>

<hr>

<h2>Bloqueadores (confirmar con operaria / cliente)</h2>
<ul>
  <li><strong>Estiben (#23, talla L):</strong> lista dice <em>manga larga</em> — en voleibol Odoo solo hay manga <strong>Siza</strong> o <strong>China</strong>. Confirmar cuál aplica antes de sumar la 7.ª unidad masculina.</li>
  <li><strong>Cuello hombres/mujeres:</strong> lista no especifica V vs redondo; líneas Odoo usan <strong>Cuello en V</strong> por defecto. Confirmar si alguno va redondo (variantes 11141/11142/11145/11146).</li>
</ul>

<hr>

<h2>Lista de jugadores (Hombre)</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:left; padding: 8px;">Manga / variante Odoo</th>
    </tr>
  </thead>
  <tbody>
    <tr style="background-color:#fff3cd;"><td style="text-align:center; padding: 8px;">23</td><td style="padding: 8px;">Estiben</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">Manga larga — <strong>sin variante voleibol</strong> (pendiente)</td></tr>
    <tr><td style="text-align:center; padding: 8px;">8</td><td style="padding: 8px;">Charli</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Siza + pantaloneta → 11139</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">2</td><td style="padding: 8px;">Juanse</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Siza + pantaloneta → 11139</td></tr>
    <tr><td style="text-align:center; padding: 8px;">22</td><td style="padding: 8px;">Leandro</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Sisa + pantaloneta → 11139</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">18</td><td style="padding: 8px;">Willy</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">Sisa + pantaloneta → 11139</td></tr>
    <tr><td style="text-align:center; padding: 8px;">19</td><td style="padding: 8px;">Javi</td><td style="text-align:center; padding: 8px;">XS</td><td style="padding: 8px;">Sisa + pantaloneta → 11139</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">3</td><td style="padding: 8px;">Angelito</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Sisa + pantaloneta → 11139</td></tr>
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
      <th style="text-align:left; padding: 8px;">Manga / variante Odoo</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="text-align:center; padding: 8px;">33</td><td style="padding: 8px;">Val</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">China + licra → 11144</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">5</td><td style="padding: 8px;">Caro</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">China + licra → 11144</td></tr>
    <tr><td style="text-align:center; padding: 8px;">7</td><td style="padding: 8px;">MariaT</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">China + licra → 11144</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">4</td><td style="padding: 8px;">May</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">China + licra → 11144</td></tr>
    <tr><td style="text-align:center; padding: 8px;">21</td><td style="padding: 8px;">Lorena</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">China + licra → 11144</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">15</td><td style="padding: 8px;">Danna</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">China + licra → 11144</td></tr>
  </tbody>
</table>

<hr>

<p>Cliente: VALENTINA SILVA · 321 3799926 · Proyecto Paola.</p>
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


def main():
    db, uid, pwd, models = connect()

    for lid in LINES_DELETE:
        models.execute_kw(
            db, uid, pwd, "sale.order.line", "write", [[lid], {"product_uom_qty": 0}]
        )
    print("Zeroed wrong fútbol lines", LINES_DELETE)

    for vals in (
        {
            "order_id": ORDER_ID,
            "product_id": V_MASC_SISA_PANT_V,
            "name": "Uniforme de voleibol (hombre — pantaloneta, manga sisa)",
            "product_uom_qty": 6,
            "price_unit": 50000,
        },
        {
            "order_id": ORDER_ID,
            "product_id": V_FEM_LICRA_CHINA_V,
            "name": "Uniforme de voleibol (mujer — licra, manga china)",
            "product_uom_qty": 6,
            "price_unit": 50000,
        },
    ):
        lid = models.execute_kw(db, uid, pwd, "sale.order.line", "create", [vals])
        print("Created line", lid, vals["product_id"])

    models.execute_kw(db, uid, pwd, "sale.order", "write", [[ORDER_ID], {"note": NOTE}])
    models.execute_kw(db, uid, pwd, "crm.lead", "write", [[LEAD_ID], {"description": NOTE}])
    models.execute_kw(db, uid, pwd, "project.task", "write", [[TASK_ID], {"description": NOTE}])

    order = models.execute_kw(
        db,
        uid,
        pwd,
        "sale.order",
        "read",
        [[ORDER_ID]],
        {"fields": ["name", "state", "amount_total", "amount_untaxed", "order_line"]},
    )[0]
    lines = models.execute_kw(
        db,
        uid,
        pwd,
        "sale.order.line",
        "read",
        [order["order_line"]],
        {"fields": ["name", "product_id", "product_uom_qty", "price_unit", "price_subtotal"]},
    )
    print(f"\n=== {order['name']} ({order['state']}) ===")
    print(f"Untaxed: ${order['amount_untaxed']:,.0f} | Total: ${order['amount_total']:,.0f}")
    for ln in lines:
        print(f"  [{ln['product_id'][0]}] {ln['name']}: {ln['product_uom_qty']} x ${ln['price_unit']:,.0f}")


if __name__ == "__main__":
    main()
