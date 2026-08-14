---
name: life-excel-impresion
description: "Genera dinámicamente el archivo Excel de Impresión (.xlsx) estandarizado de Life Deportes a partir de la lista del pedido, descargando e insertando automáticamente las imágenes/mockups del boceto asociadas a la Tarea o Presupuesto de Odoo."
---

# Skill: Life Excel de Impresión (`life-excel-impresion`)

Esta skill automatiza la creación del **Archivo Excel de Impresión (.xlsx)** para producciones de Life Deportes. Toma la información del pedido (interpretada desde texto, mensajes de WhatsApp, PDF, Word o Excel borrador del cliente) e inserta automáticamente los bocetos/artes descargados desde los adjuntos de Odoo (`ir.attachment`), generando una tabla estructurada para el taller de producción.

---

## Flujo de Trabajo Operativo

### 1. Obtención de Datos del Pedido
El agente Antigravity extrae o solicita la siguiente información:
- **ID de Tarea / Pedido Odoo:** Ej. `2900` o `S02900`.
- **Nombre del Cliente / Equipo:** Ej. `CARLOS MARIO GONZALEZ`.
- **Detalles Técnicos:**
  - Deporte / Disciplina (Fútbol, Voleibol, Baloncesto, etc.)
  - Tipo de Cuello (Cuello Redondo, Cuello V, Cuello Camisero, etc.)
  - Color de Medias / Pantaloneta
  - Observaciones especiales (ej. "Arquero color rosa", "Escudo bordado")
- **Lista de Jugadores:**
  - `Producto` (Uniforme, Camiseta sola, Sudadera, etc.)
  - `No. Jugador` / `Número`
  - `Nombre en Uniforme`
  - `Talla` (Infantiles 12, 14, 16 / Adultos XS, S, M, L, XL, XXL)
  - `Cantidad`
  - `Manga` (Corta / Larga)
  - `Género` (Masculino / Femenino)
  - `Es arquero?` (Sí / No)

*(Puedes apoyarte en la guía `life-guia-flujos-y-listas` para parsear la lista si viene en un archivo no estructurado).*

---

### 2. Descargar Boceto / Arte de Impresión desde Odoo
1. Usa el MCP de Odoo (`odoo-mcp-multi-instance`) para consultar los adjuntos (`ir.attachment`) asociados al registro de la Tarea (`project.task`) o Venta (`sale.order`):
   ```python
   attachments = search_read(
       "ir.attachment",
       domain=[["res_model", "=", "project.task"], ["res_id", "=", task_id]],
       fields=["id", "name", "mimetype", "datas"]
   )
   ```
2. Filtra las imágenes (`mimetype` que inicie por `image/` o nombres con `.png`, `.jpg`, `.jpeg`).
3. Descarga y guarda las imágenes localmente en la carpeta del cliente o en una ruta temporal (ej: `C:\Users\USUARIO\Desktop\temp_bocetos\`).

---

### 3. Generar el Excel de Impresión
Ejecuta el script Python `generate_print_excel.py` utilizando el entorno virtual del proyecto:

```powershell
& "c:\Users\USUARIO\Documents\life deportes\mcp-odoo-main\venv\Scripts\python.exe" "c:\Users\USUARIO\Documents\life deportes\.agents\skills\life-excel-impresion\scripts\generate_print_excel.py" --data-json "<Ruta_Al_JSON_o_Data>" --output "<Ruta_Destino_Excel.xlsx>"
```

#### Estructura esperada en `--data-json`:
```json
{
  "header": {
    "title": "[2900] CARLOS MARIO GONZALEZ",
    "deporte": "Fútbol",
    "cuello": "Cuello Redondo",
    "medias": "Rosa",
    "observaciones": "ARQUERO COLOR ROSA"
  },
  "players": [
    {
      "producto": "Uniforme",
      "numero": 1,
      "nombre": "FEDERICO",
      "talla": "S",
      "cantidad": 1,
      "manga": "Corta",
      "genero": "Masculino",
      "es_arquero": "Sí"
    }
  ],
  "totals": {
    "UNIF.": 18,
    "CAM.": 1
  },
  "image_paths": [
    "C:\\Users\\USUARIO\\Desktop\\temp_bocetos\\boceto_frente.png"
  ]
}
```

---

### 4. Adjuntar Excel a Odoo (Opcional / Recomendado)
Subir el archivo `.xlsx` generado a la Tarea de Odoo en `ir.attachment` codificando el archivo en base64:
```python
create("ir.attachment", {
    "name": "2900_CARLOS_MARIO_GONZALEZ_IMPRESION.xlsx",
    "res_model": "project.task",
    "res_id": task_id,
    "datas": base64_content,
    "mimetype": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
})
```

---

## Verificación de Resultados
- Confirma que el Excel contenga la tabla de jugadores limpia, los totales de prendas calculados y los bocetos/artes insertados y legibles a un lado de la tabla.
- Presenta al usuario la ruta del archivo generado y confirma su subida a Odoo.
