---
name: odoo-studio-automations
description: >-
  Diseña e implementa acciones automatizadas de Odoo 19 Studio (base.automation,
  ir.actions.server, Execute Code) en Life Deportes. Pregunta modelo, trigger,
  instancia y tipo de acción antes de codificar. Consulta MCP, docs del repo y
  skills odoo-development. Usar cuando el usuario pida automatización en Odoo,
  Studio, regla al cambiar etapa, server action, safe_eval o flujo de proyecto.
---

# Odoo Studio — Acciones automatizadas (Life Deportes)

Guía para crear o modificar **automatizaciones en Odoo Online/Studio** en el entorno Life Deportes. El script **vive en Odoo** (`base.automation` + `ir.actions.server`), no en Kapso ni en scripts locales permanentes del repo.

## Antes de implementar: preguntas obligatorias

Si falta alguna respuesta, **preguntar al usuario** antes de escribir código o tocar la instancia.

| # | Pregunta | Por qué importa |
|---|----------|-----------------|
| 1 | **¿En qué modelo?** (`project.task`, `ir.attachment`, `sale.order`, …) | Define dónde se abre Studio y qué registros recibe `records` |
| 2 | **¿Cuál es el trigger?** (etapa, campo, creación, adjunto) | Determina `trigger` en `base.automation` |
| 3 | **¿Instancia test o producción?** | MCP `odoo` vs `odoo-prod`; ids de etapa pueden variar |
| 4 | **¿La lógica es interna en Odoo o externa?** | Execute Code vs Send Webhook (Kapso) |
| 5 | **¿Dominio / condición exacta?** (nombre etapa, campo Studio, mimetype) | `filter_domain` — **nunca asumir ids sin consultar live** |
| 6 | **¿Acción destructiva?** (borrar adjuntos, escribir masivo) | Exigir inventario MCP + confirmación antes de `unlink` |

Plantilla para el agente:

```
Para esta automatización necesito confirmar:
- Modelo: …
- Trigger: …
- Instancia: test / prod
- Acción: Execute Code / Webhook / botón manual
- Condición (dominio o etapa): …
```

## Dónde se configura (UI Studio)

Ruta estándar Life Deportes (igual para todas las reglas del flujo de proyecto):

1. Abrir la app del modelo (p. ej. **Proyecto**)
2. Abrir un registro representativo (p. ej. una **Task**)
3. **Studio** → pestaña **Automations** → **New**
4. Configurar trigger + dominio + acción
5. Guardar; documentar en `docs/odoo/<NOMBRE>_STUDIO_SETUP.md`

Para **botón manual** (sin regla automática): Studio → **Server Action** + botón en vista formulario.

## Triggers en Life Deportes (patrones reales)

Consultar siempre la instancia vía MCP antes de copiar ids. Ejemplos verificados en `project.task`:

| Regla | `trigger` | `filter_domain` (ejemplo) | Acción |
|-------|-----------|---------------------------|--------|
| Fabricación Javier | `on_stage_set` | `[('stage_id', '=', 32)]` | Execute Code |
| Fabricación Paola | `on_stage_set` | `[('stage_id', '=', 36)]` | Execute Code |
| Eliminar .cdr Cobro y entrega | `on_stage_set` | `[('stage_id', 'in', [38, 39])]` | Execute Code |
| Diseño enviado aprobación | `on_create_or_write` | campo `x_studio_diseo_enviado` | object_write / webhook |
| Fechas de producción | `on_create` | `[('sale_order_id', '!=', False)]` | Execute Code |
| Print QC (amarillo) | `on_create_or_write` | campo aprobación impresión | **Send Webhook** → Kapso |

### Elegir trigger

| Necesidad de negocio | Trigger recomendado |
|----------------------|---------------------|
| Al **entrar a una etapa** del proyecto | `on_stage_set` + dominio `stage_id` |
| Al **cambiar un campo** Studio | `on_create_or_write` + *When updating field* |
| Al **crear** un registro | `on_create` |
| Al **subir adjunto** | Modelo `ir.attachment`, `on_create` + dominio `res_model` / `mimetype` |
| Solo cuando el **usuario decida** | Server Action + botón (sin `base.automation`) |
| Lógica **fuera de Odoo** | Send Webhook (ver Print QC) |

**No mezclar:** si la acción es Python interno (`unlink`, `write`, `message_post`), usar **Execute Code**. Si la lógica corre en Kapso, usar **Webhook** — no duplicar en `kapso/` sin que el usuario lo pida.

## Execute Code — harness Python (Odoo 19 safe_eval)

El código de Studio **no es Python libre**. Leer también `python-odoo-cursor-rules` y docs Odoo 19 SaaS (Context7 `/websites/odoo_saas-19_1` → Automated Actions → Execute Code).

**Disponible:** `env`, `records`, `record`, `model`, `log(...)`, `UserError`, `time`, `datetime`, `dateutil`, `timezone`, `float_compare`, `Command`, ORM (`search`, `write`, `unlink`, `create`).

**Prohibido:** `import`, librerías externas, `re`, lambdas en `filtered()` (bloqueadas en safe_eval).

