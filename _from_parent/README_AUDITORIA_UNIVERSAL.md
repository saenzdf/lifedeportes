# Life Deportes - Auditoría de Impresión Universal

Este paquete contiene la skill y los scripts necesarios para realizar la auditoría de archivos de impresión (PDF) contra listados de tallas (Excel), compatible con Windows y macOS.

## Contenido del Zip:
1.  **`.agent/skills/life-auditoria-impresion/`**: Definición de la skill para Antigravity.
2.  **`scripts/ui_file_picker.py`**: Selector visual de archivos (Windows/Mac).
3.  **`scripts/life_deportes/`**: Motores de comparación y visión OCR.

## Instrucciones de Instalación:
1.  Extrae el contenido en la raíz de tu proyecto Antigravity.
2.  Asegúrate de tener instaladas las dependencias de Python:
    ```bash
    pip install pandas openpyxl pymupdf pytesseract pillow
    ```
3.  Si usas el motor de visión (Gemini), asegúrate de tener la variable `GEMINI_API_KEY` en tu archivo `.env`.

## Uso:
Dile a Antigravity: *"Ejecuta la auditoría de impresión"*.
