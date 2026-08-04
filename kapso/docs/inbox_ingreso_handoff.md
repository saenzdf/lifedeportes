# Ingreso pedido — Jump al Agent Staff

Jump to node: **`agent_1780762885818`** (en UI Kapso suele verse como **AI Agent** — el `display_name` lo calcula Kapso y no se edita bien por API).

Nombre sugerido si lo renombrás a mano en el canvas: **Jump → Staff: subir pedido CRM / nómina / compra**.

El agente Inbox aparte se retiró (2026-07-21). El mismo Agent Staff atiende WA allowlist y Jump.

## UX

| Canal | Dónde | Cliente ve |
|-------|--------|------------|
| WhatsApp staff | Allowlist | No (canal staff) |
| Jump / Workflow Chat | Observer staff | No — no enviar al WA del cliente |

1. Vendedor cierra interés → `notificar_interes_ventas` + waiting (paquete en `quote.*` / CRM).
2. Staff abre Jump → Agent Staff **o** escribe por WA staff.
3. Si hay paquete quote: tool `prepare_inbox_upload` (silent) opcional → CRM/SO con `complete_task`.
4. KPI: tool `medir_fidelidad_pedido` tras sync.

## Cadena silent legacy (Jump opcional)

Nodos `prepare-inbox-upload` → … → `snapshot-upload-fidelity` siguen en el grafo como Jump-only (huérfanos desde Start). Preferir tools en el Agent Staff.

## Restricciones

- Nunca `send_notification` al teléfono del cliente.
- Kapso nunca confirma el SO en Odoo.

## Scripts

```bash
bash kapso/scripts/deploy_unified_staff.sh
node kapso/scripts/validate-graph-lifedeportes.js kapso/workflow_lifedeportes_sales_inbound_v10.json
```
