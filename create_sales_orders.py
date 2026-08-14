import xmlrpc.client
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

def load_dotenv():
    with open(".env", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip()
            if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                v = v[1:-1]
            os.environ[k] = v

load_dotenv()

url = os.environ.get("ODOO_URL")
db = os.environ.get("ODOO_DB")
username = os.environ.get("ODOO_USERNAME")
password = os.environ.get("ODOO_PASSWORD")

print(f"Connecting to Odoo at {url}...")
common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
print(f"Authenticated successfully (uid={uid})")

def create_crm_opportunity(name, partner_id, description):
    vals = {
        'name': name,
        'partner_id': partner_id,
        'description': description,
        'type': 'opportunity',
        'stage_id': 1  # Etapa inicial / Nuevo ('Canal Ventas')
    }
    lead_id = models.execute_kw(db, uid, password, 'crm.lead', 'create', [vals])
    print(f"Created CRM Lead/Opportunity ID: {lead_id} ({name}) in initial stage")
    return lead_id

def create_sales_order(partner_id, team_name, note_html, lines, opportunity_id=None, attachments=None):
    # Prepare order_line tuples: (0, 0, line_vals)
    order_line_tuples = []
    for line in lines:
        order_line_tuples.append((0, 0, {
            'product_id': line['product_id'],
            'product_uom_qty': line['qty'],
            'price_unit': line['price'],
            'name': line['name']
        }))
        
    vals = {
        'partner_id': partner_id,
        'partner_invoice_id': partner_id,
        'partner_shipping_id': partner_id,
        'x_studio_nombre_del_pedido': team_name,
        'note': note_html,
        'order_line': order_line_tuples
    }
    if opportunity_id:
        vals['opportunity_id'] = opportunity_id
    
    so_id = models.execute_kw(db, uid, password, 'sale.order', 'create', [vals])
    so_data = models.execute_kw(db, uid, password, 'sale.order', 'read', [[so_id]], {'fields': ['name']})
    so_name = so_data[0]['name'] if so_data else f"ID {so_id}"
    print(f"Created Sales Order draft ID: {so_id} ({so_name}) for {team_name} (Linked to Lead {opportunity_id})")

    # Upload reference attachments if provided (skipping payment receipts)
    if attachments:
        for file_path, att_name in attachments:
            if os.path.exists(file_path):
                import base64
                with open(file_path, "rb") as f:
                    encoded_data = base64.b64encode(f.read()).decode('utf-8')
                att_vals = {
                    'name': att_name,
                    'datas': encoded_data,
                    'res_model': 'sale.order',
                    'res_id': so_id,
                    'type': 'binary'
                }
                att_id = models.execute_kw(db, uid, password, 'ir.attachment', 'create', [att_vals])
                print(f"  📎 Uploaded attachment '{att_name}' (ID {att_id})")

    return so_id, so_name


# ==========================================
# 1) CARLOS G
# ==========================================
print("\n--- Processing Carlos G (819) ---")
carlos_partner_id = 3169

carlos_note_html = """<h1>Pedido MONARCAS CARLOS</h1>

<h2>Resumen de uniformes</h2>
<ul>
  <li><strong>Femenino (16 u.):</strong> Camisetas dry-fit solas, manga corta, cuello redondo.</li>
  <li><strong>Masculino (6 u.):</strong> Camisetas dry-fit solas, manga corta, cuello redondo.</li>
</ul>

<hr>

<h2>Lista de jugadores (Femenino)</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:left; padding: 8px;">Rol / variante</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="text-align:center; padding: 8px;">39</td><td style="padding: 8px;">Laura</td><td style="text-align:center; padding: 8px;">XL</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">24</td><td style="padding: 8px;">—</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">24</td><td style="padding: 8px;">—</td><td style="text-align:center; padding: 8px;">4</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">87</td><td style="padding: 8px;">Leidy</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">87</td><td style="padding: 8px;">Karol</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">87</td><td style="padding: 8px;">Sheidy</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">17</td><td style="padding: 8px;">Shirley</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">17</td><td style="padding: 8px;">Yosileht</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">00</td><td style="padding: 8px;">Delma</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">8</td><td style="padding: 8px;">—</td><td style="text-align:center; padding: 8px;">S</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">89</td><td style="padding: 8px;">Yelis</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">53</td><td style="padding: 8px;">Yina</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">6</td><td style="padding: 8px;">Naireth</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">6</td><td style="padding: 8px;">Sara</td><td style="text-align:center; padding: 8px;">6</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">6</td><td style="padding: 8px;">Yoelis</td><td style="text-align:center; padding: 8px;">10</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">11</td><td style="padding: 8px;">—</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Manga corta</td></tr>
  </tbody>
</table>

<br>

<h2>Lista de jugadores (Masculino)</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:left; padding: 8px;">Rol / variante</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="text-align:center; padding: 8px;">39</td><td style="padding: 8px;">Jero</td><td style="text-align:center; padding: 8px;">4</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">17</td><td style="padding: 8px;">Stiven</td><td style="text-align:center; padding: 8px;">14</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">8</td><td style="padding: 8px;">_</td><td style="text-align:center; padding: 8px;">10</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">89</td><td style="padding: 8px;">Yesid</td><td style="text-align:center; padding: 8px;">4</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">6</td><td style="padding: 8px;">Jeremías</td><td style="text-align:center; padding: 8px;">8</td><td style="padding: 8px;">Manga corta</td></tr>
    <tr><td style="text-align:center; padding: 8px;">23</td><td style="padding: 8px;">—</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Manga corta</td></tr>
  </tbody>
</table>

<p>Proyecto: Javier</p>
"""

carlos_lines = [
    {'product_id': 504, 'qty': 1, 'price': 0.0, 'name': "Diseño"},
    {'product_id': 11790, 'qty': 22, 'price': 30000.0, 'name': "Camiseta deportiva dry-fit Corta, Cuello Redondo (Sola)"}
]

create_crm_opportunity("Carlos G - 22 Camisetas", carlos_partner_id, "Oportunidad de Carlos G creada por Antigravity para 22 camisetas dry-fit solas.")
create_sales_order(carlos_partner_id, "MONARCAS CARLOS", carlos_note_html, carlos_lines)


# ==========================================
# 2) AMIGOS POKER
# ==========================================
print("\n--- Processing Amigos Poker (820) ---")
# Create child contact for AMIGOS POKER
poker_partner_vals = {
    'name': "AMIGOS POKER",
    'parent_id': 3440, # DANIEL MATEO LOSADA THE POWER
    'phone': "+57 300 3477552",
    'type': 'contact'
}
poker_partner_id = models.execute_kw(db, uid, password, 'res.partner', 'create', [poker_partner_vals])
print(f"Created/Resolved partner for AMIGOS POKER: ID {poker_partner_id}")

poker_note_html = """<h1>Pedido Amigos Poker</h1>

<h2>Resumen de uniformes</h2>
<ul>
  <li><strong>Uniformes completos (2 u.):</strong> Uniforme de Fútbol completo (camiseta manga corta, pantaloneta y medias).</li>
  <li><strong>Camisetas solas (4 u.):</strong> Camiseta de fútbol dry-fit sola, manga corta, cuello en V.</li>
</ul>

<hr>

<h2>Lista de jugadores</h2>
<p>Tallas, nombres y números de los jugadores pendientes de confirmar por el cliente.</p>

<p>Proyecto: Javier</p>
"""

poker_lines = [
    {'product_id': 504, 'qty': 1, 'price': 0.0, 'name': "Diseño"},
    {'product_id': 12409, 'qty': 2, 'price': 50000.0, 'name': "Uniforme de Fútbol"},
    {'product_id': 11788, 'qty': 4, 'price': 30000.0, 'name': "Camiseta deportiva dry-fit Corta, Cuello en V (Sola)"}
]

create_crm_opportunity("Amigos Poker", poker_partner_id, "Oportunidad de Amigos Poker creada por Antigravity para 2 uniformes completos y 4 camisetas solas.")
create_sales_order(poker_partner_id, "Amigos Poker", poker_note_html, poker_lines)


# ==========================================
# 3) LAURA PALACIOS
# ==========================================
print("\n--- Processing Laura Palacios (821) ---")
laura_partner_id = 3757

laura_note_html = """<h1>Pedido Laura Palacios - Servitransportes Andina / El Palmero</h1>

<h2>Resumen de uniformes</h2>
<ul>
  <li><strong>Camisetas tipo Polo (6 u.):</strong> Camiseta deportiva con cuello polo, sin botones. Diseño personalizado sublimado full color.</li>
</ul>

<hr>

<h2>Lista de jugadores</h2>
<p>Tallas y nombres de los jugadores pendientes de confirmar por el cliente.</p>

<p>Proyecto: Javier</p>
"""

laura_lines = [
    {'product_id': 504, 'qty': 1, 'price': 0.0, 'name': "Diseño"},
    {'product_id': 11725, 'qty': 6, 'price': 70000.0, 'name': "Camiseta deportiva con cuello polo, Sin botones (Personalizada Lote Pequeño)"}
]

create_crm_opportunity("Laura Palacios - 6 Polos", laura_partner_id, "Oportunidad de Laura Palacios creada por Antigravity para 6 camisetas polo sublimadas.")
create_sales_order(laura_partner_id, "Servitransportes Andina / El Palmero", laura_note_html, laura_lines)


# ==========================================
# 4) MARICELA
# ==========================================
print("\n--- Processing Maricela (822) ---")
maricela_partner_vals = {
    'name': "MARICELA",
    'phone': "+57 318 3927291",
    'type': 'contact'
}
maricela_partner_id = models.execute_kw(db, uid, password, 'res.partner', 'create', [maricela_partner_vals])
print(f"Created partner for MARICELA: ID {maricela_partner_id}")

maricela_note_html = """<h1>Pedido Gobernación del Guaviare</h1>

<h2>Resumen de uniformes</h2>
<ul>
  <li><strong>Polo Presentación Adultos (31 u.):</strong> Camiseta deportiva con cuello polo, sin botones. Diseño "Gobernación del Guaviare".</li>
  <li><strong>Uniformes Fútbol Niños (13 u.):</strong> Uniforme de Fútbol Dry-fit completo (camiseta manga corta, pantaloneta y medias).</li>
</ul>

<hr>

<h2>Presentación Hombres tipo Polo (23 u.)</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:center; padding: 8px;">Cantidad</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="text-align:center; padding: 8px;">S</td><td style="text-align:center; padding: 8px;">1</td></tr>
    <tr><td style="text-align:center; padding: 8px;">M</td><td style="text-align:center; padding: 8px;">12</td></tr>
    <tr><td style="text-align:center; padding: 8px;">L</td><td style="text-align:center; padding: 8px;">7</td></tr>
    <tr><td style="text-align:center; padding: 8px;">XL</td><td style="text-align:center; padding: 8px;">2</td></tr>
    <tr><td style="text-align:center; padding: 8px;">XXL</td><td style="text-align:center; padding: 8px;">1</td></tr>
  </tbody>
</table>

<br>

<h2>Presentación Mujer tipo Polo (8 u.)</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:center; padding: 8px;">Cantidad</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="text-align:center; padding: 8px;">16</td><td style="text-align:center; padding: 8px;">1</td></tr>
    <tr><td style="text-align:center; padding: 8px;">S</td><td style="text-align:center; padding: 8px;">4</td></tr>
    <tr><td style="text-align:center; padding: 8px;">M</td><td style="text-align:center; padding: 8px;">3</td></tr>
  </tbody>
</table>

<br>

<h2>Uniformes Fútbol Niños (13 u.)</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre Espalda</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:left; padding: 8px;">Rol / variante</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="text-align:center; padding: 8px;">—</td><td style="padding: 8px;">Murillo</td><td style="text-align:center; padding: 8px;">10</td><td style="padding: 8px;">Uniforme Niño</td></tr>
    <tr><td style="text-align:center; padding: 8px;">—</td><td style="padding: 8px;">—</td><td style="text-align:center; padding: 8px;">16</td><td style="padding: 8px;">Uniforme Niño</td></tr>
    <tr><td style="text-align:center; padding: 8px;">51</td><td style="padding: 8px;">Santamaria</td><td style="text-align:center; padding: 8px;">16</td><td style="padding: 8px;">Uniforme Niño</td></tr>
    <tr><td style="text-align:center; padding: 8px;">11</td><td style="padding: 8px;">Harold JR</td><td style="text-align:center; padding: 8px;">8</td><td style="padding: 8px;">Uniforme Niño</td></tr>
    <tr><td style="text-align:center; padding: 8px;">11</td><td style="padding: 8px;">May MM</td><td style="text-align:center; padding: 8px;">12</td><td style="padding: 8px;">Uniforme Niño</td></tr>
    <tr><td style="text-align:center; padding: 8px;">6</td><td style="padding: 8px;">—</td><td style="text-align:center; padding: 8px;">14</td><td style="padding: 8px;">Uniforme Niño</td></tr>
    <tr><td style="text-align:center; padding: 8px;">—</td><td style="padding: 8px;">—</td><td style="text-align:center; padding: 8px;">4</td><td style="padding: 8px;">Uniforme Niño</td></tr>
    <tr><td style="text-align:center; padding: 8px;">8</td><td style="padding: 8px;">Adler</td><td style="text-align:center; padding: 8px;">8</td><td style="padding: 8px;">Uniforme Niño</td></tr>
    <tr><td style="text-align:center; padding: 8px;">23</td><td style="padding: 8px;">Santamaria</td><td style="text-align:center; padding: 8px;">10</td><td style="padding: 8px;">Uniforme Niño</td></tr>
    <tr><td style="text-align:center; padding: 8px;">23</td><td style="padding: 8px;">Santamaria</td><td style="text-align:center; padding: 8px;">10</td><td style="padding: 8px;">Uniforme Niño</td></tr>
    <tr><td style="text-align:center; padding: 8px;">23</td><td style="padding: 8px;">Santamaria</td><td style="text-align:center; padding: 8px;">16</td><td style="padding: 8px;">Uniforme Niño</td></tr>
    <tr><td style="text-align:center; padding: 8px;">—</td><td style="padding: 8px;">Pizarro</td><td style="text-align:center; padding: 8px;">10</td><td style="padding: 8px;">Uniforme Niño</td></tr>
    <tr><td style="text-align:center; padding: 8px;">31</td><td style="padding: 8px;">Romero</td><td style="text-align:center; padding: 8px;">16</td><td style="padding: 8px;">Uniforme Niño</td></tr>
  </tbody>
</table>

<p>Proyecto: Javier</p>
"""

maricela_lines = [
    {'product_id': 504, 'qty': 1, 'price': 0.0, 'name': "Diseño"},
    {'product_id': 11725, 'qty': 31, 'price': 35000.0, 'name': "Camiseta deportiva con cuello polo, Sin botones"},
    {'product_id': 12409, 'qty': 13, 'price': 50000.0, 'name': "Uniforme de Fútbol"}
]

create_crm_opportunity("Maricela - Guaviare", maricela_partner_id, "Oportunidad de Maricela creada por Antigravity para 31 polos de presentación y 13 uniformes de niños.")
create_sales_order(maricela_partner_id, "Gobernación del Guaviare", maricela_note_html, maricela_lines)

print("\n🎉 All 4 orders processed successfully!")
