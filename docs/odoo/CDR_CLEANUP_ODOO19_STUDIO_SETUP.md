# Eliminar adjuntos .cdr en «Cobro y entrega» — Odoo 19 Studio

Limpieza de archivos CorelDRAW (`.cdr`) en tareas de proyecto al entrar a la etapa **Cobro y entrega**. La lógica corre **dentro de Odoo** (Execute Code); no usa Kapso ni webhooks externos.

## Trigger de negocio

- Cuando una **tarea** (`project.task`) pasa a la etapa **Cobro y entrega**, se eliminan todos los adjuntos `.cdr` vinculados directamente a esa tarea.
- Los demás formatos (PDF, Excel, etc.) **no** se tocan.
- Alcance: `ir.attachment` con `res_model='project.task'` y `res_id` = id de la tarea.

## Etapas en Life Deportes

| `project.task.type` id | Nombre | Proyecto |
|------------------------|--------|----------|
| 38 | Cobro y entrega | Javier Proyecto (id 8) |
| 39 | Cobro y entrega | Proyecto Paola (id 9) |

Ids **38** y **39** coinciden en test y producción (verificado jun 2026).

## Reglas activas

### Producción (`life-soluciones.odoo.com`)

| Campo | Valor |
|-------|-------|
| **Automatización** | `Eliminar .cdr Cobro y entrega` (`base.automation` id **20**) |
| **Acción servidor** | `Eliminar .cdr al entrar a Cobro y entrega` (`ir.actions.server` id **1536**) |
| **Modelo** | `project.task` |
| **Trigger** | `on_stage_set` |
| **Apply on** | `[('stage_id', 'in', [38, 39])]` |
| **Acción** | Execute Code |

### Test (`life-soluciones-test-saas19-0616.odoo.com`)

| Campo | Valor |
|-------|-------|
| **Automatización** | `Eliminar .cdr Cobro y entrega` (`base.automation` id **23**) |
| **Acción servidor** | `Eliminar .cdr al entrar a Cobro y entrega` (`ir.actions.server` id **1624**) |
| **Modelo** | `project.task` |
| **Trigger** | `on_stage_set` |
| **Apply on** | `[('stage_id', 'in', [38, 39])]` |
| **Acción** | Execute Code |

## Configuración manual en Studio (referencia)

Si hay que recrear la regla en otra instancia (p. ej. producción):

1. **Studio** → app **Proyecto** → abrir una **Task** → **Studio**
2. **Automations** → **New**
3. Nombre: `Eliminar .cdr Cobro y entrega`
4. **Trigger:** al establecer etapa (`on_stage_set` / *On stage set*)
5. **Apply on domain:** `[('stage_id', 'in', [<id_javier>, <id_paola>])]` — usar ids reales de esa base
6. **Actions to do** → **Execute Code**

### Código Python (safe_eval)

Copiar en la acción servidor. **Sin** `import`, **sin** lambdas en `filtered()`.

```python
for task in records:
    attachments = env['ir.attachment'].search([
        ('res_model', '=', 'project.task'),
        ('res_id', '=', task.id),
        ('name', 'ilike', '%.cdr'),
    ])
    for att in attachments:
        name = (att.name or '').lower()
        if name.endswith('.cdr'):
            log('CDR eliminado: %s (task %s, att %s)' % (att.name, task.id, att.id))
            att.unlink()
```

### Variables disponibles en Execute Code (Odoo 19)

`env`, `records`, `record`, `log(...)`, `UserError`, ORM (`search`, `unlink`), `time`, `datetime`, `dateutil`, `timezone`.

## Limpieza inicial del backlog (one-shot, jun 2026)

Operación puntual vía MCP/XML-RPC (no deja script en el repo):

### Producción

| Métrica | Valor |
|---------|-------|
| Tareas en Cobro y entrega | 426 |
| Tareas con .cdr | 130 |
| Adjuntos .cdr eliminados | 139 |
| Espacio liberado | ~1,85 GB |
| Log | `scratch/odoo_cdr_deletion_log_prod.json` |
| Inventario | `scratch/odoo_cdr_inventory_summary_prod.json` |

### Test

| Métrica | Valor |
|---------|-------|
| Tareas con .cdr en Cobro y entrega | 220 |
| Adjuntos .cdr eliminados | 231 |
| Espacio liberado | ~3,39 GB |
| Log | `scratch/odoo_cdr_deletion_log.json` |
| Inventario | `scratch/odoo_cdr_inventory_summary.json` |

Tras esta limpieza, la regla Studio mantiene el comportamiento en tareas futuras.

## Pruebas

1. Duplicar base test o usar tarea de prueba.
2. Subir un `.cdr` a una tarea en etapa anterior a Cobro y entrega.
3. Mover la tarea a **Cobro y entrega**.
4. Verificar que el `.cdr` desaparece y que PDF/Excel siguen en adjuntos.
5. Revisar `ir.logging` si se usó `log()` en la acción.

## Relación con otras automatizaciones del flujo

Patrón alineado con reglas existentes en `project.task`:

| Regla | Trigger | Dominio |
|-------|---------|---------|
| Fabricación Javier | `on_stage_set` | `stage_id = 32` |
| Fabricación Paola | `on_stage_set` | `stage_id = 36` |
| **Eliminar .cdr Cobro y entrega** | `on_stage_set` | `stage_id in (38, 39)` |

Print QC usa webhook Kapso; **esta regla no** — es solo Python interno en Odoo.

## MCP local (Cursor)

Dos servidores en [`.cursor/mcp.json`](../../.cursor/mcp.json):

| Servidor MCP | Instancia | Launcher | `ODOO_PREFIX` |
|--------------|-----------|----------|---------------|
| `odoo` | Test | `scripts/run-odoo-mcp.sh` | `LIFEDEPORTES` |
| `odoo-prod` | Producción | `scripts/run-odoo-mcp-prod.sh` | `LIFEDEPORTES_PROD` |

Credenciales en [`.env`](../../.env) (no commitear). Tras editar `.env`, reiniciar MCP en Cursor.

## Skill del agente

- Proyecto: [`.cursor/skills/odoo-studio-automations/`](../../.cursor/skills/odoo-studio-automations/SKILL.md)
- Público: [`skills-public/desarrollo-acciones-automatizadas-odoo/`](../../skills-public/desarrollo-acciones-automatizadas-odoo/)
- Personal: `~/.agents/skills/odoo-studio-automations/`
