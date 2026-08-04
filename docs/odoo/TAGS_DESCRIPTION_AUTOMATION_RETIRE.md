# Tags → descripción (retirada)

## Problema

La automatización **Tags en la descripción de una tarea** (`base.automation` **17**, acción **1443**) reemplazaba `project.task.description` con:

```html
<p>Tipo de corte: Corte laser, …</p>
```

o la vaciaba si no había tags. Eso borraba la lista HTML subida por Kapso / staff.

Las etiquetas **siguen siendo necesarias** para Fabricación Javier/Paola (leen `tag_ids`). Solo se desactiva esta regla.

## Qué hacer

```bash
cd projects/lifedeportes
python scripts/disable_tags_description_automation.py prod
```

Conservar: **Copiar nota y adjuntos SO a tarea** (automation 25) — copia `sale.order.note` → description solo si está vacía.

## Estado

| Fecha | Acción |
|-------|--------|
| 2026-07-27 | **Prod:** automation 17 `active=False` (verificado). SA 1443 no borrada. |
