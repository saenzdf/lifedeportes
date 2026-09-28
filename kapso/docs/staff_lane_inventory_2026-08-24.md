# Inventario carril staff — 2026-08-24

Fuente: `workflow_lifedeportes_sales_inbound_v10.json` nodo `agent_1780762885818` + `service_registry.json`.

## 1. Tools del Agent Staff (vivo en grafo)

| Tool (agente) | Function Kapso | ID | Rol |
|---|---|---|---|
| `buscar_producto_odoo` | `odoo-search-product-price` | `4503ca5c-7114-4442-bada-112be3ddf67e` | Catálogo / precio live |
| `previsualizar_borrador_cotizacion` | `build-quote-payload` | `4a1591c2-66e3-4734-82a7-ed64a1031c2b` | Arma borrador vars.quote.draft_payload sin crear SO. Usar solo para validar producto/cantidad antes de confirmar subida. |
| `clasificar_adjuntos_pedido` | `clasificar-adjuntos-pedido` | `69b09b3e-213e-4871-8bcb-3ac0eff31e0b` | Clasificar media → qué parser |
| `parsear_lista_excel_pedido` | `parsear-lista-excel-pedido` | `2bfdd40a-5556-48d0-b08b-b1bfdd02c368` | Lista Excel → order_draft.detail |
| `parsear_lista_texto_pedido` | `parsear-lista-texto-pedido` | `99cd2e9b-c3a4-4f79-93cd-614c126890bc` | Lista texto → order_draft.detail |
| `parsear_lista_imagen_pedido` | `parsear-lista-imagen-pedido` | `ca5b89c4-1fce-4bc5-9f63-93ca448b89e9` | Lista foto OCR → order_draft.detail |
| `parsear_lista_pdf_pedido` | `parsear-lista-pdf-pedido` | `49b0e88c-11bf-49c5-bf80-431a007af0f9` | Lista PDF → order_draft.detail |
| `registrar_adjuntos_pedido` | `registrar-adjuntos-pedido` | `9f144024-859a-4c21-bc83-7acad5893489` | Staging adjuntos (no Chatter aún) |
| `fusionar_borrador_lista` | `fusionar-borrador-lista` | `ab5ca5cf-b5a8-4656-b9ce-70d23ec4c5af` | Fusionar lista → líneas comerciales |
| `buscar_conversacion_kapso` | `buscar-conversacion-kapso` | `3ecc9e06-cf5b-4037-9840-68138bb1e853` | A5: leer otra conversación cliente |
| `buscar_oportunidad_odoo` | `buscar-oportunidad-odoo` | `1009b5dd-7034-42d3-8742-aeda29f481db` | Retomar/buscar crm.lead por nombre |
| `crear_presupuesto_odoo` | `crear-presupuesto-odoo` | `7dbccd1b-e754-4e71-8d9c-6bc9df3c3dd5` | CRM → SO draft (HAZ PRESUPUESTO) |
| `enviar_formulario_excel` | `enviar-formulario-excel` | `f0981cbd-f8f5-4161-93fc-c1b25c4aec13` | WA Formulario xlsx al cliente |
| `enviar_retomar_pedido` | `enviar-retomar-pedido` | `b297a0c7-ce59-4f7c-bfba-1184c02c9743` | Template retomar_pedido_v2 |
| `buscar_pedido_odoo` | `buscar-pedido-odoo` | `99d48e68-9d7f-43dc-94f5-ce55495a1be0` | Localizar sale.order S0… |
| `corregir_pedido_odoo` | `corregir-pedido-odoo` | `3387d3d8-6ea8-4e59-9158-c46e3263884a` | Parche nota/lista/líneas SO |
| `sincronizar_pedido_odoo` | `sync-order-draft-from-odoo` | `55eeebe6-4249-4619-9ccc-0908148f49c5` | Leer SO/Formulario → vars |
| `parse_nomina_attlog` | `parse-nomina-attlog` | `7c490919-ceb7-48a4-b267-abbf57ff33ab` | Parse attlog.dat |
| `confirmar_nomina` | `confirmar-nomina` | `8d493868-02d1-4beb-bfc9-f1d4d17dcaf4` | Cola NOM-… |
| `staff_sales_notify_reply` | `staff-sales-notify-reply` | `b7f31cf3-f286-4fff-ab27-ecc66f921980` | Contacto wa.me + Kapso al staff |

