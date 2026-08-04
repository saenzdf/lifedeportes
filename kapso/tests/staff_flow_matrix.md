# Matriz staff v10

Grafo: `workflow_lifedeportes_sales_inbound_v10.json`  
Doc: `kapso/docs/staff_graph_v10.md`

## Tests (`node tests/run_staff_function_tests.js`)

| ID | Assert |
|----|--------|
| S1 | policy jailbreak blocked |
| S2 | policy permite SUBIR PEDIDO |
| S3 | validate sin confirmar → blocked |
| S4 | validate pedido ok |
| S5 | route-user staff |
| S6 | route-staff-write ok edge |

## Flujo staff (recordatorio)

```
route-user-entry [staff] → agente → validate → route-staff-write → build → odoo → handoff
```
