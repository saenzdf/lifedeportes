# Casos de Prueba E2E — Incidentes Staff Odoo (SO 2861 y SO 2862)

## 1. Contexto del Incidente

- **Caso 1 (SO 2861 — Jaime Cabarcas / Inversión de Nombres):**
  - **Problema:** En la lectura de la lista del cliente o formato del staff, el parser o agente AI invirtió las columnas de Nombre y Dorsal/Apodo (ej. asignando el número o apodo a la columna de nombre y viceversa).
  - **Criterio de Aceptación:** El parser debe validar los tipos de datos (numérico/dorsal vs texto de nombre) y conservar la asignación correcta `nombre` ↔ `numero` sin importar el orden de las columnas en el texto o Excel.

- **Caso 2 (SO 2862 — Yei / Adjunto `image.png` Azul):**
  - **Problema:** Un adjunto genérico de imagen (`image.png`) que contenía un color plano (azul) enviado sin texto explícito de acompañamiento no fue registrado en `order_draft.attachments` ni subido a Odoo Chatter por la tool de adjuntos de Kapso.
  - **Criterio de Aceptación:** Toda imagen recibida en la ventana de ráfaga del staff (incluyendo nombres genéricos como `image.png` o fotos de muestras de color) debe ser clasificada y persistida vía `registrar_adjuntos_pedido` hacia Odoo.

---

## 2. Nuevos Casos de Prueba

| ID Caso | Nombre | Entradas / Inbound del Staff | Comportamiento Esperado | Criterio de Verificación |
|---|---|---|---|---|
| **E2E-STAFF-024** | Parseo de Lista con Columnas Invertidas (Dorsal antes de Nombre) | Staff envía lista en texto:<br>`10 - Carlos Perez - L`<br>`7 - Jaime Cabarcas - M`<br>`15 - Juan Gomez - XL` | `parsear_lista_texto_pedido` detecta que la primera columna son dorsales y la segunda son nombres.<br>Asigna `numero="10"`, `nombre="Carlos Perez"`, etc. | `order_draft.detail.rows[1]` contiene `nombre: "Jaime Cabarcas"` y `numero: "7"`. En Odoo `sale.order.note` y `project.task.description` no aparecen invertidos. |
| **E2E-STAFF-025** | Parseo de Lista Excel con Encabezados No Estándar (Apodo / Dorsal) | Staff adjunta Excel con columnas `[DORSAL, APODO/NOMBRE, TALLA]`. | `parsear_lista_excel_pedido` mapea `DORSAL` a `numero` y `APODO/NOMBRE` a `nombre`. | Filas parseadas correctamente sin cruzar apodos ni números en la nota HTML. |
| **E2E-STAFF-026** | Adjunto Genérico `image.png` Muestra de Color | Staff envía imagen `image.png` (muestra color azul) + mensaje *"Crear presupuesto para Jaime Cabarcas 10 uniformes azul"*. | `classify_order_attachments` detecta `image.png`, le asigna rol `design_reference` y genera `suggested_tools: ["registrar_adjuntos_pedido"]`. | `vars.order_draft.attachments` contiene `image.png` y se transfiere exitosamente al Chatter de Odoo al crear la SO. |
| **E2E-STAFF-027** | Múltiples Adjuntos con Nombres Genéricos y Lista de Texto | Staff envía `image.png`, `image_1.jpg` y texto con la lista en la misma ventana de burst (~10s). | `pickMediaFromContext` captura ambos adjuntos. El agente llama a `registrar_adjuntos_pedido` registrando ambas referencias de diseño y la lista de texto. | Ambos archivos quedan en Odoo y el borrador de pedido refleja 2 adjuntos de diseño y la lista procesada. |

---

## 3. Matriz de Ejecución y Validación Automatizada

```bash
# Para ejecutar las pruebas de regresión del agente staff de Kapso:
cd /Users/diego/Documents/Sync/projects/lifedeportes/kapso
node scripts/bundle_order_detail_tools.js
npm test -- --grep "E2E-STAFF-024|E2E-STAFF-026"
```
