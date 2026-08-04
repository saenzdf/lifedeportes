# Fix CONFIRMO SUBIR (2026-07-12)

## Root causes
1. **Gate no leía el inbound Kapso** — `hasConfirmoSubir` solo miraba `staff.lane_reply` / `context.last_user_text`. Kapso pone el mensaje en `intent.raw_text` / `last_user_input`.
2. **Compile pedía CONFIRMO por `parse_status=partial`** aunque todas las líneas fueran `high` + variant.
3. **Resume** podía preferir `staff_lane_done` / nuevo pedido sobre CONFIRMO.
4. **Secrets Kapso en prod** — el primer canary “falló” en test porque el writer creó S02618/S02619 en `life-soluciones.odoo.com`. Sync `--target test` + cancelación de esos borradores.

## Cambios desplegados
| Function | ID |
|----------|-----|
| validate-staff-write | `4061a9e7-…` |
| route-staff-lane-resume | `9333529a-…` |
| compile-staff-order-draft | `55575147-…` |
| secrets Odoo → test | `sync_odoo_secrets_to_kapso.js --target test` |

Código: `lib/staff_order_contract.js`, `validate_staff_write.js`, `route_staff_lane_resume.js` (+ bundle deploy).

## Canary wacli→Kapso (test)
| # | Cliente | Resultado |
|---|---------|-----------|
| 1 | PASTO | ✓ S02657 |
| 2 | JORGE DUEÑOS | ✓ S02658 |
| 3 | LUCU (nuevo) | ✓ S02659 |
| 4 | NELSON ELEFANTES | ✓ S02660 |
| 5 | FORTALEZA OMAR | ✗ `min_uniform` — agent puso qty **1** (Excel tiene 16 filas); CONFIRMO no aplica a blocked |
| 6–10 | — | no corridos (stop-on-error) |

Pendiente aparte: partner sale como `Cliente Life` (`customer_wa_id` null); alinear qty comercial con filas parseadas.
