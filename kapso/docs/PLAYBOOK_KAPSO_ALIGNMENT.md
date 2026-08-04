# Alineacion: playbooks comerciales y flujo Kapso

Documento de soporte para vendedores e implementacion: cruza los playbooks locales con las senales Kapso (`vars.intent_next`) y tools.

## Referencias fuente en el repositorio

| Documento | Ruta |
|-----------|------|
| Playbook tecnico/catalogo Odoo | [kapso/sales_playbook.md](../sales_playbook.md) |
| Playbook proceso WhatsApp a Odoo (adjuntos/ciclo) | [sales_playbook.md](../../sales_playbook.md) (raiz `lifedeportes`) |
| ADN comunicacion tipo Paola | [playbook_ventas_paola.md](../../playbook_ventas_paola.md) |
| Prompt orquestador (pegado en nodo Agent) | [prompts/agent_orchestrator_v3.md](../prompts/agent_orchestrator_v3.md) |

**Regla**: el prompt del agente se mantiene en `agent_orchestrator_v3.md`. Tras cada cambio del prompt, sincroniza el grafo YAML/JSON antes de subir a Kapso:

```bash
node scripts/sync-workflow-agent-prompt.js
```

## Mapa playbook (secciones) al flujo simplificado Kapso

| Fase playbook (kapso/sales_playbook) | Contexto cliente | Herramientas principales |
|---------------------------------------|------------------|---------------------------|
| A. Inicio / saludo | `new_customer` vs `existing_customer` desde `vars.user.contact_segment` | `classify-contact-odoo` (guard antes del Agent) |
| B. Cotizacion (producto Odoo exacto) | texto libre cliente | `buscar_producto_odoo`; reglas Dry Fit vs Falcao, camiseta vs uniforme |
| C. Cierre comercial sin compromiso financiero final | cliente quiere cerrar | `construir_payload_pedido`, `activar_cotizacion_odoo`; total + fecha proyectada; **no** autorizar abono hasta validacion humano Odoo |
| Cotizacion formal PDF | cliente pide documento | mismo + `obtener_pdf_cotizacion_odoo`; `intent_next=formal_quote` opcional para branch |
| Adjuntos imagen/audio (sales_playbook maestro #3 y #75) | referencias diseño | `invocar_media_intake` |
| Pagos | comprobante en chat | `prepare_payment_review` via `intent_next=payment_human_review` *(tool segun workflow)* |
| Detalle tallas/lista | despues abono confirmado por humano | `flow_order_details`, `parse_*` |
| Estado / seguimiento | handoff activo | `consultar_estado_pedido_odoo`, `consultar_timeline_pedido_odoo` |
| Documentacion pago empresa / DIAN cliente mostrador | **solo si el cliente lo pide** | `obtener_documentos_pago` |

## Harmonizacion de tiempos (playbook catalogo vs estilo Paola)

- Catalogo interno playbook: ejemplo **10 dias habiles** de fabricacion con condiciones.
- FAQ Paola en libro: ejemplo **15 dias habiles** entrega comun.
- **Agente**: no prometer fecha/metros unicos; orientar tiempo razonable y remitir a confirmacion Odoo/Humano en etapas criticas.
