#!/usr/bin/env python3
"""S02524 / S02526: quitar precios y pagos de notas; mantener equipo y cliente."""
import os
import re
import xmlrpc.client

GUAINIA_ORDER = 2522
GUAINIA_LEAD = 3393
GUAINIA_TASK = 2325

VALENTINA_ORDER = 2524
VALENTINA_LEAD = 3394
VALENTINA_TASK = 2326

GUAINIA_NOTE = """<h1>Pedido Studiant FC - GUAINIA</h1>

<h2>Resumen de Uniformes</h2>
<ul>
  <li><strong>Masculino (16 u.):</strong> Uniforme de fútbol dry-fit <strong>cuello redondo</strong>. Dorsales #1 y #12 son arqueros: mismo diseño con colores invertidos (sin cargo adicional).</li>
  <li><strong>Femenino (9 u.):</strong> Uniforme de fútbol dry-fit <strong>cuello V</strong>. Dorsal #12 es arquera: mismo diseño con colores invertidos (sin cargo adicional).</li>
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
"""

VALENTINA_NOTE = """<h1>Pedido Hub Ball — VALENTINA SILVA (voleibol)</h1>

<h2>Resumen de uniformes</h2>
<ul>
  <li><strong>Deporte:</strong> Voleibol.</li>
  <li><strong>Hombre (7 u.):</strong> Pantaloneta · cuello V · 6 con manga sisa + Estiben manga larga.</li>
  <li><strong>Mujer (6 u.):</strong> Licra · <strong>manga corta</strong> (no manga china) · cuello V.</li>
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
    <tr><td style="text-align:center; padding: 8px;">23</td><td style="padding: 8px;">Estiben</td><td style="text-align:center; padding: 8px;">L</td><td style="padding: 8px;">Manga larga</td></tr>
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

<p>Cliente: VALENTINA SILVA · Proyecto Paola.</p>
"""


def connect():
    url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"]
    db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
    pwd = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, pwd, {})
    if not uid:
        raise SystemExit("Auth failed")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
    return db, uid, pwd, models


def assert_clean(html: str, label: str) -> None:
    bad = []
    if re.search(r"\$\s*\d", html):
        bad.append("$")
    if re.search(r"\bCOP\b", html, re.I):
        bad.append("COP")
    if re.search(r"abono|50\s*%", html, re.I):
        bad.append("abono/50%")
    if bad:
        raise SystemExit(f"{label}: still contains {bad}")


def main():
    db, uid, pwd, models = connect()
    for note, label in ((GUAINIA_NOTE, "GUAINIA"), (VALENTINA_NOTE, "VALENTINA")):
        assert_clean(note, label)

    for order_id, lead_id, task_id, note, name in (
        (GUAINIA_ORDER, GUAINIA_LEAD, GUAINIA_TASK, GUAINIA_NOTE, "S02524"),
        (VALENTINA_ORDER, VALENTINA_LEAD, VALENTINA_TASK, VALENTINA_NOTE, "S02526"),
    ):
        models.execute_kw(db, uid, pwd, "sale.order", "write", [[order_id], {"note": note}])
        models.execute_kw(db, uid, pwd, "crm.lead", "write", [[lead_id], {"description": note}])
        models.execute_kw(db, uid, pwd, "project.task", "write", [[task_id], {"description": note}])
        print(f"{name}: note + lead + task updated (sin precios ni pagos)")

    for oid in (GUAINIA_ORDER, VALENTINA_ORDER):
        row = models.execute_kw(
            db, uid, pwd, "sale.order", "read", [[oid]], {"fields": ["name", "note"]}
        )[0]
        snippet = (row["note"] or "")[:120].replace("\n", " ")
        print(f"  {row['name']} preview: {snippet}...")


if __name__ == "__main__":
    main()
