# Referencia — Odoo Studio Automations (Life Deportes)

## Checklist de pruebas

- [ ] Regla dispara solo cuando cumple dominio (no en otras etapas/campos)
- [ ] Execute Code no rompe por safe_eval (sin import/lambda)
- [ ] Acción idempotente si se guarda dos veces el registro
- [ ] Adjuntos/formatos no objetivo permanecen intactos
- [ ] Log en `ir.logging` (`log()`) o chatter si aplica
- [ ] Probado en **test** antes de **prod**

## Plantilla doc `docs/odoo/`

```markdown
# [Nombre] — Odoo 19 Studio

## Trigger de negocio
[Cuándo debe ejecutarse en lenguaje operativo]

## Configuración
| Campo | Valor |
| Modelo | … |
| Trigger | … |
| Apply on | … |
| Acción | Execute Code / Send Webhook / Manual |

## Código / payload
…

## Ids por instancia
| Instancia | base.automation | ir.actions.server |
| Test | … | … |
| Prod | … | … |

## Pruebas
1. …
```

## MCP: inventario antes de borrado

```python
# 1. Etapas
stages = execute('project.task.type', 'search_read',
    [('name', 'ilike', '<nombre etapa>')],
    fields=['id', 'name', 'project_ids'])

# 2. Tareas (paginar si hace falta)
tasks = execute('project.task', 'search_read',
    [('stage_id', 'in', [s['id'] for s in stages])],
    fields=['id', 'name', 'stage_id'], limit=500)

# 3. Adjuntos objetivo
task_ids = [t['id'] for t in tasks]
attachments = execute('ir.attachment', 'search_read',
    [('res_model', '=', 'project.task'), ('res_id', 'in', task_ids),
     ('name', 'ilike', '%.cdr')],
    fields=['id', 'name', 'res_id', 'file_size'])
```

## Código Execute Code — plantillas

### Borrar adjuntos por extensión (tarea)

```python
for task in records:
    attachments = env['ir.attachment'].search([
        ('res_model', '=', 'project.task'),
        ('res_id', '=', task.id),
        ('name', 'ilike', '%.cdr'),
    ])
    for att in attachments:
        if (att.name or '').lower().endswith('.cdr'):
            log('CDR eliminado: %s (task %s)' % (att.name, task.id))
            att.unlink()
```

### Mensaje en chatter

```python
for task in records:
    task.message_post(
        body='<p>Mensaje</p>',
        subtype_xmlid='mail.mt_note',
        body_is_html=True,
    )
```

## Webhook Print QC (solo si lógica externa)

Modelo `project.task` o `ir.attachment`, acción **Send Webhook**. Ver `kapso/docs/PRINT_QC_ODOO19_STUDIO_SETUP.md` — no copiar a automatizaciones internas.

## Skills relacionados (leer según tarea)

| Skill | Cuándo leer |
|-------|------------|
| `odoo-development` | ORM, módulos, security, arquitectura |
| `python-odoo-cursor-rules` | Estilo Python, decoradores, automated actions genéricas |
| `odoo-studio-automations` | Reglas Studio Life Deportes, triggers, preguntas obligatorias |

## Errores frecuentes

| Error | Causa | Solución |
|-------|-------|----------|
| safe_eval SyntaxError | `import`, `lambda`, `filtered(lambda` | Bucles `for` explícitos |
| Regla no dispara | Trigger incorrecto | `on_stage_set` vs `on_create_or_write` |
| Id etapa wrong | Copiar test en prod | MCP `project.task.type` en cada instancia |
| M2M link falla | `create` devuelve `[id]` | Pasar entero al `(4, 0, id)` |
| Borró de más | Dominio amplio | Acotar `filter_domain` + validar en código |
