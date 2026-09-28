# Kanban Kapso pedidos — Odoo 19 Studio

Proyecto **Kapso pedidos** (`project.project` id **12**, creado 2026-09-03). Mismo flujo de etapas que Paola/Javier, con regla de Fabricación propia y reuso de las automatizaciones que buscan etapa **por nombre**.

## Trigger de negocio

Pedidos que se fabriquen en este tablero (origen Kapso / bot) deben pasar por Coordinación Diseño → Fabricación → Confección → Empacado → Hecho, igual que Paola y Javier.

## Etapas (`project.task.type`)

| id | Nombre | sequence | fold | Proyecto |
|----|--------|----------|------|----------|
| 57 | Coordinación Diseño | 0 | no | Kapso pedidos (12) |
| 58 | Fabricación | 1 | no | 12 |
| 59 | Confección | 2 | no | 12 |
| 60 | Empacado | 3 | no | 12 |
| 61 | Hecho | 4 | sí | 12 |

No se reutilizan los ids de Paola/Javier: cada proyecto tiene sus propias etapas con el mismo nombre.

## Automatización nueva

| Campo | Valor |
|-------|-------|
| **Regla** | `Fabricación Kapso pedidos` (`base.automation` id **30**) |
| **Acción servidor** | `Fabricación Kapso pedidos` (`ir.actions.server` id **1591**) |
| **Modelo** | `project.task` |
| **Trigger** | `on_stage_set` |
| **Apply on** | `[('stage_id', '=', 58)]` |
| **Código** | Copia de **Fabricación Javier** (SA 1337): centros **Impresión / Corte láser / Empaque** (no «Corte láser Paola») |

No hay «Default diseñador Kapso». Si la tarea tiene `x_studio_diseador`, Fabricación asigna a esa persona; si no, no pone José ni Leyrol.

## Reglas existentes que ya aplican (por nombre de etapa / `project_id` de la OF)

| ID | Nombre | Por qué cubre Kapso |
|----|--------|---------------------|
| 4 | Renombrar Tarea proveniente de Servicio | Cualquier tarea con `sale_line_id` |
| 10 | cambio de etapa empacado | Busca etapa `ilike Empacado` en `mo.project_id` |
| 12 | Diseño enviado aprobación | Campo Studio, no por proyecto |
| 15 | Fechas de producción | `sale_order_id` |
| 18 | Etapa confección | Busca etapa `ilike Confección` en el proyecto de la OF |
| 20 | Eliminar .cdr Empacado | Dominio actualizado a `stage_id in [38, 39, 60]` |
| 25 | Copiar nota y adjuntos SO a tarea | `sale_order_id` |
| 29 | Mover tarea a Hecho al validar entrega | Busca etapa Hecho del `task.project_id` |

## Ids producción

| Instancia | Proyecto | Fabricación auto | Fabricación SA | Empacado stage |
|-----------|----------|------------------|----------------|----------------|
| Prod `lifedeportes.odoo.com` | 12 | 30 | 1591 | 60 |

## Pruebas

1. Crear tarea en **Kapso pedidos** con etiqueta Corte laser o Corte pieza a pieza y línea de SO.
2. Mover a **Fabricación** → debe crear OF (mismos centros que Javier) y no asignar diseñador si el campo está vacío.
3. Completar OF → tarea a **Empacado**; `.cdr` se borran.
4. Validar albarán de salida → tarea a **Hecho**.

Script one-shot: `scratch/setup_kapso_pedidos_kanban.py`.
