# Asignación de diseñador por proyecto — Odoo 19 Studio

Ruteo de tareas a **José Diseñador** (proyecto Javier) y **Leyrol Diseñador** (proyecto Paola), con excepción manual a José en tareas de Paola cuando la operaria lo indique.

## Trigger de negocio

| Proyecto | Diseñador por defecto | Excepción |
|----------|----------------------|-----------|
| Javier Proyecto (id 8) | José Diseñador (user 7) | — |
| Proyecto Paola (id 9) | Leyrol Diseñador (user 8) | Operaria cambia campo **Diseñador** → José en tareas puntuales |

Al entrar a etapa **Fabricación** (ids 32 Javier / 36 Paola), además de crear la OF/MRP existente, se asigna el diseñador, se suscribe al chatter y se notifica.

## Campo Studio

| Campo técnico | Etiqueta | Tipo | Modelo |
|---------------|----------|------|--------|
| `x_studio_diseador` | Diseñador | Many2one → `res.users` | `project.task` |

| Instancia | `ir.model.fields` id |
|-----------|----------------------|
| Test | 46431 |
| Prod | 43942 |

**Pendiente en UI:** abrir Studio en una tarea y arrastrar **Diseñador** al formulario y a la vista lista/kanban del proyecto Paola (el campo existe en BD; la vista puede requerir ajuste manual en Studio).

## Seguidores de proyecto

| Proyecto | Seguidor predeterminado |
|----------|-------------------------|
| Javier Proyecto | José (partner 81) |
| Proyecto Paola | Leyrol (partner 82) — José removido del proyecto |

## Reglas activas

### Producción (`life-soluciones.odoo.com`)

| Regla | `base.automation` | Trigger | Dominio | Acción servidor |
|-------|-------------------|---------|---------|-----------------|
| Fabricación Javier | 5 | `on_stage_set` | `stage_id = 32` | 1337 (MRP + asignar diseñador) |
| Fabricación Paola | 9 | `on_stage_set` | `stage_id = 36` | 1341 (MRP + asignar diseñador) |
| Default diseñador Paola al crear | 23 | `on_create` | proyecto Paola | 1538 |

### Test (`life-soluciones-test-saas19-0624.odoo.com`)

| Regla | `base.automation` | Acción servidor |
|-------|-------------------|-----------------|
| Fabricación Javier | 5 | 1337 |
| Fabricación Paola | 9 | 1341 |
| Default diseñador Paola al crear | 23 | 1626 |

Reglas duplicadas **Asignar diseñador Fabricación Javier/Paola** (ids 21–22) quedaron **inactivas**; la lógica vive al inicio del código de **Fabricación Javier/Paola** (1337/1341).

## Usuarios diseñador

| Nombre | `res.users` id | Login |
|--------|----------------|-------|
| Jose Diseñador | 7 | varela.jose.m16@gmail.com |
| Leyrol Diseñador | 8 | leyrol@icloud.com |

## Flujo operaria (Paola)

1. Tarea nueva en Paola → automatización pone **Diseñador = Leyrol**.
2. Si Leyrol está copada → cambiar **Diseñador** a José en esa tarea.
3. Mover a **Fabricación** → se crea OF (lógica existente) + asignación y notificación al diseñador elegido.

## Credenciales test (jun 2026)

Instancia test renovada semanalmente:

| Variable | Valor |
|----------|-------|
| `ODOO_LIFEDEPORTES_URL` | `https://life-soluciones-test-saas19-0624.odoo.com` |
| `ODOO_LIFEDEPORTES_DB` | `life-soluciones-test-saas19-0624` |
| Usuario / clave | Igual que producción (`info@lifedeportes.com`) |

Ver `.env` y `.env.example`.

## Scripts de mantenimiento

- `scripts/setup_designer_routing.py` — descubrimiento e implementación inicial
- `scripts/fix_designer_routing.py` — fusionar asignación en reglas MRP y corregir duplicados

## Pruebas

1. **Test:** crear tarea en Paola → verificar `x_studio_diseador` = Leyrol.
2. Cambiar diseñador a José → mover a Fabricación → José en asignados y notificación.
3. Tarea Javier → Fabricación → siempre José.
4. Confirmar que la OF/MRP sigue creándose (reglas 5 y 9 activas).
