# Staff — nómina attlog (mismo Agent Staff)

Comando: **SUBIR NOMINA** + archivo `*_attlog.dat` del reloj ZKTeco.

PIN del archivo = **`hr.employee.barcode`** (Badge ID / credencial) en Odoo.

## Flujo (Agent Staff unificado)

1. Staff escribe `SUBIR NOMINA` y adjunta el `.dat`.
2. Tool **`parse_nomina_attlog`** → `vars.nomina.draft` + `summary_text` (incluye Odoo #).
3. Staff revisa y escribe **CONFIRMO NOMINA**.
4. Tool **`confirmar_nomina`** (`confirmed=true`) → cola `NOM-…` (`status=queued`).
5. Mensaje corto + `enter_waiting`. **No** uses `complete_task` (eso es pedido).

## Variables

| Variable | Uso |
|----------|-----|
| `nomina.draft.employees[].pin` | PIN reloj |
| `nomina.draft.employees[].odoo_employee_id` | `hr.employee.id` |
| `nomina.summary_text` | Resumen WhatsApp |
| `nomina.reference` | Referencia cola |
| `nomina.status` | `pending_confirmation` → `queued` |

## Catálogo

`kapso/config/attlog_employee_map.json` → `nomina_employee_codes.js`.

## No confundir

- **Pedido:** `complete_task` → CRM/SO.
- **Nómina:** tools arriba; sin `order_draft`.
- **Compra:** `crear_compra_odoo` + CONFIRMO COMPRA.
