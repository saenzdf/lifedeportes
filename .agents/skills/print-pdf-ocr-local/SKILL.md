---
name: print-pdf-ocr-local
description: >-
  Leer PDFs de impresión Life sin capa de texto: rasterizar con PyMuPDF y OCR con
  Tesseract (script extract_print_pdf_local.py). Usar antes de integrar en Kapso.
disable-model-invocation: false
---

# PDF imprimible → texto / filas (local)

Muchos PDF que llegan como “imprimible” son **solo gráficos**: no hay texto seleccionable (`chars==0` con PyMuPDF). Ahí hace falta **OCR**.

## Requisitos de sistema

- **Tesseract**: `brew install tesseract tesseract-lang` (idiomas `spa`, `eng`, etc. en `/opt/homebrew/share/tessdata/`).
- Opcional: `TESSERACT_CMD` si el binario no está en PATH (p. ej. `/opt/homebrew/bin/tesseract`).

## Entorno Python (kapso)

Desde `life deportes/lifedeportes/kapso/`:

```bash
python3 -m venv .venv-pdf
. .venv-pdf/bin/activate
pip install -r scripts/requirements-print-pdf.txt
```

El directorio `.venv-pdf/` está en `.gitignore` del módulo kapso.

## Variables Odoo

Mismo `.env` que MCP / `test_print_qc_local.js`: `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD` (o `ODOO_LIFEDEPORTES_*`).

## Auditoría lista vs PDF (local)

Misma lógica que el webhook Kapso: por defecto **multiconjunto por nombre + dorsal** (`compare_mode: dorsal`), porque la talla en visión/OCR a veces falla. Modo estricto `full` = nombre + talla + dorsal. Con el mismo par Excel+PDF en disco (p. ej. `lifedeportes/memory/`):

```bash
cd life deportes/lifedeportes/kapso
. .venv-pdf/bin/activate
python scripts/compare_list_pdf_local.py \
  --list-file ../memory/CAMISETAS\ \(1\)\ norma\ ramos\ formato\ final.xlsx \
  --print-pdf ../memory/NORMA\ RAMOS\ 1880.pdf \
  --pdf-source vision --compare-mode dorsal --zoom 2 --max-side 4000
```

Desde Odoo con tarea:

```bash
TESSERACT_CMD=/opt/homebrew/bin/tesseract python scripts/compare_list_pdf_local.py --task 1748
```

Variables: `PRINT_QC_COMPARE_MODE` (`dorsal` | `full`), mismo default que Kapso. **Nombre en clave dorsal:** `PRINT_QC_NAME_NORMALIZE` (default `1`): quita el punto final tras inicial tipo `SOFIA M.` vs `SOFIA M` solo para la comparación, no corrige el Excel. **Equivalencias tipográficas confirmadas:** archivo JSON `PRINT_QC_NAME_EQUIVALENCE_PATH` (local) apuntando a `kapso/scripts/data/print_qc_name_equivalence.json`, o en Workers **`PRINT_QC_NAME_EQUIVALENCE_JSON`** con el mismo JSON inline (`rules[].equivalent_tokens` + `numero` opcional).

Salida JSON: `counts`, `qc` (`ok` | `warn` | `diff`), `compare`, `talla_mismatches`, `name_qc`, `pdf_pipeline`.

### Calibración fabricación (opcional)

Para iterar con ~5 pares ya revisados por humano **sin cambiar el trigger** del webhook de producción:

- Carpeta: `lifedeportes/memory/fabrication_calibration/` y manifest `kapso/scripts/calibration_manifest.sample.json`.
- Batch: `python scripts/batch_compare_print_qc_calibration.py --manifest scripts/calibration_manifest.sample.json --out-dir ../memory/fabrication_calibration/out`
- Genera un `report.md` y JSON por par con **heuristic_labels** (`likely_punctuation`, `likely_ocr`, `review`) para feedback.

El webhook en producción sigue siendo el mismo POST; solo se añaden env vars cuando validéis las reglas en calibración.

