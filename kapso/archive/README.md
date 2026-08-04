# Archive - Workflows obsoletos

Estos JSON quedaron en `archive/` el 2026-04-22 cuando pasamos al diseno v3 (un solo Agent orquestador + guards + Decide post-agent por `vars.intent_next`).

Se conservan como referencia de diseno; NO se deployan.

| Archivo | Motivo de archivo |
|---|---|
| `workflow_lifedeportes_sales_inbound_v1.json` | Reemplazado por el v2 actualizado. |
| `workflow_lifedeportes_sales_assist_v2.json` | Mergeado dentro del Agent orquestador del v2. |
| `workflow_lifedeportes_router_v2.json` | Router AI de primera linea eliminado; el Agent decide por si mismo. |
| `workflow_lifedeportes_create_order_text_v2.json` | Se maneja dentro del Agent (tool construir_payload_pedido). |
| `workflow_lifedeportes_create_order_audio_v2.json` | Reemplazado por `workflow_media_intake_stub.json` + tool invocar_media_intake. |
| `workflow_lifedeportes_record_purchase_receipt_v2.json` | Fuera del alcance cliente; si vuelve sera como subagente interno separado. |
| `workflow_lifedeportes_handoff_human_v2.json` | Handoff se maneja con la built-in `handoff_to_human` dentro del Agent. |

Para entender la arquitectura actual ver:
- `../workflow_lifedeportes_sales_inbound.json`
- `../service_registry.json`
- `../vars_contract.md`
- `../prompts/agent_orchestrator_v3.md`