**Patrones del repo:**

```python
# Varias tareas (Fechas de producción, Eliminar .cdr)
for task in records:
    ...

# Una tarea (Fabricación — usa record)
if record and record.sale_line_id:
    ...
```

Antes de escribir Python, revisar una acción existente similar en `ir.actions.server` vía MCP (`state=code`, campo `code`).

## Flujo de trabajo del agente

```
- [ ] 1. Leer skills: odoo-development, python-odoo-cursor-rules (y este skill)
- [ ] 2. Responder preguntas obligatorias (modelo, trigger, instancia, acción)
- [ ] 3. MCP read-only: listar base.automation + ir.actions.server del modelo
- [ ] 4. MCP: resolver ids reales (project.task.type, campos x_studio_*)
- [ ] 5. Si destructivo: inventario → confirmación usuario → ejecutar
- [ ] 6. Crear/actualizar regla en Odoo (Studio UI o XML-RPC con cuidado)
- [ ] 7. Probar en test antes de prod (salvo urgencia explícita)
- [ ] 8. Documentar en docs/odoo/
```

## Consultas MCP (read-only)

Usar el servidor correcto según instancia (ver `.cursor/mcp.json`):

| MCP | Instancia | Variables `.env` |
|-----|-----------|------------------|
| `odoo` | Test | `ODOO_LIFEDEPORTES_*` |
| `odoo-prod` | Producción | `ODOO_LIFEDEPORTES_PROD_*` |

Sin MCP en sesión: `odoo_connector.get_client()` con credenciales explícitas del bloque correcto del `.env` — **nunca mezclar test y prod**.

```python
# Reglas existentes del modelo
base.automation.search_read(
    [('model_name', '=', 'project.task')],
    fields=['name', 'trigger', 'filter_domain', 'action_server_ids'],
)

# Código de acciones servidor
ir.actions.server.search_read(
    [('model_id.model', '=', 'project.task'), ('state', '=', 'code')],
    fields=['name', 'code'],
)

# Etapas por nombre
project.task.type.search_read(
    [('name', 'ilike', 'Cobro y entrega')],
    fields=['id', 'name', 'project_ids'],
)
```

`execute_method`: pasar dominio como **primer argumento**, no `[domain]` anidado (ver `odoo_connector.py`).

## Dónde consultar contexto en este proyecto

| Recurso | Ruta | Contenido |
|---------|------|-----------|
| Automatización .cdr (Execute Code) | `docs/odoo/CDR_CLEANUP_ODOO19_STUDIO_SETUP.md` | Etapas 38/39, código safe_eval, ids test/prod |
| Print QC (Webhook Kapso) | `kapso/docs/PRINT_QC_ODOO19_STUDIO_SETUP.md` | Trigger amarillo, adjunto PDF, Send Webhook |
| MCP test / prod | `.cursor/mcp.json`, `scripts/run-odoo-mcp.sh`, `scripts/run-odoo-mcp-prod.sh` | Launchers y prefijos |
| Credenciales | `.env` (no commitear), plantilla `.env.example` | `ODOO_LIFEDEPORTES_*` / `ODOO_LIFEDEPORTES_PROD_*` |
| Skill ORM / módulos | `~/.agents/skills/odoo-development/SKILL.md` | Modelos, decoradores, arquitectura |
| Skill Python Odoo | `~/.agents/skills/python-odoo-cursor-rules/SKILL.md` | Convenciones y automated actions |
| Docs Odoo 19 SaaS | Context7 MCP `/websites/odoo_saas-19_1` | Execute Code, triggers Studio |
| Auditorías one-shot | `scratch/odoo_cdr_*_prod.json`, `scratch/odoo_cdr_audit*.json` | Logs de limpiezas previas |

## Crear regla vía API (cuando aplique)

Preferir **Studio UI** para que el usuario vea la regla. Si se crea por XML-RPC:

1. Crear `ir.actions.server` (`state='code'`, `model_id` del modelo)
2. Crear `base.automation` con `trigger`, `filter_domain`, `action_server_ids`
3. Al enlazar M2M: si `create()` devuelve `[id]`, usar **entero** `id`, no la lista

Documentar ids resultantes en `docs/odoo/`.

## Fuera de alcance por defecto

- Kapso / `kapso/functions/` — solo si la acción es **Send Webhook** y el usuario lo pide
- Módulos en `odoo_website/` — Life Deportes Online usa Studio, no addons desplegados
- Scripts Python permanentes en `scripts/` para automatizaciones — la lógica vive en Odoo
- Asumir ids de etapa entre test y prod sin verificar

## Documentar cada automatización nueva

Crear o actualizar `docs/odoo/<TEMA>_ODOO19_STUDIO_SETUP.md` con:

- Trigger de negocio (lenguaje operativo)
- Modelo, trigger técnico, dominio
- Código Python o payload webhook
- Ids en test y prod (`base.automation`, `ir.actions.server`)
- Pasos de prueba

## Referencia extendida

Patrones MCP, plantillas de código y checklist de pruebas: [reference.md](reference.md)