**Contexto artes Life:** en muchos PDFs el bloque visual va de **talla mayor a menor** (p. ej. adultos L/M y luego niños en talla numérica). Eso no afecta al JSON; el prompt de visión v3 lo recuerda. Varios jugadores con el **mismo dorsal** en categorías distintas es válido si en Excel también hay dos filas (claves dorsal = nombre + número).

## Uso del script

```bash
cd life deportes/lifedeportes/kapso
. .venv-pdf/bin/activate

# Si el PDF no tiene capa de texto, OCR automático (Tesseract)
python scripts/extract_print_pdf_local.py --task 1748 --mode auto

# Forzar solo OCR (probar calidad)
python scripts/extract_print_pdf_local.py --attachment 21893 --mode ocr --zoom 2 --lang spa+eng

# PDFs de arte muy altos: ya se limita el lado mayor (--max-side, por defecto 4500) para no reventar Tesseract.

# Afinado
python scripts/extract_print_pdf_local.py --task 1748 --mode ocr --psm 11          # texto disperso
python scripts/extract_print_pdf_local.py --task 1748 --mode ocr --ocr-engine lines # reconstrucción por líneas (experimental)
python scripts/extract_print_pdf_local.py --task 1748 --mode ocr --enhance          # autocontraste antes del OCR

# Parser de filas (por defecto merge = v1 + v2 en OCR)
python scripts/extract_print_pdf_local.py --task 1748 --mode ocr --parse merge   # recomendado
python scripts/extract_print_pdf_local.py --task 1748 --mode ocr --parse v1       # solo tres tokens / línea
python scripts/extract_print_pdf_local.py --task 1748 --mode ocr --parse v2       # solo heurística v2 (segmentación + ventana + regex)
```

Salida: JSON con `source`, `parse_stats` (`v1`, `v2`, `merged`), muestra de texto y filas `(nombre, talla, dorsal)`.

**Parser v2 (local):** segmenta ruido tipo `COLOMBIA`, ventana deslizante con límite de tokens por fila, regex global y descarta nombres que contienen dígitos sueltos (fusiones OCR malas).

## PDF reader v3 (`extract_print_pdf_v3.py`)

Solo el paso de **leer / interpretar** el PDF (sin Excel):

- **`--engine local`**: OCR por **regiones** (banda central, mitad inferior, franjas horizontales `--strips`, mitades izquierda/derecha) para imitar zonas de espalda en planillas; luego parsers v1+v2.
- **`--engine vision`**: se renderiza la página a **PNG** y se envía en **base64** vía API:
  - **Gemini (por defecto):** `GEMINI_API_KEY` o `GOOGLE_API_KEY`, `PRINT_QC_GEMINI_MODEL` (por defecto `gemini-2.5-flash`; `gemini-2.0-flash` puede responder 404 en cuentas nuevas). REST `generateContent` + `inline_data`.
  - **OpenAI:** `--vision-provider openai` + `OPENAI_API_KEY`, etc.
- **`--engine hybrid`**: local + visión (Gemini u OpenAI según `--vision-provider` y credenciales).

Referencias open-source alternativas: **Qwen2.5-VL / Qwen3-VL** (Apache-2, GPU); **PaddleOCR** layout.

```bash
python scripts/extract_print_pdf_v3.py --task 1748 --engine local --strips 6

export GEMINI_API_KEY=…   # o GOOGLE_API_KEY
python scripts/extract_print_pdf_v3.py --task 1748 --engine vision --gemini-model gemini-2.5-flash

# OpenAI
python scripts/extract_print_pdf_v3.py --task 1748 --engine vision --vision-provider openai
```

## Limitaciones

- La heurística de filas copia la idea de Kapso (`parsePdfLines`): **tres tokens finales** `… talla número`. En imprimibles con nombres curvos, varias columnas o mucho ruido gráfico, Tesseract devuelve texto útil pero **no siempre en una línea por jugador**; entonces `total_filas_heurísticas` puede seguir en 0 aunque el bloque OCR tenga nombres sueltos. Siguiente mejora: modelo de visión / layout por plantilla.
- Cuando el OCR + parsing sean estables para vuestros PDFs, se puede **empaquetar la misma lógica** en una Cloud Function Kapso. Este skill cubre solo el **desarrollo local**.