### Platform / default tools (Kapso)

`enabled_default_tools`: `send_notification_to_user`, `send_media`, `get_execution_metadata`, `get_whatsapp_context`, `get_current_datetime`, `save_variable`, `get_variable`, `ask_about_file`, `enter_waiting`, `complete_task`, `handoff_to_human`

**Tensión:** el prompt prohíbe `handoff_to_human` y `send_notification`/`send_media` al lead, pero siguen habilitados en default tools (excepción documentada: excel/retoma vía functions dedicadas).


## 2. Functions del grafo (cadena write, no tools del agente)

| Function | ID | Cuándo |
|---|---|---|
| `staff-allowlist-check` | `53d38630-abc6-4512-bfec-58cbc6c3bc29` | ¿Es staff? |
| `route-user-entry` | `58b1d07a-ace2-48fd-9e55-94c288d92a86` | staff vs cliente |
| `policy-guard-input` | `3800675c-b32c-46c4-b896-2a885f58421c` | Guard entrada |
| `route-staff-burst-resume` | `c33b936f-437b-40e0-925b-960c8efd86ca` | Tras wait ~10s → agente |
| `route-staff-domain-guard` | `313d9a31-9197-4aa8-8e33-ba7feba69409` | pedido write vs skip (nómina) |
| `compile-staff-order-draft` | `55575147-9a87-4e2b-9d83-8e5146ca0661` | Tras complete_task: compilar draft |
| `validate-staff-write` | `4061a9e7-fce9-4301-81e7-bd2e47da3da4` | Gates mín.6 / bloqueos |
| `route-staff-write` | `1cf1c2f1-f5ca-49c3-b9a7-bff76d87c1ee` | ok vs blocked |
| `build-quote-payload` | `4a1591c2-66e3-4734-82a7-ed64a1031c2b` | Payload Odoo |
| `odoo-create-lead-and-so` | `8a7b731d-480c-4abc-8a72-f965856d7515` | Write CRM/SO + Formulario + adjuntos |
| `route-staff-lane-resume` | `9333529a-6e01-468c-931a-203b9ad378d2` | Tras wait_staff_lane |

## 3. Functions staff-adjacentes (no tool del agente)

| Function | ID | Nota |
|---|---|---|
| `notify-sales-interest` | `a2236fdc-…` | Carril **cliente**; avisa Paola/Javier |
| `staff-sales-notify-reply` | `b7f31cf3-…` | Sí es tool staff (arriba) |
| `morning-flush-staff-notifies` | `503ba231-…` | Cron/invoke 8am avisos diferidos |
| `on-conversation-inactive` | `6176fc14-…` | Webhook inactive 180 min → ended vendedor |
| `on-odoo-presupuesto` | `ecc7008e-…` | Webhook Odoo Proposition→lista SO |
| `odoo-send-wa-template` | `8044ad1b-…` | Botones CRM Odoo → WA |
| `crear-compra-odoo` | `b07a0ccf-…` | Registry; **NO** en toolset agente |
| `prepare-inbox-upload` | `d750cbd5-…` | Inbox legacy; **NO** en toolset |
| `get-service-status` | `c0ea46a6-…` | Ops; **NO** en toolset |
| `snapshot-upload-fidelity` | `3ea0712b-…` | Ops fidelidad; **NO** en toolset |

## 4. Por dominio (mapa mental)

| Dominio | Tools agente | Grafo escribe Odoo? |
|---------|--------------|---------------------|
| Localizar SO / opp | `buscar_pedido_odoo`, `buscar_oportunidad_odoo`, `sincronizar_pedido_odoo` | No |
| Corregir SO | `corregir_pedido_odoo` | Tool escribe directo |
| Completar lista/fotos → SO/CRM | parsers + `registrar` + `fusionar` + `complete_task` | **Sí** (compile→validate→odoo-create) |
| Presupuesto desde opp | `crear_presupuesto_odoo` | Tool escribe SO |
| Rescate conversación (A5) | `buscar_conversacion_kapso` → opp/presupuesto flujo normal | Según tools |
| Contacto al staff | `staff_sales_notify_reply` | No |
| WA al cliente (bajo orden) | `enviar_formulario_excel`, `enviar_retomar_pedido` | No (Meta) |
| Catálogo | `buscar_producto_odoo`, `build_quote_payload` | No |
| Nómina | `parse_nomina_attlog`, `confirmar_nomina` | No (cola NOM; domain-guard skip pedido) |


