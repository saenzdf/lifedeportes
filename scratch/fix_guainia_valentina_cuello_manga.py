#!/usr/bin/env python3
"""Fix S02524 GUAINIA cuello (M=redondo, F=V) and S02526 Valentina manga corta (not china)."""
import os
import xmlrpc.client

# --- GUAINIA S02524 ---
GUAINIA_ORDER = 2522
GUAINIA_LEAD = 3393
GUAINIA_TASK = 2325
GUAINIA_LINE_MALE = 6002
GUAINIA_LINE_FEMALE = 6004
FUTBOL_M_REDONDO_CORTA = 10220  # Medias Semi, Cuello Redondo, Corta
FUTBOL_F_V_CORTA = 10219  # Medias Semi, Cuello en V, Corta

GUAINIA_NOTE = """<h1>Pedido Studiant FC - GUAINIA</h1>

<h2>Resumen de Uniformes</h2>
<ul>
  <li><strong>Masculino (16 u.):</strong> Uniforme de fútbol dry-fit <strong>cuello redondo</strong> @ $50.000 COP c/u. Dorsales #1 y #12 son arqueros: mismo diseño con colores invertidos (sin cargo adicional).</li>
  <li><strong>Femenino (9 u.):</strong> Uniforme de fútbol dry-fit <strong>cuello V</strong> @ $50.000 COP c/u. Dorsal #12 es arquera: mismo diseño con colores invertidos (sin cargo adicional).</li>
</ul>

<hr>

<h2>Lista de Jugadores (Masculino)</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:left; padding: 8px;">Rol / Tipo</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="text-align:center; padding: 8px;">1</td><td style="padding: 8px;">JIM D.</td><td style="text-align:center; padding: 8px;">XL</td><td style="padding: 8px;">Arquero (colores invertidos)</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">12</td><td style="padding: 8px;">GENILSON E.</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Arquero (colores invertidos)</td></tr>
    <tr><td style="text-align:center; padding: 8px;">99</td><td style="padding: 8px;">JUSC&amp;H MARAGU@</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Campo</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">72</td><td style="padding: 8px;">KURU J. E.</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Campo</td></tr>
    <tr><td style="text-align:center; padding: 8px;">11</td><td style="padding: 8px;">DOSMER</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Campo</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">10</td><td style="padding: 8px;">PEPE</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Campo</td></tr>
    <tr><td style="text-align:center; padding: 8px;">77</td><td style="padding: 8px;">JORDAN</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Campo</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">7</td><td style="padding: 8px;">GERMAN</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Campo</td></tr>
    <tr><td style="text-align:center; padding: 8px;">17</td><td style="padding: 8px;">LEANDRITO</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Campo</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">9</td><td style="padding: 8px;">DAVID G.</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Campo</td></tr>
    <tr><td style="text-align:center; padding: 8px;">21</td><td style="padding: 8px;">JHON F.</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Campo</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">20</td><td style="padding: 8px;">FRANCO</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Campo</td></tr>
    <tr><td style="text-align:center; padding: 8px;">3</td><td style="padding: 8px;">WALLY</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Campo</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">6</td><td style="padding: 8px;">KERWIN</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Campo</td></tr>
    <tr><td style="text-align:center; padding: 8px;">66</td><td style="padding: 8px;">Studiant FC</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Campo</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">18</td><td style="padding: 8px;">CARIANIL R &amp; M</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Campo</td></tr>
  </tbody>
</table>

<hr>

<h2>Lista de Jugadoras (Femenino)</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:left; padding: 8px;">Rol / Tipo</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="text-align:center; padding: 8px;">10</td><td style="padding: 8px;">EIDA</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Campo</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">7</td><td style="padding: 8px;">GARRIDO</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Campo</td></tr>
    <tr><td style="text-align:center; padding: 8px;">8</td><td style="padding: 8px;">CAMICO</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Campo</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">6</td><td style="padding: 8px;">ANGELICA</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Campo</td></tr>
    <tr><td style="text-align:center; padding: 8px;">9</td><td style="padding: 8px;">YORLE</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Campo</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">3</td><td style="padding: 8px;">EMA</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Campo</td></tr>
    <tr><td style="text-align:center; padding: 8px;">4</td><td style="padding: 8px;">ELIZA</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Campo</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">11</td><td style="padding: 8px;">Studiant FC</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Campo</td></tr>
    <tr><td style="text-align:center; padding: 8px;">12</td><td style="padding: 8px;">Studiant FC</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Arquera (colores invertidos)</td></tr>
  </tbody>
</table>

<hr>

<h2>Archivos de Referencia en Carpeta</h2>
<ul>
  <li>GUAINIA FEMENINO.jpeg (Diseño referencial Femenino)</li>
  <li>GUAINIA MASCULINO.jpeg (Diseño referencial Masculino)</li>
  <li>LOGO GUAINIA.jpeg (Logo "IAI 2015" Studiant FC)</li>
  <li>POSICIONES LOGOS Y NROS GUAINIA.jpeg (Posicionamiento y estilo tricolor)</li>
  <li>Studiant FC GUAINIA MASCU FEMENINO.pdf (Lista original)</li>
</ul>

<p>Abono del 50% recibido por el cliente.</p>
"""

# --- VALENTINA S02526 ---
VALENTINA_ORDER = 2524
VALENTINA_LEAD = 3394
VALENTINA_TASK = 2326
VALENTINA_LINE_FEMALE = 6016
V_FEM_LICRA_CORTA_V = 12202  # Licra, Cuello en V, Corta (nueva variante tmpl 31)

