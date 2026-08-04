# Archivado — carril staff compras (nómina reactivada jul 2026)

**Fecha archivado:** 2026-07-01  
**Nómina reactivada:** 2026-07-05 (lock **807**) — ver `kapso/docs/staff_graph_v10.md`  
**Grafo activo:** `workflow_lifedeportes_sales_inbound_v10.json`

El canal **cliente** (vendedor + histórico) no cambia.

---

## Comandos

| Comando | Estado |
|---------|--------|
| `SUBIR NOMINA` | **Activo** — carril `staff_nomina` |
| `SUBIR COMPRA` | Archivado |
| `SUBIR PEDIDO` | Opcional — default `staff_pedido` |

---

## Variables legacy

### Nómina (`vars.nomina.*`)

| Variable | Uso |
|----------|-----|
| `nomina.employee_name` | Empleado |
| `nomina.period` | Periodo |
| `nomina.amount_cop` | Monto |
| `nomina.confirmed` | Flag confirmación |
| `nomina.reference` | Salida stub `NOM-XXXX` |

### Compras

Usaba el mismo pipeline que pedido (`staff_register_pedido`) con `registration_type = compra`.

---

## Functions y nodos archivados (no en grafo v9)

| Function / nodo | Archivo local |
|-----------------|---------------|
| `register-nomina-stub` | `kapso/functions/register_nomina_stub.js` |
| `route-staff-registration` (rama nómina) | `kapso/functions/route_staff_registration.js` |
| `send_staff_nomina_ok` | nodo grafo v8 |
| Agente staff general (consultas) | `prompts/agent_staff_general_v3.md` — desconectado del grafo |

Para reactivar: restaurar edges en `workflow_lifedeportes_sales_inbound_v8_session.json` o v7_staff.

---

## Tests retirados

En `kapso/tests/staff_flow_matrix.md`: casos S4, S10, S11, M3, M4 (nómina/compra).

---

## Agente upload legacy

Prompts v1–v3 incluían modos nómina/compra. Versión activa: `prompts/agent_staff_upload_v4.md`.
