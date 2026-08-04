---
name: life-auditoria-impresion
description: "Ejecuta la auditoría local de impresión. Abre selectores de archivos visuales para que el usuario escoja el Excel y el PDF, y luego realiza la comparación cruzada de tallas y dorsales."
---

# Life Auditoría de Impresión (Local)

## Cuándo usar
Usa esta skill cuando el usuario te pida **auditar, comparar o revisar un archivo de impresión** contra un listado Excel en su computadora local.

## Flujo de Trabajo

### 1. Solicitar Archivos de forma Visual (Mac)
No le pidas al usuario que escriba la ruta del archivo. En su lugar, ejecuta los siguientes comandos de terminal (`osascript`) para abrir una ventana nativa de Mac donde el usuario pueda elegir el archivo con el mouse.

**Paso 1: Pedir el Excel**
Ejecuta el siguiente comando para obtener la ruta del Excel:
```bash
osascript -e 'POSIX path of (choose file with prompt "Selecciona el archivo Excel de Tallas" of type {"org.openxmlformats.spreadsheetml.sheet", "com.microsoft.excel.xls"})'
```
Guarda la ruta resultante.

**Paso 2: Pedir el PDF Imprimible**
Ejecuta el siguiente comando para obtener la ruta del PDF:
```bash
osascript -e 'POSIX path of (choose file with prompt "Selecciona el archivo PDF de Impresión" of type {"com.adobe.pdf"})'
```
Guarda la ruta resultante.

*Nota: Si el usuario cancela la selección, la terminal devolverá un error. En ese caso, avísale al usuario.*

### 2. Ejecutar la Auditoría
Una vez que tengas ambas rutas absolutas, dirígete a la carpeta `life deportes/lifedeportes/kapso` y ejecuta el script de auditoría activando el entorno virtual.

Comando a ejecutar:
```bash
cd "ruta/a/life deportes/lifedeportes/kapso"
. .venv-pdf/bin/activate
python scripts/compare_list_pdf_local.py \
  --list-file "<Ruta_del_Excel>" \
  --print-pdf "<Ruta_del_PDF>" \
  --pdf-source vision \
  --compare-mode dorsal \
  --zoom 2 \
  --max-side 4000
```
*(Asegúrate de reemplazar `<Ruta_del_Excel>` y `<Ruta_del_PDF>` por las rutas obtenidas en el paso 1).*

### 3. Presentar Resultados
El script generará un resultado en la consola (JSON o texto). Analiza la salida y entrégale al usuario un reporte claro y humano:
- **Estado general:** ¿Todo coincide (`ok`), hay advertencias (`warn`) o hay diferencias críticas (`diff`)?
- **Detalle de errores:** Si hay discrepancias en dorsales, nombres faltantes o errores de OCR, lístalos claramente para que el usuario sepa qué corregir en el arte antes de enviarlo a producción.
