# Inventario de functions — Life Deportes Kapso

**Grafo activo:** `workflow_lifedeportes_sales_inbound_v8_session.json`  
**Arquitectura del grafo:** ver `kapso/docs/graph_architecture.md` (re-trigger por mensaje, dos carriles, sin bucles `continue_chat` innecesarios).

**Resumen:** **22 functions** justificadas en el flujo actual. **14 archivadas** (legacy / consolidación cliente). Si Kapso muestra **31+**, el exceso son deploys huérfanos en la plataforma — ver sección final.

---

## A. Entrada y guards (4) — siempre al Start

| # | Kapso name | Qué hace | Dónde en el flujo |
|---|------------|----------|-------------------|
| 1 | `policy-guard-input` | Antijailbreak único: detecta inyección, sanitiza texto, excepción comandos `SUBIR *` staff | Start → todos |
| 2 | `staff-allowlist-check` | Marca `vars.user.role = staff` si WA está en allowlist | Tras policy |
| 3 | `route-user-entry` | Decide edge `staff` vs `customer` según role | Primer fork del grafo |
| 4 | `classify-contact-odoo` | Busca partner en Odoo por teléfono; segmento `new_customer` / `existing_customer` / stakeholder | Rama **cliente** |

---

## B. Routers — una decisión = una function

> **Nota (2026-06):** En el grafo vivo de Kapso se simplificaron salidas post-agente: el chat normal no usa bucle `continue_chat` porque cada mensaje WhatsApp vuelve a entrar por **Start** y el agente usa `enter_waiting`. Las decisiones abajo siguen siendo válidas para **cambios de carril** y **write staff**; no reañadir loops solo para multi-turno. Ver `graph_architecture.md`.

| # | Kapso name | Qué hace | Dónde |
|---|------------|----------|-------|
| 5 | `route-customer-entry` | `new_customer` → vendedor; `existing_customer` → histórico; **`returning_sale` (var)** → vendedor vía edge `new_customer` | Tras classify |
| 6 | `detect-staff-upload-command` | Parsea `SUBIR PEDIDO|NOMINA|COMPRA` o saludo → `staff_route` | Rama **staff** |
| 7 | `route-staff-entry` | `staff_consultation` / `staff_upload_pedido` / `staff_upload_registro` | Tras detect |
| 8 | `route-staff-post` | Salida agente **staff general**: pasar a upload (no bucle de chat) | Post agente consultas |
| ~~9~~ | ~~`route-intent-next`~~ | **Removido del carril cliente** (2026-06-17). Solo re-trigger + `enter_waiting` / `handoff_to_human`. Puede quedar en staff si aplica. | — |
| 10 | `validate-staff-write` | Gate determinístico antes de escribir | Post agente upload |
| 11 | `route-staff-write` | `staff_write_ok` vs `staff_write_blocked` | Tras validate |
| 12 | `route-staff-registration` | `staff_register_pedido` vs `staff_register_nomina` | Tras write ok |

**¿Duplicado `route-intent-next` vs `route-staff-post`?** No. Edges y defaults distintos (staff vs cliente). No fusionar sin revisar `graph_architecture.md`.

---

## C. Escritura Odoo / cola (4) — solo nodos, nunca tools de agente cliente

| # | Kapso name | Qué hace | Dónde |
|---|------------|----------|-------|
| 13 | `build-quote-payload` | Arma `vars.quote.draft_payload` (catálogo + reglas comerciales) | Nodo write staff **y** tool preview upload |
| 14 | `odoo-create-lead-and-so` | Crea lead + SO en Odoo | Nodo tras build (staff pedido) |
| 15 | `register-nomina-stub` | Cola interna nómina (stub hasta HR Odoo) | Nodo rama nómina |

**¿Duplicado `build-quote-payload` tool + nodo?** No. Tool = **preview** sin write; nodo = **write pipeline** post-validación.

---

## D. Lectura Odoo — tools de agentes (3)

| # | Kapso name | Tool agente | Qué hace | Agente |
|---|------------|-------------|----------|--------|
| 16 | `odoo-search-product-price` | `buscar_producto_odoo` | Precio producto × cantidad | Vendedor, staff general, staff upload |
| 17 | `get-customer-card-scoped-odoo` | `consultar_tarjeta_pedido` | Tarjeta `project.task`: lista activas o detalle (estado SO + etapa + timeline chatter) | Cliente histórico |
| 18 | `get-customer-design-references-scoped-odoo` | `consultar_referencias_diseno` | Adjuntos diseño/impresión en tarjetas **hechas** | Cliente histórico |

