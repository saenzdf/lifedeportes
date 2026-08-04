# Life Deportes - Skill Auditoría de Impresión Local

Este paquete contiene la skill `life-auditoria-impresion` diseñada para facilitar la comparación cruzada entre un listado Excel de tallas y un archivo PDF de impresión (sin capa de texto) en un entorno local (Mac) usando Antigravity.

## Contenido del Paquete
- **Carpeta `life-auditoria-impresion`**: Contiene la definición de la skill y las instrucciones para Antigravity.

## Instalación (Deployment) en Antigravity local

Para instalar esta skill en otro equipo con Antigravity, sigue estos pasos:

1. **Extraer**: Descomprime este archivo `.zip`.
2. **Ubicar Carpeta de Skills**: Navega a la carpeta de trabajo (workspace) donde Antigravity está configurado. Dentro de esa carpeta, busca o crea la ruta oculta `.agents/skills/`.
3. **Copiar**: Copia la carpeta `life-auditoria-impresion` dentro de `.agents/skills/`.

## Requisitos Previos en la Máquina Local
Esta skill utiliza un entorno Python específico para procesar los PDFs mediante OCR y herramientas nativas de Mac para seleccionar los archivos visualmente. Asegúrate de que la máquina tenga:

1. **macOS**: La skill utiliza `osascript` para abrir los selectores de archivos nativos de Mac.
2. **Entorno Python**: Debe existir el entorno `.venv-pdf` configurado en `lifedeportes/kapso/`.
    * Dependencias necesarias instaladas (Tesseract, PyMuPDF, etc. según `requirements-print-pdf.txt`).

## Uso (Cómo interactuar con la Skill)

El vendedor o usuario final no necesita buscar rutas complicadas de archivos. Solo debe pedirlo:

> *"Antigravity, por favor ejecuta la auditoría de impresión."*

**Flujo Automático:**
1. Antigravity lanzará una ventana emergente nativa de Mac pidiendo seleccionar el archivo Excel.
2. Inmediatamente después, abrirá otra ventana para seleccionar el archivo PDF.
3. Al recibir ambas confirmaciones, Antigravity correrá el script de OCR/Visión por detrás y presentará el reporte de inconsistencias directamente en el chat.
