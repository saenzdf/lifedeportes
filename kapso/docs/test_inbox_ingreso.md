# Test plan — Inbox ingreso pedido (manual)

Workflow: `lifedeportes_sales_inbound`  
Jump target: **Agent: Inbox ingreso pedido**

## Prechecks (automatizados — OK 2026-07-11)

- [x] `node kapso/scripts/test_fidelity_kpi.js`
- [x] `validate-graph-lifedeportes.js` → valid
- [x] invoke `prepare-inbox-upload` → `upload_source=inbox_silent`, seed 1 línea
- [x] invoke `snapshot-upload-fidelity` → snapshot con SO name
- [x] invoke `compute-fidelity-retention` → qty 10→12 → retention 83.3%, `pass_clean=false`

## Manual en Kapso Inbox (owner/admin)

### A. Happy path (cierre vendedor → Jump)

1. Desactivar `staff_only_mode` si el carril cliente sigue pausado (si no, usar hilo de prueba ya en handoff).
2. Cliente (o Test) cotiza ≥6 uniformes → visto bueno → bot hace handoff.
3. Abrir hilo en Inbox → pestaña **Workflow**.
4. Confirmar estado `handoff` y vars `quote.*` / `handoff.context_packet`.
5. **Jump to node** → `Agent: Inbox ingreso pedido`.
6. En **Workflow Chat**: pedir resumen; corregir qty o nombre; responder **CONFIRMO SUBIR**.
7. Verificar Events: prepare → validate → build → odoo → snapshot → handoff.
8. Compose: **no** debe haber llegado resumen técnico / CONFIRMO al cliente.
9. Odoo: SO borrador con partner = teléfono del **cliente**.
10. Hilo sigue en handoff; escribir al cliente desde Compose.

### B. Staff asume sin cierre del bot

1. Conversación en `waiting` (bot aún activo).
2. Workflow → **Handoff** (pausar bot).
3. Jump al mismo agente inbox.
4. Asistente debe armar desde chat si `quote` está incompleto.
5. CONFIRMO SUBIR → SO + vuelta a handoff.

### C. Bloqueo / confirmación

1. Jump con cantidad &lt; 6 o sin producto claro.
2. Esperar ruta `staff_write_blocked` → handoff **sin** WhatsApp.
3. Corregir en Workflow Chat (Jump de nuevo) y reintentar.

### D. KPI

1. Tras SO: `vars.fidelity.kapso_snapshot` presente.
2. Editar qty en Odoo → sync / tool `medir_fidelidad_pedido` → `pass_clean=false`, `retention_pct` &lt; 100.

## Nota

Jump requiere rol **owner/admin**. Operarias `human_agent` quedan para fase 2 (enlace/API).