**Consolidación (jun 2026):** 5 tools cliente → 2. Legacy en `_archive/`; IDs huérfanos `d9cb765a`, `03009eb7`, `c54be92f` — ver `kapso_orphan_function_ids.md`.

---

## E. Meta (1)

| # | Kapso name | Qué hace | Dónde |
|---|------------|----------|-------|
| 22 | `get-service-status` | Tool: agente staff pregunta si un servicio del registry está `ready` | Staff general + upload |

---

## F. Archivadas — NO en grafo v8 (movidas a `functions/_archive/`)

| Kapso name | Por qué existía | Por qué se archiva |
|------------|-----------------|-------------------|
| `resolve-tenant-context` | Multi-tenant sandbox/prod | Un solo número Life Deportes; no está en el grafo |
| `media-intake-dispatcher` | Intake imagen/audio fase 1 | Reemplazado por `ask_about_file` del agente |
| `normalize-order-details` | Flow WhatsApp `order_details` | Flow Meta bloqueado; deprecado en registry |
| `design-approval-gate` | Aprobación diseño en funnel viejo | Sin nodo ni agente en v8 |
| `prepare-payment-review` | Revisión pago + handoff packet | Funnel pago reemplazado por conversación + humano |
| `get-payment-assets` | Datos bancarios / política pago | No referenciado en v8 |
| `odoo-get-quote-pdf` | PDF cotización | Nunca desplegado con ID; no en grafo |
| `print-qc-webhook-odoo` | Webhook Odoo Studio QC impresión | **Proyecto aparte** (Odoo → Kapso), no inbound WhatsApp |
| `detect-quote-activation` | Detectar cierre cotización por keywords | Grafo orquestador v3; agente decide ahora |
| `emit-quote-signal` | Log señal cotización | Nunca cableado |
| `normalize-input` | Parse cantidad/material del texto | Reemplazado por agente + classify |
| `compose-price-cop` | Formatear mensaje precio | Agente redacta; `odoo-search-product-price` da números |
| `order-commercial-rules` | Reglas comerciales sueltas | Lógica **inline** en `build-quote-payload` |
| `get-customer-orders-scoped-odoo` | Lista pedidos scoped | Consolidado en `get-customer-card-scoped-odoo` |
| `get-order-status-odoo` | Estado SO | Consolidado en `get-customer-card-scoped-odoo` |
| `get-order-timeline-odoo` | Timeline fabricación | Consolidado en `get-customer-card-scoped-odoo` |
| `get-customer-project-cards-scoped-odoo` | Tarjetas proyecto | Consolidado en `get-customer-card-scoped-odoo` |
| `get-customer-designs-scoped-odoo` | Diseños en SO | Reemplazado por `get-customer-design-references-scoped-odoo` |

`_bundle_all_functions.js` en raíz es **solo referencia local** (no deploy Kapso).

**Acción Kapso plataforma:** puedes borrar estos deploys del proyecto si ya no los usas en otro workflow. IDs en `kapso/docs/kapso_orphan_function_ids.md`.

---

## Mapa visual (22 activas)

```
Start
  policy-guard-input
  staff-allowlist-check
  route-user-entry ─┬─ customer → classify-contact-odoo → route-customer-entry
                    │              ├─ new_customer → [vendedor] → route-intent-next
                    │              └─ existing_customer → [histórico] → route-intent-next
                    └─ staff → detect-staff-upload-command → route-staff-entry
                                  ├─ staff_consultation → [staff general] → route-staff-post
                                  ├─ staff_upload_pedido ─┐
                                  └─ staff_upload_registro ┴→ [staff upload]
                                        → validate-staff-write → route-staff-write
                                        → route-staff-registration
                                              ├─ build-quote-payload → odoo-create-lead-and-so
                                              └─ register-nomina-stub
```

---

## De 12 a 31 — qué pasó

| Origen | Cantidad |
|--------|----------|
| Core Odoo original (~12) | precio, classify, build, create SO, status, etc. |
| Routers staff v7 (+5) | detect, route-staff-*, validate |
| Agente histórico (+4) | orders scoped, timeline, project cards, designs |
| Deploys legacy aún en Kapso (+9) | ver sección F |
| Posibles duplicados de deploy | versiones viejas con otro nombre/ID |

**Objetivo operativo:** mantener **22** en el workflow; borrar o archivar el resto en Kapso Functions UI.
