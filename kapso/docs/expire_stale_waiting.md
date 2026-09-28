# TTL waiting vendedor — Kapso only

Kapso **no** timeout-ea `enter_waiting`. El reloj nativo es el webhook
`whatsapp.conversation.inactive`.

## Contrato

| | |
|--|--|
| Reloj | **180 min** sin inbound ni outbound en esa conversación |
| Quiet hours | **22:00–06:00** Bogotá: **no** termina waiting (el cliente se responde a las 6:00) |
| Qué cierra | `waiting` del vendedor / `wait_customer` / nodo nulo en **esa** conv (solo de día) |
| Qué no toca | Agent Staff, `wait_staff_*`, teléfonos Paola/Javier/Sebastián/Diego |
| Efecto | `PATCH` `ended`. Próximo inbound = Start + hydrate. **No** cierra 24 h Meta |

Function: `on-conversation-inactive` (`6176fc14-…`)  
Webhook: `f5de2c67-…` en el número `1095603153637786`  
Evento: `whatsapp.conversation.inactive` · `inactivity_minutes=180`

```bash
node kapso/scripts/deploy_on_conversation_inactive.js
```

El LaunchAgent del Mac **ya no corre** el TTL. La function `expire-stale-waiting` queda para un barrido manual de día (`node kapso/scripts/run_expire_stale_waiting.js`). A las **6:00** Bogotá, `resume_overnight_customer` reanuda waiting con inbound sin reply.