VALENTINA_NOTE = """<h1>Pedido Hub Ball — VALENTINA SILVA (voleibol)</h1>

<h2>Resumen de uniformes</h2>
<ul>
  <li><strong>Deporte:</strong> Voleibol (template Odoo 31).</li>
  <li><strong>Hombre (7 u.):</strong> Pantaloneta · cuello V · 6 con manga sisa (11139 @ $50.000) + Estiben manga larga (11139 @ $53.000).</li>
  <li><strong>Mujer (6 u.):</strong> Licra · <strong>manga corta</strong> (no manga china) · cuello V → variante <strong>12202</strong> (Licra, Cuello en V, Corta) @ $50.000 c/u.</li>
  <li><strong>Diseño:</strong> Referencia Wildcats → <strong>Hub Ball</strong>; nombre y número atrás.</li>
</ul>

<hr>

<h2>Lista de jugadores (Hombre) — cuello V</h2>
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
    <tr><td style="text-align:center; padding: 8px;">23</td><td style="padding: 8px;">Estiben</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">Manga larga (+$3.000)</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">8</td><td style="padding: 8px;">Charli</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Sisa</td></tr>
    <tr><td style="text-align:center; padding: 8px;">2</td><td style="padding: 8px;">Juanse</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Sisa</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">22</td><td style="padding: 8px;">Leandro</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Sisa</td></tr>
    <tr><td style="text-align:center; padding: 8px;">18</td><td style="padding: 8px;">Willy</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">Sisa</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">19</td><td style="padding: 8px;">Javi</td><td style="text-align:center; padding: 8px;">XS</td><td style="padding: 8px;">Sisa</td></tr>
    <tr><td style="text-align:center; padding: 8px;">3</td><td style="padding: 8px;">Angelito</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Sisa</td></tr>
  </tbody>
</table>

<hr>

<h2>Lista de jugadoras (Mujer) — licra, manga corta, cuello V</h2>
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
    <tr><td style="text-align:center; padding: 8px;">33</td><td style="padding: 8px;">Val</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">5</td><td style="padding: 8px;">Caro</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">7</td><td style="padding: 8px;">MariaT</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">4</td><td style="padding: 8px;">May</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">21</td><td style="padding: 8px;">Lorena</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr style="background-color:#f9f9f9;"><td style="text-align:center; padding: 8px;">15</td><td style="padding: 8px;">Danna</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Manga corta</td></tr>
  </tbody>
</table>

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

    # GUAINIA: fix product variants + note (confirmed SO: zero old lines, create new)
    for old_id, product_id, name, qty in (
        (GUAINIA_LINE_MALE, FUTBOL_M_REDONDO_CORTA, "Uniforme de Fútbol dry-fit - Masculino (cuello redondo)", 16),
        (GUAINIA_LINE_FEMALE, FUTBOL_F_V_CORTA, "Uniforme de Fútbol dry-fit - Femenino (cuello V)", 9),
    ):
        models.execute_kw(db, uid, pwd, "sale.order.line", "write", [[old_id], {"product_uom_qty": 0}])
        models.execute_kw(
            db, uid, pwd, "sale.order.line", "create",
            [{"order_id": GUAINIA_ORDER, "product_id": product_id, "name": name, "product_uom_qty": qty, "price_unit": 50000}],
        )
    models.execute_kw(db, uid, pwd, "sale.order", "write", [[GUAINIA_ORDER], {"note": GUAINIA_NOTE}])
    models.execute_kw(db, uid, pwd, "crm.lead", "write", [[GUAINIA_LEAD], {"description": GUAINIA_NOTE}])
    models.execute_kw(db, uid, pwd, "project.task", "write", [[GUAINIA_TASK], {"description": GUAINIA_NOTE}])
    print("GUAINIA S02524 updated")

    # VALENTINA: manga corta variant (not china)
    models.execute_kw(db, uid, pwd, "sale.order.line", "write", [[VALENTINA_LINE_FEMALE], {"product_uom_qty": 0}])
    models.execute_kw(
        db, uid, pwd, "sale.order.line", "create",
        [{
            "order_id": VALENTINA_ORDER,
            "product_id": V_FEM_LICRA_CORTA_V,
            "name": "Uniforme de voleibol (mujer — licra, manga corta, cuello V)",
            "product_uom_qty": 6,
            "price_unit": 50000,
        }],
    )
    models.execute_kw(db, uid, pwd, "sale.order", "write", [[VALENTINA_ORDER], {"note": VALENTINA_NOTE}])
    models.execute_kw(db, uid, pwd, "crm.lead", "write", [[VALENTINA_LEAD], {"description": VALENTINA_NOTE}])
    models.execute_kw(db, uid, pwd, "project.task", "write", [[VALENTINA_TASK], {"description": VALENTINA_NOTE}])
    print("VALENTINA S02526 updated")

    for oid in (GUAINIA_ORDER, VALENTINA_ORDER):
        order = models.execute_kw(
            db,
            uid,
            pwd,
            "sale.order",
            "read",
            [[oid]],
            {"fields": ["name", "state", "amount_total", "order_line"]},
        )[0]
        lines = models.execute_kw(
            db,
            uid,
            pwd,
            "sale.order.line",
            "read",
            [order["order_line"]],
            {"fields": ["name", "product_id", "product_uom_qty", "price_unit"]},
        )
        print(f"\n=== {order['name']} ({order['state']}) total ${order['amount_total']:,.0f} ===")
        for ln in lines:
            if ln["product_uom_qty"]:
                print(f"  [{ln['product_id'][0]}] {ln['name']}: {ln['product_uom_qty']} x ${ln['price_unit']:,.0f}")


if __name__ == "__main__":
    main()
