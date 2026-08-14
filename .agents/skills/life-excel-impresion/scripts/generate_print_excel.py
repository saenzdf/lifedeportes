#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
generate_print_excel.py
Generador dinámico de Excel de Impresión para Life Deportes.
Crea archivos .xlsx con la tabla de jugadores, totales por prendas/tallas
e imágenes dimensionadas de bocetos/diseños.
"""

import os
import sys
import json
import argparse
from PIL import Image as PILImage
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.drawing.image import Image as OpenPyXlImage

def create_print_excel(data, output_path):
    """
    Crea un archivo Excel de impresión a partir de un diccionario de datos.
    data = {
        "header": {
            "title": "[2900] CARLOS MARIO GONZALEZ",
            "deporte": "Fútbol",
            "cuello": "Cuello Redondo",
            "medias": "Rosa",
            "observaciones": "Uniforme de Francia con escudo bordado"
        },
        "players": [
            {
                "producto": "Uniforme",
                "numero": 10,
                "nombre": "FEDERICO",
                "talla": "S",
                "cantidad": 1,
                "manga": "Corta",
                "genero": "Masculino",
                "es_arquero": "No",
                "comentario": ""
            }
        ],
        "totals": {
            "UNIF.": 18,
            "CAM.": 1
        },
        "image_paths": ["/ruta/a/boceto1.png"]
    }
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "IMPRESION"
    ws.views.sheetView[0].showGridLines = True

    # Estilos corporativos Life Deportes
    header_title_font = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
    header_title_fill = PatternFill(start_color="1F497D", end_color="1F497D", fill_type="solid")
    
    meta_label_font = Font(name="Calibri", size=11, bold=True, color="1F497D")
    meta_val_font = Font(name="Calibri", size=11, color="000000")
    
    table_header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    table_header_fill = PatternFill(start_color="2F5597", end_color="2F5597", fill_type="solid")
    
    data_font = Font(name="Calibri", size=11, color="000000")
    data_alt_fill = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
    
    totals_header_fill = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
    totals_font = Font(name="Calibri", size=11, bold=True, color="1F497D")

    thin_border_side = Side(border_style="thin", color="D9D9D9")
    thick_border_side = Side(border_style="medium", color="1F497D")
    
    border_cell = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)
    border_header = Border(left=thick_border_side, right=thick_border_side, top=thick_border_side, bottom=thick_border_side)

    center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left_align = Alignment(horizontal="left", vertical="center", wrap_text=True)

    header_info = data.get("header", {})
    title = header_info.get("title", "PEDIDO LIFE DEPORTES")

    # 1. Título principal
    ws.merge_cells("A1:H1")
    title_cell = ws["A1"]
    title_cell.value = title.upper()
    title_cell.font = header_title_font
    title_cell.fill = header_title_fill
    title_cell.alignment = center_align
    ws.row_dimensions[1].height = 30

    # 2. Metadatos del pedido (Filas 2-3)
    ws.row_dimensions[2].height = 22
    ws.row_dimensions[3].height = 22

    # Fila 2: Deporte y Cuello
    ws["A2"] = "DEPORTE:"
    ws["A2"].font = meta_label_font
    ws["A2"].alignment = left_align
    ws["B2"] = header_info.get("deporte", "N/A")
    ws["B2"].font = meta_val_font

    ws["D2"] = "CUELLO:"
    ws["D2"].font = meta_label_font
    ws["D2"].alignment = left_align
    ws["E2"] = header_info.get("cuello", "N/A")
    ws["E2"].font = meta_val_font

    # Fila 3: Medias y Observaciones
    ws["A3"] = "COLOR MEDIAS:"
    ws["A3"].font = meta_label_font
    ws["A3"].alignment = left_align
    ws["B3"] = header_info.get("medias", "N/A")
    ws["B3"].font = meta_val_font

    ws["D3"] = "OBSERVACIONES:"
    ws["D3"].font = meta_label_font
    ws["D3"].alignment = left_align
    ws["E3"] = header_info.get("observaciones", "N/A")
    ws["E3"].font = meta_val_font

    # 3. Encabezados de la Tabla de Jugadores (Fila 5)
    headers = [
        "Producto",
        "No. Jugador",
        "Nombre en Uniforme",
        "Talla",
        "Cantidad",
        "Manga",
        "Género",
        "Es arquero / Comentario"
    ]
    
    ws.row_dimensions[5].height = 26
    for col_num, h_text in enumerate(headers, 1):
        cell = ws.cell(row=5, column=col_num)
        cell.value = h_text
        cell.font = table_header_font
        cell.fill = table_header_fill
        cell.alignment = center_align
        cell.border = border_header

    # 4. Filas de Jugadores (A partir de Fila 6)
    players = data.get("players", [])
    current_row = 6

    for idx, player in enumerate(players):
        ws.row_dimensions[current_row].height = 22
        
        vals = [
            player.get("producto", "Uniforme"),
            player.get("numero", ""),
            str(player.get("nombre", "")).upper(),
            str(player.get("talla", "")).upper(),
            player.get("cantidad", 1),
            player.get("manga", "Corta"),
            player.get("genero", "Masculino"),
            player.get("es_arquero", "No") if player.get("es_arquero") == "Sí" else player.get("comentario", "")
        ]

        fill_to_use = data_alt_fill if idx % 2 == 1 else None

        for c_idx, val in enumerate(vals, 1):
            cell = ws.cell(row=current_row, column=c_idx)
            cell.value = val
            cell.font = data_font
            cell.border = border_cell
            if fill_to_use:
                cell.fill = fill_to_use
            
            # Alineación según columna
            if c_idx in [2, 4, 5, 6, 7]:
                cell.alignment = center_align
            else:
                cell.alignment = left_align

        current_row += 1

    # 5. Sección de Resumen y Totales (Abajo de la tabla)
    current_row += 1
    ws.row_dimensions[current_row].height = 24
    ws.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=3)
    tot_header = ws.cell(row=current_row, column=1)
    tot_header.value = "RESUMEN DE CANTIDADES"
    tot_header.font = totals_font
    tot_header.fill = totals_header_fill
    tot_header.alignment = center_align

    totals = data.get("totals", {})
    if not totals:
        # Calcular automáticamente desde la lista si no vienen explícitos
        totals = {}
        for p in players:
            prod = p.get("producto", "Uniforme").strip().upper()
            qty = int(p.get("cantidad", 1))
            totals[prod] = totals.get(prod, 0) + qty

    current_row += 1
    for prod_key, count in totals.items():
        ws.row_dimensions[current_row].height = 20
        cell_lbl = ws.cell(row=current_row, column=1)
        cell_lbl.value = str(prod_key).upper()
        cell_lbl.font = totals_font
        cell_lbl.border = border_cell
        cell_lbl.alignment = left_align

        cell_val = ws.cell(row=current_row, column=2)
        cell_val.value = count
        cell_val.font = totals_font
        cell_val.border = border_cell
        cell_val.alignment = center_align
        current_row += 1

    # 6. Ajustar ancho de columnas
    col_widths = {
        1: 16, # Producto
        2: 14, # No. Jugador
        3: 28, # Nombre
        4: 10, # Talla
        5: 10, # Cantidad
        6: 12, # Manga
        7: 14, # Género
        8: 26  # Arquero/Comentario
    }
    for col_idx, width in col_widths.items():
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = width

    # 7. Insertar Imágenes Dimensionadas (Columna J en adelante)
    image_paths = data.get("image_paths", [])
    img_start_col = "J"
    img_start_row = 2

    for img_idx, img_path in enumerate(image_paths):
        if not os.path.exists(img_path):
            continue

        try:
            # Redimensionar manteniendo aspecto (máx 450x450 para encajar bien)
            pil_img = PILImage.open(img_path)
            max_size = (450, 450)
            pil_img.thumbnail(max_size, PILImage.Resampling.LANCZOS)
            
            # Guardar versión optimizada temporal si es necesario
            temp_img_path = img_path + f"_resized_{img_idx}.png"
            pil_img.save(temp_img_path)

            img_to_add = OpenPyXlImage(temp_img_path)
            anchor_cell = f"{img_start_col}{img_start_row + (img_idx * 22)}"
            ws.add_image(img_to_add, anchor_cell)

            # Etiqueta de la imagen
            ws[f"{img_start_col}{img_start_row + (img_idx * 22) - 1}"] = f"BOCETO / ARTE DE IMPRESIÓN #{img_idx+1}"
            ws[f"{img_start_col}{img_start_row + (img_idx * 22) - 1}"].font = meta_label_font
        except Exception as e:
            print(f"[WARN] No se pudo procesar la imagen {img_path}: {e}")

    # Guardar workbook
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    wb.save(output_path)
    print(f"[SUCCESS] Excel de impresión generado correctamente en: {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Generador de Excel de Impresión Life Deportes")
    parser.add_argument("--data-json", help="Ruta al JSON con la información del pedido o string JSON", required=True)
    parser.add_argument("--output", help="Ruta absoluta del archivo .xlsx a generar", required=True)

    args = parser.parse_args()

    if os.path.exists(args.data_json):
        with open(args.data_json, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = json.loads(args.data_json)

    create_print_excel(data, args.output)

if __name__ == "__main__":
    main()
