# Calibración lista vs PDF (fabricación)

Coloca aquí **pares ya revisados por humano** (Excel/JSON de lista + PDF de impresión), uno por subcarpeta opcional o referenciados en el manifest del batch.

## Uso

Desde `lifedeportes/kapso` con `.venv-pdf` activado:

```bash
python scripts/batch_compare_print_qc_calibration.py \
  --manifest scripts/calibration_manifest.sample.json \
  --out-dir ../memory/fabrication_calibration/out
```

El script llama a `compare_list_pdf_local.py` con `--pdf-source vision` (requiere `GEMINI_API_KEY` en `.env`). Genera JSON por par y un `report.md` agregado con diff etiquetados (`likely_punctuation`, `likely_ocr`, `review`).

## Equivalencias opcionales

Para fusionar lecturas tipográficas confirmadas manualmente, edita `kapso/scripts/data/print_qc_name_equivalence.json` (o una copia) y apunta `PRINT_QC_NAME_EQUIVALENCE_PATH` en `.env`, o pasa `--equivalence-file` al comparador local.

Ejemplo de regla (no incluido en el repo por defecto):

```json
{
  "rules": [
    {
      "numero": "22",
      "equivalent_tokens": ["KARELYS O.", "KARELYS D."]
    }
  ]
}
```

En Kapso (Cloudflare Workers) no hay filesystem: usa la variable **`PRINT_QC_NAME_EQUIVALENCE_JSON`** con el mismo JSON como string.

## Producción

El trigger del webhook **no cambia**. Esta carpeta es solo para diseñar reglas y revisar diffs antes de activar normalización/equivalencias en producción.
