---
name: life-auditoria-impresion
description: "Ejecuta la auditoría local de impresión (Windows/Mac). Selecciona archivos visualmente y compara piezas de ropa (mangas, dorsales, tallas externas) de mayor a menor."
---

# Life Auditoría de Impresión (Universal)

## Cuándo usar
Usa esta skill cuando necesites comparar un **Excel de tallas** contra un **PDF de impresión** (arte de sublimación) que contiene piezas despiezadas (mangas, dorsales, etc.).

## Flujo de Trabajo

### 1. Selección de Archivos (Visual)
Antigravity abrirá ventanas nativas para que selecciones los archivos. No necesitas escribir rutas.

**Paso 1: Seleccionar Excel**
```bash
python scripts/ui_file_picker.py "Selecciona el Excel de Tallas" "*.xlsx;*.xls"
```

**Paso 2: Seleccionar PDF**
```bash
python scripts/ui_file_picker.py "Selecciona el PDF de Impresión" "*.pdf"
```

### 2. Pautas de Auditoría Aplicadas
El sistema ya conoce las siguientes reglas de diseño para Life Deportes:
- **Jerarquía de tallas**: El archivo viene ordenado de la talla más grande (Adulto) a la más pequeña (Niño).
- **Tallas Externas**: La talla se busca fuera del área de impresión (en los bordes o etiquetas de corte).
- **Zonas de Interés**:
  - **Dorsales**: Para nombres y números de camisetas.
  - **Laterales/Ruedo**: Para nombres y números en pantalones o pantalonetas.

### 3. Ejecución de la Auditoría
Una vez seleccionados los archivos, Antigravity ejecutará el motor de visión:

```bash
python scripts/life_deportes/compare_list_pdf_local.py \
  --list-file "<Ruta_Excel>" \
  --print-pdf "<Ruta_PDF>" \
  --pdf-source vision \
  --compare-mode dorsal
```

### 4. Resultados
El sistema entregará un reporte detallando:
- Coincidencias exactas.
- Advertencias (ej: tallas que no coinciden pero el nombre sí).
- Errores críticos (ej: nombres o números que faltan en el PDF).