## 5. Gaps / drift detectados

- ~~Prompt archivo vs grafo~~ — **cerrado 2026-08-24**: A5 rescatado + strip `handoff_to_human` (lock **1778**).
- ~~`service_registry.staff_lane.agent_tools`~~ — 20 tools + burst 10s.
- **Compra:** `crear_compra_odoo` en registry (no cablear); KB nómina ya no lo ofrece.
- **Review pendiente:** `previsualizar_borrador_cotizacion` vs nodo grafo; `send_notification`/`send_media` en defaults.


## 6. keep / review / archive (por pieza)

### Tools del agente (20)

| Tool | Veredicto | Nota |
|------|-----------|------|
| `buscar_pedido_odoo` | **keep** | Localizar SO |
| `buscar_oportunidad_odoo` | **keep** | Localizar/retomar CRM |
| `sincronizar_pedido_odoo` | **keep** | Pull Odoo→vars |
| `corregir_pedido_odoo` | **keep** | Parches SO |
| `clasificar_adjuntos_pedido` | **keep** | Router de parsers |
| `parsear_lista_excel_pedido` | **keep** | Formato Life |
| `parsear_lista_texto_pedido` | **keep** | |
| `parsear_lista_imagen_pedido` | **keep** | |
| `parsear_lista_pdf_pedido` | **keep** | |
| `registrar_adjuntos_pedido` | **keep** | Staging |
| `fusionar_borrador_lista` | **keep** | Líneas comerciales |
| `crear_presupuesto_odoo` | **keep** | CRM→SO (flujo normal) |
| `buscar_conversacion_kapso` | **keep** | A5 rescate → opp en Odoo |
| `staff_sales_notify_reply` | **keep** | Contacto 3 líneas |
| `enviar_formulario_excel` | **keep** | Bajo orden staff |
| `enviar_retomar_pedido` | **keep** | Bajo orden staff |
| `buscar_producto_odoo` | **keep** | Match catálogo |
| `parse_nomina_attlog` | **keep** | |
| `confirmar_nomina` | **keep** | |
| `previsualizar_borrador_cotizacion` | **review** | Misma fn que nodo grafo `build-quote-payload`; ¿sigue usándose antes de complete_task? |

### Default Kapso

| Tool | Veredicto | Nota |
|------|-----------|------|
| `get_variable` / `save_variable` | **keep** | |
| `get_whatsapp_context` / `ask_about_file` | **keep** | |
| `complete_task` / `enter_waiting` | **keep** | Pedido vs fin turno |
| `get_current_datetime` / `get_execution_metadata` | **keep** | |
| `send_notification_to_user` / `send_media` | **review** | Prompt prohíbe al lead; excel/retoma van por functions. Valorar strip o dejar por excepción rara |
| `handoff_to_human` | **archive (strip)** | Embed ya lo quita del staff; no reactivar |

### Functions grafo (write/route)

| Function | Veredicto |
|----------|-----------|
| allowlist / route-user / policy / burst / domain / compile / validate / route-write / build-quote / odoo-create / lane-resume | **keep** todas |

### Fuera del agente WA

| Function | Veredicto | Nota |
|----------|-----------|------|
| `notify-sales-interest` + `morning-flush-staff-notifies` | **keep** | Carril cliente → staff |
| `on-odoo-presupuesto` / `odoo-send-wa-template` | **keep** | Odoo webhooks/botones |
| `crear-compra-odoo` | **archive (no cablear)** | Registry only |
| `prepare-inbox-upload` + fidelidad/KPI | **archive (no cablear)** | Ops |
| Routers `_archive/route_staff_*` | **archive** | No reintroducir |

### KBs (9)

| KB | Veredicto |
|----|-----------|
| lista / corrección / retomar CRM / nómina / reglas_staff / catalog_match / variantes / whatsapp_patterns | **keep** |
| `life_catalogo_precios` | **review** | ¿Basta `life_catalog_staff_match` + tool precio? |

### Docs drift

Actualizado 2026-08-24 (registry + embed lock **1778**).

