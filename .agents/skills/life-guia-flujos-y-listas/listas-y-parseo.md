# Manual de Parseo de Listas de Pedidos (Life Deportes)

El parseo de listas es el proceso de convertir la información desestructurada enviada por los clientes (en Excel, Word, imágenes o PDF) en una estructura de datos normalizada y en un formato HTML estándar que se escribe en Odoo (`sale.order.note` y `project.task.description`).

---

## 1. El Formato Estándar HTML de Salida

Toda lista parseada debe convertirse en un bloque HTML limpio generado mediante la función estandarizada `buildOdooOrderNoteHtml`.

### Reglas de Fidelidad HTML (Hard Rules)
- **CERO Precios o Datos de Contacto**: No incluir precios unitarios, totales, abonos, nombres de clientes ni teléfonos.
- **Sin Inventar Datos**: No agregar dorsales, nombres o especificaciones (como "Delantera/Trasera") que no vengan explícitamente en la lista original.
- **Agrupación Limpia**:
  1. Resumen de prendas (Cantidades por tipo y manga).
  2. Anotación de Arquero (si aplica, indicando colores invertidos).
  3. Tablas detalladas agrupadas por **Género** → **Producto** → **Manga**.

---

## 2. Tipos de Listas y Métodos de Parseo

### Caso A: Excel FORMATO PEDIDO LIFE (`.xlsx`)
Es el formato oficial de la empresa.

- **Pestaña obligatoria**: Leer **únicamente** la pestaña llamada `formato life`. Ignorar `Hoja1`, `Hoja2`, etc.
- **Estructura de Columnas**:
  - `No.` (Columna A): Es un **índice de fila** si existe la columna `NUMERO`. Si no existe columna `NUMERO`, se puede tratar como dorsal.
  - `NOMBRE` (Columna B): Nombre de personalización que irá en la espalda.
  - `TALLA` (Columna C): Talla (ej. 4, 8, 12, XS, S, M, L, XL, XXL).
  - `CANTIDAD` (Columna D): **CRÍTICO**. Si esta columna existe y tiene valor (ej. 3), representa **3 unidades** para esa misma fila. La suma total de unidades del pedido es la **suma de los valores de CANTIDAD**, no el número de filas.
  - `MANGA` (Columna E): Especifica si es manga corta o larga. Puede contener combinaciones compuestas como `2 LARGA+1 CORTA` o `3 LARGA`.
  - `MAS` / `FEM` (Columnas F y G): Definen si el bloque pertenece a Masculino o Femenino.
  - `Camiseta (X)` / `Uniforme (X)` (Columnas H e I): Tipifican la prenda de esa fila específica.
  - `NUMERO`: Número de dorsal real que se imprimirá en la camiseta.
  - `Arquero` (Columna J o comentario): Marca si la fila corresponde al guardameta.
- **Parseador en código**: `kapso/functions/lib/parse_life_excel.js`.

### Caso B: Word Día de la Familia (`.docx`)
Usado en eventos corporativos y colegiales.

- **Estructura**: La lista no viene ordenada por talla sino **por familia** (`Familia CRISTOFER`, etc.).
- **Parseo**: Agrupa primero un resumen general por producto (uniforme niños, camiseta dama, camiseta caballero) y luego genera una tabla HTML por cada familia.
- **Parseador en código**: `kapso/functions/lib/parse_family_day_docx.js`.

### Caso C: Excel Libre / Genérico (`.xlsx` / `.csv`)
Tablas creadas libremente por los clientes.

- Se deben mapear dinámicamente los encabezados buscando coincidencias para:
  - Nombre / Jugador
  - Talla
  - Dorsal / Número
  - Manga / Observaciones
- Si hay dudas con los encabezados, la columna numérica aislada suele ser el dorsal y el texto la talla/nombre.

### Caso D: Imágenes de Listas (Listas Manuscritas o Capturas)
Fotos de hojas escritas a mano, cuadernos o capturas de chat.

1. Se utiliza visión por computadora (IA) para transcribir la imagen a un JSON intermedio con la estructura:
   ```json
   [
     { "nombre": "CARLOS", "talla": "M", "numero": "10", "manga": "corta", "observacion": "" }
   ]
   ```
2. Se valida la coherencia visual (ej. verificar si hay nombres repetidos o dorsales duplicados).
3. Se procesa con `buildOdooOrderNoteHtml` para generar el HTML final.

### Caso E: PDFs de Impresión / Imprimibles (Auditoría QC)
Archivos PDF que envía el área de diseño para producción.

- Muchos PDFs de impresión son **solo gráficos** (sin capa de texto seleccionable).
- **Proceso de OCR local**:
  1. Se rasteriza el PDF a imágenes de alta resolución usando `PyMuPDF` (fitz).
  2. Se ejecuta OCR mediante **Tesseract** (`spa+eng`) o el modelo de visión **Gemini v3** (`extract_print_pdf_v3.py`).
  3. Se extrae la lista de `(nombre, talla, dorsal)`.
  4. Se ejecuta una **comparación cruzada** (Print QC) entre la lista parseada del Excel y la lista del PDF imprimible.
  5. Se valida el modo `dorsal` (nombre + dorsal) y las reglas de equivalencias tipográficas (ej. `SOFIA M.` vs `SOFIA M`).

---

## 3. Resumen de Flujos de Parseo en Código

| Tipo de Insumo | Parser Principal | Script Ejecutable Local |
|----------------|------------------|-------------------------|
| Excel `formato life` | `parse_life_excel.js` | `node kapso/scripts/sync_lista_pedido_to_odoo.js --file="..."` |
| Word `Día de la Familia` | `parse_family_day_docx.js` | `node kapso/scripts/sync_lista_pedido_to_odoo.js --file="...docx"` |
| PDF Imprimible (OCR) | `extract_print_pdf_local.py` / `extract_print_pdf_v3.py` | `python scripts/compare_list_pdf_local.py --task ID` |
