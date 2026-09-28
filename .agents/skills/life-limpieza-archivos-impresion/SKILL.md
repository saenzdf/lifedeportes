---
name: life-limpieza-archivos-impresion
description: "Audita y depura archivos de impresión PDF pesados y órdenes de trabajo en Odoo Life Deportes para liberar espacio en la base de datos, preservando intactos excels, imágenes de referencia y listas de clientes en tareas terminadas o canceladas."
---

# Life Limpieza de Archivos de Impresión (Odoo)

## Cuándo usar
Usa este skill cuando:
- El usuario solicite **limpiar, purgar o depurar archivos de impresión PDF** en Odoo Life Deportes.
- Se requiera liberar espacio en la base de datos de Odoo eliminando maquetas de plotter pesadas ya producidas.
- Se necesite una auditoría previa para saber cuántos GB o MB se pueden recuperar antes de aplicar cambios.

---

## Reglas de Negocio Estrictas

1. **Alcance exclusivo por etapa:**
   - Solo se evalúan tareas en etapa **`Hecho`** o **`Cancelado`** (`stage_id.name in ['Hecho', 'Cancelado']` o `state in ['1_done', '1_canceled']`).
   - Tareas en etapas activas (`Coordinación Diseño`, `Fabricación`, `Confección`, `Empacado`, etc.) **nunca se tocan**.
2. **Archivos protegidos (Inviolables):**
   - **Excels:** `.xlsx`, `.xls`, `.csv` jamás se eliminan.
   - **Imágenes:** `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif` jamás se eliminan (son fotos de referencia).
   - **Listas en PDF:** PDFs cuyos nombres indiquen listados de tallas, nombres o pedidos (`lista`, `listado`, `talla`, `tallas`, `nombre`, `nombres`, `planilla`, `camscanner`, `formulario`, `pedido de`) jamás se eliminan.
   - **Bocetos y Referencias en PDF:** PDFs con términos como `referencia`, `boceto`, `diseño`, `diseno`, `mockup`, `logo`, `escudo`, `muestra`, `paleta` jamás se eliminan.
3. **Criterios de Eliminación:**
   - **PDFs > 15 MB y > 4 meses:** Si un PDF pesa más de 15 MB y fue creado hace más de 4 meses en una tarea finalizada/cancelada (y no es lista/referencia protegida), se programa para borrado.
   - **PDFs de Maquetas / Impresión:** Órdenes de trabajo de sublimación y despieces de taller (`ORDEN DE TRABAJO*`, `* CAM.pdf`, `* PANT.pdf`, etc.) en tareas finalizadas/canceladas.
   - **PDFs de Documentos de Sistema:** Cotizaciones o pedidos generados (`Pedido - S0...`, liquidaciones) en tareas finalizadas/canceladas.

---

## Instrucciones de Ejecución

El script oficial se encuentra en:
`projects/lifedeportes/scripts/limpiar_archivos_impresion_odoo.py`

### 1. Auditoría / Simulación (Modo por defecto)
Siempre ejecutar primero en modo seguro para revisar el impacto y el espacio recuperable:

```bash
python3 projects/lifedeportes/scripts/limpiar_archivos_impresion_odoo.py --dry-run
```

### 2. Probar en una Tarea Específica
Para validar el comportamiento en un pedido o tarea puntual:

```bash
python3 projects/lifedeportes/scripts/limpiar_archivos_impresion_odoo.py --task-id <ID_DE_LA_TAREA> --dry-run
```

### 3. Ejecución Real (Eliminación)
Una vez revisado y confirmado el reporte con el usuario:

```bash
python3 projects/lifedeportes/scripts/limpiar_archivos_impresion_odoo.py --apply
```

### 4. Parámetros Disponibles

| Parámetro | Default | Descripción |
|---|---|---|
| `--dry-run` | `True` | Simula la clasificación y calcula el espacio sin borrar nada |
| `--apply` | `False` | Ejecuta el `unlink()` de los adjuntos en Odoo |
| `--task-id <id>` | Ninguno | Evalúa únicamente la tarea indicada |
| `--min-age-months <n>` | `4` | Antigüedad mínima en meses para la regla de archivos pesados |
| `--max-size-mb <n>` | `15.0` | Umbral en MB para la clasificación de archivos pesados |
| `--limit <n>` | `0` (todos) | Límite máximo de adjuntos a inspeccionar (para pruebas controladas) |
| `--batch-size <n>` | `50` | Cantidad de adjuntos eliminados por transacción XML-RPC / JSON-RPC |

---

## Auditoría y Manifiesto de Respaldo

Cada ejecución (tanto simulación como real) genera automáticamente un archivo JSON en:
`scratch/odoo_pdf_cleanup_manifest_<YYYYMMDD_HHMMSS>.json`

Este archivo contiene la lista completa con `id`, `name`, `size_mb`, `task_id` y categoría de todos los archivos evaluados y eliminados, sirviendo como registro de trazabilidad histórica.
