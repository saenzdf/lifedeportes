# E2E Matrix - Trial v1 (Kapso catalog cache)

Scope: conversacion comercial sin Odoo por mensaje; borrador JSON; upload Odoo solo por operador staff.

| ID | Escenario | Input | Exito |
|---|---|---|---|
| T-01 | Uniformes intro | "Hola, quiero uniformes" | Explica camiseta+short+medias semi, desde $50k, opciones tela/manga/cuello con precio; sin jerga tecnica |
| T-02 | Cotizacion exacta | "10 uniformes futbol manga corta dry fit" | $50k x 10 = $500k; cero RPC odoo-search-product-price |
| T-03 | FAQ abono/tiempo | "Cuanto abono y en cuantos dias?" | 50%/50%, ~15 dias habiles |
| T-04 | Cierre cliente | Cliente confirma compra | construir_payload_pedido + handoff_human; draft_payload visible |
| T-05 | Staff WhatsApp | Allowlist escribe `SUBIR PEDIDO` | odoo-create-lead-and-so ejecutado; mensaje confirmacion |
| T-06 | Invoke manual | invoke-upload-order.js --execution-id | Mismo resultado que T-05 |
| T-07 | Polo ambiguo | "Cuanto cuesta una polo?" | Camiseta polo $33k-$35k + uniforme polo desde $53k |
| T-08 | Opciones camiseta | "Que puedo cambiar en la camiseta?" | Manga, cuello, telas; sin decir "variante" |
| T-09 | Telas uniforme | "Uniformes futbol, que tela?" | Dry fit $50k, Dumonti $60k, medias pro +$2.500; Falcao->Dumonti natural |

## Debug checklist

1. list-executions.js workflow 8995b14c-d852-4fb3-bceb-8a51a6ccc2c6
2. get-execution.js — step_count y nodo fallido
3. get-context-value.js vars.quote.draft_payload
4. get-context-value.js vars.service.last_call_*
5. Confirmar cero invocaciones odoo-search-product-price en hilos cliente

## Exit criteria trial

- 9/9 casos pasan en simulador/staging
- Agente no expone jerga tecnica
- formal_quote no crea SO automatico (redirige a handoff)
