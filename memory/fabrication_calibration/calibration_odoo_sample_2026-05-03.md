# Calibración Odoo (lista vs PDF, visión Gemini) — 2026-05-03

- **Instancia:** Odoo Life Soluciones (mismas credenciales que `.env` en `lifedeportes/`, sin despliegue a Kapso).
- **Criterio de tareas:** etapa **Fabricación**; proyecto **Proyecto Paola** (`project_id=9`, `project.task.type` “Fabricación” id **36**); **Javier Proyecto** (`project_id=8`, etapa “Fabricación” id **32**). Sólo tareas con **.xlsx/.json** y **.pdf** en adjuntos de la tarea.
- **Comparador:** `compare_list_pdf_local.py --pdf-source vision --compare-mode dorsal --zoom 2 --max-side 4000`, `PRINT_QC_NAME_NORMALIZE` activo (default). Sin archivo de equivalencias.
- **Salidas JSON brutas:** `memory/fabrication_calibration/calibration_run_2026-05-03/json/task_<id>.json`

## Muestra 2+2 (ids elegidos)

| Proyecto        | `task_id` | Nombre tarea (Odoo)        | `qc`   | Nota breve |
|-----------------|-----------|----------------------------|--------|------------|
| Proyecto Paola  | **1648**  | [S01777] SEGUROS Y FIANZA  | `diff` | Visión asigna nombre de equipo “1SEGUROS” a muchas filas; no matchea apellidos del Excel. |
| Proyecto Paola  | **1659**  | [S01788] PINIMA            | `diff` | 6 vs 6 filas; desajuste de **dorsal ↔ apellido** entre Excel y lectura de la grilla. |
| Javier Proyecto | **1626**  | [S01755] CRIS RUZ          | `warn` | Clave dorsal OK; **talla** ausente en PDF (visión) en varias filas. |
| Javier Proyecto | **1719**  | [S01850] FERNANDO ALVEAR   | `diff` | **0 filas** extraídas del PDF por visión (artefacto de pantalones / plantilla). |

---

## Detalle por tarea

### 1648 — Proyecto Paola — [S01777] SEGUROS Y FIANZA

- **Lista:** `FORMATO PEDIDO LIFE 1SEGUROS CATALANES FC.xlsx` (adj. 20474)  
- **PDF:** `ORDEN DE TRABAJO 1777 SEGUROS Y FIANZA CAM.pdf` (adj. 21666)  
- **Conteos:** Excel 34 filas · PDF (visión) 39 filas  
- **qc:** `diff`  
- **Resumen:** El modelo devuelve con frecuencia el texto **“1SEGUROS”** como `nombre_uniforme` junto con dorsales, en lugar de los nombres completos del Excel. Heurística: pares `missing`/`extra` con mismo dorsal quedan como **`review`** (no es un simple typo de una letra).  
- **Revisión sugerida:** Decidir si hace falta **prompt** (ignorar prefijos de patrocinio / leer bloque de nombres) o **recorte de región** en el pipeline de visión para esta plantilla.

### 1659 — Proyecto Paola — [S01788] PINIMA

- **Lista:** `FORMATO PEDIDO LIFE 1 (1) (7) PINIMA LISTADO FINAL.xlsx` (adj. 20852)  
- **PDF:** `PINIMA 1788 1.pdf` (adj. 21275)  
- **Conteos:** 6 · 6  
- **qc:** `diff`  
- **Resumen:** Coincidencia de filas pero **dorsales cruzados** (ej. Excel GOMEZ #1 vs visión GOMEZ #5). Indica confusión de columnas o orden de lectura en la rejilla.  
- **Revisión sugerida:** Validar manualmente PDF vs Excel para una fila; valorar **orden en prompt** o plantilla específica PINIMA.

### 1626 — Javier Proyecto — [S01755] CRIS RUZ

- **Lista:** `FORMATO PEDIDO (63) CRIS RUZ PEDIDO 2.xlsx` (adj. 20295)  
- **PDF:** `cris ruz 1755.pdf` (adj. 20324)  
- **Conteos:** 7 · 7  
- **qc:** `warn`  
- **compare.dorsal:** `ok` (sin missing/extra por nombre+dorsal).  
- **talla_mismatches:** 7 entradas — en todas **`talla_pdf` vacía** frente a talla en Excel (`talla_missing_pdf`). Coherente con visión que no rellena talla en esta pasada.  
- **Revisión sugerida:** Aceptable como **advertencia de talla**; confirmar si el arte muestra talla clara por espalda.

### 1719 — Javier Proyecto — [S01850] FERNANDO ALVEAR

- **Lista:** `FORMATO PEDIDO INICIAL LIFE (6) FERNANDO ALVEAR.xlsx` (adj. 21261)  
- **PDF:** `FERNANDO ALVEAR 1850 PANT..pdf` (adj. 21749)  
- **Conteos:** Excel 21 · PDF 0 filas parseadas  
- **qc:** `diff`  
- **alarma:** `pdf_text_empty` — la API de visión devolvió `rows` vacías o sin nombres válidos.  
- **Revisión sugerida:** PDF posiblemente **no es camiseta / rejilla de espaldas** (pantalones); puede requerir **otro motor**, segunda página, o exclusión de este tipo de adjunto en QC automático.

---

## Resumen ejecutivo para feedback manual

| task_id | qc    | ¿Nombre+dorsal útil? | Principal problema observado |
|---------|-------|----------------------|------------------------------|
| 1648    | diff  | No                   | Texto “1SEGUROS” como nombre en visión. |
| 1659    | diff  | Parcial              | Cruce de dorsales entre apellidos. |
| 1626    | warn  | Sí                   | Talla no leída en PDF (solo nombre+dorsal). |
| 1719    | diff  | No                   | Sin filas del PDF (arte distinto a camiseta). |

Siguiente paso recomendado: indicar cuáles de estos **diff** son **aceptables operativamente** (p. ej. solo warn de talla) y cuáles requieren **cambio de prompt / filtro de adjuntos / equivalencias** antes de subir variables a Kapso.

---

## Seguimiento operador (post-calibración)

- **1719 — excluir como benchmark de camiseta:** el PDF es **pantalón/pantalóneta** (`…PANT..pdf`); las camisetas llegaron **por correo**. No usar esta tarea para medir el lector de rejilla de espaldas. *Idea futura:* si en el **chatter** el portal indica aprobación y nota de envío por **correo electrónico**, no aplicar lectura automática del PDF adjunto (el arte correcto puede no estar en la tarea).

- **1648 — no forzar QC automático global:** pedidos **empresa / corporativo** donde el Excel no refleja el mismo contrato que “lista por jugador” del arte; conviene **Server Action + botón** “Ejecutar QC lista vs PDF” cuando aplique, en lugar de disparar el webhook en cada evento. Ver [PRINT_QC_ODOO19_STUDIO_SETUP.md](../../kapso/docs/PRINT_QC_ODOO19_STUDIO_SETUP.md) opción manual.

- **Talla en el arte:** la talla suele ir **fuera de la zona imprimible/sublimable** (p. ej. letra **M** sobre el cuello en la pieza delantera). El prompt de visión v3 incorpora esta pista para mejorar `talla` en filas.
