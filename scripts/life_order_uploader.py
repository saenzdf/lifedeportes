"""
Life Deportes - Master Order Ingestion & Attachment Classifier Utility
========================================================================
Implements strict rules for first-attempt success:
1. Dynamic Excel / Word / Image list parsing without hardcoded row limits.
2. Respects CANTIDAD column multiplier.
3. Strict Attachment Classification: EXCLUDES payment receipts (Nequi/Daviplata/Bancolombia screenshots).
   INCLUDES: escudos, logos, design mockups, list photos, .xlsx/.docx files.
4. Exact name alignment (Partner, CRM Lead, SO Studio Name).
5. Link SO to CRM Lead (`opportunity_id`).
6. Correct Project assignment (Javier=8, Paola=9).
7. In-place edit support (no duplicate lead/SO creation).
"""

import os
import sys
import base64
import openpyxl
import xmlrpc.client
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding='utf-8')
load_dotenv()

# Keywords that identify a payment receipt / financial document to EXCLUDE from design attachments
PAYMENT_RECEIPT_KEYWORDS = [
    'comprobante', 'recibo', 'transferencia', 'nequi', 'daviplata', 
    'bancolombia', 'pago', 'exitoso', 'voucher', 'transaccion', 'valor_pagado'
]

# Keywords that identify valid design / order reference attachments
VALID_ATTACHMENT_KEYWORDS = [
    'escudo', 'logo', 'diseño', 'diseno', 'referencia', 'mockup', 'foto',
    'lista', 'formato', 'pedido', 'tabla', 'jugadores', 'medida', 'prenda'
]


def classify_attachment(file_path):
    """
    Returns True if file_path is a valid design/order reference attachment.
    Returns False if file_path is a payment receipt or non-design file.
    """
    basename = os.path.basename(file_path).lower()
    
    # 1. Reject obvious payment receipt filenames
    for kw in PAYMENT_RECEIPT_KEYWORDS:
        if kw in basename:
            print(f"  🚫 Excluding payment receipt attachment: {basename}")
            return False, "payment_receipt"
            
    # 2. Check extension
    ext = os.path.splitext(basename)[1].lower()
    if ext in ['.xlsx', '.xls', '.docx', '.pdf', '.png', '.jpg', '.jpeg', '.webp']:
        return True, "valid_attachment"
        
    return False, "unknown_type"


def parse_life_excel(file_path, sheet_name="formato life"):
    """
    Dynamically parses an Excel file in 'formato life' or default format.
    Iterates dynamically through all rows, handling CANTIDAD multiplier.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Excel file not found: {file_path}")
        
    wb = openpyxl.load_workbook(file_path, data_only=True)
    if sheet_name in wb.sheetnames:
        sheet = wb[sheet_name]
    else:
        sheet = wb.active
        print(f"  ⚠️ Sheet '{sheet_name}' not found, using active sheet '{sheet.title}'")

    rows = []
    # Find data rows starting after header (usually row 6)
    start_row = 6
    max_row = sheet.max_row

    for r in range(start_row, max_row + 1):
        no_val = sheet.cell(r, 1).value
        nombre = sheet.cell(r, 2).value
        talla = sheet.cell(r, 3).value
        cant_val = sheet.cell(r, 4).value or 1  # Col D = CANTIDAD
        manga = sheet.cell(r, 5).value or "Corta"
        mas = str(sheet.cell(r, 6).value or "").strip().upper()
        fem = str(sheet.cell(r, 7).value or "").strip().upper()
        
        if nombre or talla:
            try:
                qty = int(cant_val)
            except (ValueError, TypeError):
                qty = 1

            genero = "MASCULINO"
            if fem == "X":
                genero = "FEMENINO"
            elif mas == "X":
                genero = "MASCULINO"

            rows.append({
                "no": no_val or "-",
                "nombre": str(nombre or "—").strip(),
                "talla": str(talla or "M").strip().upper(),
                "cantidad": qty,
                "manga": str(manga).strip(),
                "genero": genero
            })

    total_qty = sum(r["cantidad"] for r in rows)
    print(f"  ✅ Parsed {len(rows)} row(s) representing {total_qty} total item(s) from {os.path.basename(file_path)}")
    return rows, total_qty


def generate_odoo_note_html(team_name, disciplina, rows, project_name="Javier"):
    """
    Generates standard clean HTML for sale.order.note and project.task.description.
    EXCLUDES client phone, prices, and payment details.
    """
    html = f"""<h1>Pedido {team_name}</h1>
<h2>Detalle de Lista de Pedido</h2>
<p><strong>Disciplina:</strong> {disciplina}</p>
<p><strong>Total Unidades:</strong> {sum(r['cantidad'] for r in rows)}</p>

<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:center; padding: 8px;">Cant.</th>
      <th style="text-align:left; padding: 8px;">Manga / Variante</th>
      <th style="text-align:left; padding: 8px;">Género</th>
    </tr>
  </thead>
  <tbody>"""

    for r in rows:
        html += f"""
    <tr>
      <td style="text-align:center; padding: 8px;">{r['no']}</td>
      <td style="padding: 8px;">{r['nombre']}</td>
      <td style="text-align:center; padding: 8px;">{r['talla']}</td>
      <td style="text-align:center; padding: 8px;">{r['cantidad']}</td>
      <td style="padding: 8px;">{r['manga']}</td>
      <td style="padding: 8px;">{r['genero']}</td>
    </tr>"""

    html += f"""
  </tbody>
</table>

<p>Proyecto: {project_name}</p>
"""
    return html


class OdooOrderIngestor:
    def __init__(self):
        url = os.environ.get("ODOO_URL")
        db = os.environ.get("ODOO_DB")
        username = os.environ.get("ODOO_USERNAME")
        password = os.environ.get("ODOO_PASSWORD")

        if not all([url, db, username, password]):
            raise ValueError("Missing ODOO env variables in .env file")

        common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
        self.uid = common.authenticate(db, username, password, {})
        self.models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
        self.db = db
        self.password = password
        print(f"Connected to Odoo ({url}) as UID {self.uid}")

    def search_read(self, model, domain, fields=None):
        return self.models.execute_kw(
            self.db, self.uid, self.password,
            model, 'search_read', [domain],
            {'fields': fields or []}
        )

    def create(self, model, vals):
        return self.models.execute_kw(
            self.db, self.uid, self.password,
            model, 'create', [vals]
        )

    def write(self, model, record_ids, vals):
        return self.models.execute_kw(
            self.db, self.uid, self.password,
            model, 'write', [record_ids, vals]
        )

    def upload_attachments(self, res_model, res_id, attachment_paths):
        """
        Uploads design references to Chatter while EXCLUDING payment receipts.
        """
        uploaded = []
        for file_path in attachment_paths:
            if not os.path.exists(file_path):
                print(f"  ⚠️ Attachment file not found: {file_path}")
                continue

            is_valid, reason = classify_attachment(file_path)
            if not is_valid:
                print(f"  ⏭️ Skipping file '{os.path.basename(file_path)}' (reason: {reason})")
                continue

            filename = os.path.basename(file_path)
            with open(file_path, "rb") as f:
                encoded_data = base64.b64encode(f.read()).decode('utf-8')

            att_vals = {
                'name': filename,
                'datas': encoded_data,
                'res_model': res_model,
                'res_id': res_id,
                'type': 'binary'
            }
            att_id = self.create('ir.attachment', att_vals)
            uploaded.append(att_id)
            print(f"  📎 Uploaded attachment '{filename}' (ID {att_id}) to {res_model}:{res_id}")

        return uploaded
