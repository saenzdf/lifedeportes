#!/usr/bin/env python3
import os
import xmlrpc.client

ORDER_ID = 2522
LINE_MALE = 6002
LINE_FEMALE = 6004

NOTE = """<h1>Pedido Studiant FC - GUAINIA</h1>

<h2>Resumen de Uniformes</h2>
<ul>
  <li><strong>Masculino (16 u.):</strong> Uniforme de fútbol dry-fit cuello redondo @ $50.000 COP c/u. Dorsales #1 y #12 son arqueros: mismo diseño con colores invertidos (sin cargo adicional).</li>
  <li><strong>Femenino (9 u.):</strong> Uniforme de fútbol dry-fit cuello redondo @ $50.000 COP c/u. Dorsal #12 es arquera: mismo diseño con colores invertidos (sin cargo adicional).</li>
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

url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"]
db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
pwd = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]

common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
uid = common.authenticate(db, user, pwd, {})
models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")

models.execute_kw(db, uid, pwd, "sale.order.line", "write", [[LINE_MALE], {"product_uom_qty": 16}])
models.execute_kw(db, uid, pwd, "sale.order.line", "write", [[LINE_FEMALE], {"product_uom_qty": 9}])
models.execute_kw(db, uid, pwd, "sale.order", "write", [[ORDER_ID], {"note": NOTE}])

order = models.execute_kw(
    db, uid, pwd, "sale.order", "read", [[ORDER_ID]],
    {"fields": ["name", "amount_total", "amount_untaxed", "order_line"]},
)[0]
lines = models.execute_kw(
    db, uid, pwd, "sale.order.line", "read", [order["order_line"]],
    {"fields": ["name", "product_uom_qty", "price_unit", "price_subtotal"]},
)
print(f"=== {order['name']} ===")
print(f"Untaxed: ${order['amount_untaxed']:,.0f} | Total: ${order['amount_total']:,.0f}")
for ln in lines:
    print(f"  - {ln['name']}: {ln['product_uom_qty']} x ${ln['price_unit']:,.0f} = ${ln['price_subtotal']:,.0f}")
