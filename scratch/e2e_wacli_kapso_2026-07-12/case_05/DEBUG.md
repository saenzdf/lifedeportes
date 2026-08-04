# DEBUG PLAN — Case 5 (CONFIRMO_NOT_CONSUMED)

## Qué falló
- **Código:** `CONFIRMO_NOT_CONSUMED`
- **Error:** confirmo_not_consumed_by_kapso
- **Marker:** `WACLI-KAPSO 07122230 C5`
- **Staff → Life:** 573172575981 → 573222252942
- **Started:** 2026-07-12T22:35:56.300Z

## Evidencia
- TRACE: `TRACE.md`
- Polls: `messages_poll_*.json`
- result.json (steps + detail)

## Hipótesis por código

| Código | Hipótesis | Chequeo |
|--------|-----------|---------|
| WACLI_SEND_TEXT / FILE | Sesión wacli / lock / desconexión | `wacli doctor`; `wacli sync --once` |
| WACLI_CONFIRMO | No llegó confirmación | Ver mensajes en chat Life |
| NO_SO_IN_ODOO | Kapso no corrió writer / wrong env / agent stuck | Kapso executions; secrets test; reply bot |
| NO_MEDIA | Pack sin xlsx | case dir |

## Pasos de debug sugeridos
1. `wacli doctor` + re-sync.
2. Leer últimos mensajes del chat Life (poll json).
3. Kapso dashboard: última execution staff inbound — ¿error function? ¿wait CONFIRMO?
4. Odoo test: `sale.order` create_date >= started_at; buscar marker en note.
5. Verificar secrets Kapso `odoo-create-lead-and-so` apuntan a **test**.
6. Si agent pidió dato y no respondimos: ampliar script con reply al ask.
7. Si Excel no Life (case 6): confirmar mensaje espejo vs bloqueo.

## Last bot text
```
No se subió el pedido: Pedido incompleto: minimo 6 uniformes del mismo diseno.. Corrija y confirme de nuevo.
---
No se subió el pedido: Pedido incompleto: minimo 6 uniformes del mismo diseno.. Corrija y confirme de nuevo.
```
