# Flujo completo Life Deportes — Kapso + Odoo (v1)

> **Fuente de verdad operativa** (2026-08-28). Complementa `graph_architecture.md`, `session_and_handoff.md`, `functions_inventory.md` y las KB del agente.
>
> **Grafo activo:** `lifedeportes_sales_inbound` · ID `8995b14c-d852-4fb3-bceb-8a51a6ccc2c6` · JSON `workflow_lifedeportes_sales_inbound_v10.json`

---

## 1. Mapa en una página

```
WhatsApp cliente/staff
        │
        ▼
   [Start]  ← solo si exec ended/failed o primer inbound
        │
 policy-guard-input          ← antijailbreak + spam temprano (prefill Ads)
        │
 staff-allowlist-check       ← Paola/Javier → role staff
        │
 route-user-entry            ← fork staff | customer
        │
   ┌────┴────┐
   │         │
customer    staff (v10: agente upload v9 slim)
   │         │
classify-   route-staff-* → validate → build → odoo-create-lead-and-so
contact-odoo
   │         (pedido ya viene del carril ventas; staff completa/corrige)
route-customer-entry
   │    new_customer → debounce 30s → ensure-crm → resolve-hours → AGENTE VENDEDOR v11
   │    existing_customer → AGENTE HISTÓRICO
   │
   └─ returning_sale (var) → vendedor otra vez
```

**Reanudación:** si la ejecución está `waiting`, el inbound **no** pasa por Start — retoma el mismo agente. Silencio **180 min** → webhook `conversation.inactive` → `ended` → próximo mensaje = Start + classify + hydrate.

---

## 2. Relojes (no mezclar)

| Reloj | Ventana (Bogotá) | Efecto |
|-------|------------------|--------|
| **Envío al cliente** | 06:00–22:00 todos los días | Fuera: tools sí, **cero** WhatsApp (`customer_send_ok`). **18:00–22:00:** solo vendedor; staff proactivo pausado |
| **Aviso proactivo staff** | 08:00–18:00 lun–sáb | Notify, llegada, digest; si escriben, sí se contesta |
| **Confirmación comercial “hoy”** | lun–vie 8:30–17; sáb 8:30–14 | Copy §4.1 vs §4.2 (`business_mode`) |
| **Ventana Meta 24 h** | Desde último inbound del cliente | Fuera: solo plantillas aprobadas |
| **TTL memoria prospecto** | **14 días** sin actividad comercial | `cold_prospect`: no hydrate Kapso ni dossier CRM |
| **TTL waiting Kapso** | 180 min inactividad | `ended` + inbox libre |

---

## 3. Identidad y memoria

| Clave | Dónde vive | Para qué |
|-------|------------|----------|
| Teléfono E.164 / local10 | Partner Odoo, vars.user | Hydrate, wa.me, CRM |
| BSUID (`CO.xxx`, `US.xxx`) | Kapso conv, partner comment | Mismo contacto sin número visible |
| `conversation_id` | Kapso | Sesión / deep-link (validar vs tel/BSUID) |
| Asesor sticky | `res.partner.comment` `kapso:advisor` | Paola **o** Javier — nunca ambos |
| Quote en curso | `vars.quote` + LIFE_DOSSIER_v1 en opp CRM | Cotización multi-semana |
| Perfil interno | `vars.client_profile` | Tier, TTL, tags (no visible al cliente) |

### Tiers de relación (`classify-contact-odoo`)

| Tier | Criterio | Memoria bot |
|------|----------|-------------|
| `customer` | SO `sale`/`done` alguna vez **o** pedido/tarjeta activa | Larga — orders, dossier, hydrate |
| `warm_prospect` | Actividad comercial &lt; 14 días **o** opp `interes_confirmado` &lt; 30 días | Corta — hydrate quote |
| `cold_prospect` | Partner sin conversión + &gt; 14 días idle | **Mínima** — tratar como nuevo |
| `anonymous` | Sin partner Odoo | Solo hydrate reciente (&lt;14 d) si existe |

**Excepciones:** `kapso:keep_memory` en partner · SO histórico `sale`/`done` · asesor sticky se mantiene aunque expire memoria comercial.

---

## 4. Carril cliente — nodos y functions

### 4.1 Entrada (siempre en Start)

| Nodo | Function | Qué hace |
|------|----------|----------|
| policy-guard-input | `policy-guard-input` | Sanitiza texto; marca `spam_profile` (prefill Ads incompleto, audios basura) |
| staff-allowlist-check | `staff-allowlist-check` | `573213988464` Paola · `573103362484` Javier → staff |
| route-user-entry | `route-user-entry` | Edge `customer` \| `staff` |

### 4.2 Clasificación

| Nodo | Function | Salida vars |
|------|----------|-------------|
| classify-contact-odoo | `classify-contact-odoo` | `user.contact_segment`, `orders.active[]`, `session.continuity`, `client_profile`, advisor sticky |
| route-customer-entry | `route-customer-entry` | `new_customer` → vendedor · `existing_customer` → histórico |

**Segmento:** `existing_customer` solo si tier `customer` **o** SO/tarjeta activa — prospecto frío con CRM viejo va a **vendedor**.

### 4.3 Debounce y CRM seed

| Nodo | Function | Cuándo |
|------|----------|--------|
| wait_customer_burst | (wait ~30s) | Agrupa ráfagas |
| route-customer-burst-resume | `route-customer-burst-resume` | Spam/prefill → `ignore`/`ended`; timeout → sigue |
| ensure-crm-from-quote | `ensure-crm-from-quote` | Siembra/actualiza opp CRM desde `quote` |
| resolve-business-hours | `resolve-business-hours` | `business_mode`, `customer_send_ok`, `staff_notify_ok` |

### 4.4 Agente vendedor (v11 DeepSeek)

**Modelo:** `deepseek/deepseek-v4-flash-0731` · modo **`tool_only`** (solo `send_notification_to_user` llega al cliente).

**Tools del agente:**

| Tool Kapso | Function | Uso |
|------------|----------|-----|
| `buscar_producto_odoo` | `odoo-search-product-price` | Precio + foto tienda (`include_shop_media`) |
| `notificar_interes_ventas` | `notify-sales-interest` | CRM + aviso **un** asesor + handoff cliente |
| `enviar_ubicacion` | `enviar-ubicacion` | Pin mapa; `notify_staff: true` si llegó a puerta |
| `enviar_formulario_excel` | `enviar-formulario-excel` | Formulario Life (.xlsx) |
| `consultar_tarjeta_pedido` | `get-customer-card-scoped-odoo` | Seguimiento producción |
| `consultar_referencias_diseno` | `get-customer-design-references-scoped-odoo` | Diseños pasados |
| `interpret_quote_intent` | `interpret-quote-intent` | Clasifica interés (grafo refuerzo) |
| `enter_waiting` | (Kapso) | Cierra turno — **obligatorio** |
| `handoff_to_human` | (Kapso) | Solo si pide asesor/persona |

**Webhooks fuera del grafo:**

| Evento | Function |
|--------|----------|
| Cliente comparte contacto | `on-contact-shared` → wa.me al asesor asignado |
| Conv inactiva 180 min | `on-conversation-inactive` → ended |
| Presupuesto Odoo | `on-odoo-presupuesto` |

---

## 5. Router del agente vendedor (prioridad)

Lee al inicio: `get_whatsapp_context`, `get_current_datetime`, `get_variable` (`quote`, `service.*`, `session.continuity`, `client_profile`, `spam_profile`).

| # | Condición | Acción |
|---|-----------|--------|
| 0 | 22:00–06:00 o `customer_send_ok` false | Tools sí; **cero** WA; `enter_waiting` |
| 0b | `client_profile.memory_expired` o tier `cold_prospect` | **No** asumir historial; flujo prospecto nuevo (saludo estándar) |
| 1 | Spam / prefill Ads / `security.input_blocked` | Cero WA; `enter_waiting` |
| 2 | Mandó celular (10 dígitos o contacto) | *“Listo, un asesor le escribe por ese número.”* |
| 3 | Pide asesor / humano / llamada | `notificar_interes_ventas` + **solo** `advisor_phone_display` + `handoff_to_human` |
| 4 | FAQ tabla políticas | Respuesta fija; sin pregunta de cierre |
| 5 | Seguimiento pedido activo | `consultar_tarjeta_pedido`; no re-cotizar |
| 6 | Interés claro (dale, abono, confirmo) | `quote` + **notify** + copy horario + `enter_waiting` |
| 7 | Caliente en duda (negocia tallas/cantidad con precio ya dado) | **notify** + corto + waiting |
| 8 | Resto | Un avance de venta; pregunta solo si falta dato bloqueante |

**Hard rules transversales:**
- Un cliente = un asesor (nunca 310 y 321 juntos al cliente).
- No remate con pregunta si el cliente solo preguntó.
- Precio solo de tool/KB; no inventar.
- `$` solo cuando pidió valor o aceptó y pregunta abono.

---

## 6. Venta progresiva (ritmo)

```
producto/deporte → cantidad (mín. 6 mismo diseño) → foto/variantes → precio si lo pide → abono si aceptó
```

| Paso | Detalle | Tool / nota |
|------|---------|-------------|
| Producto | Uniforme = camiseta + pantaloneta + medias. Camiseta sola = producto 62 | `buscar_producto_odoo` |
| Cantidad | **Mínimo 6 del mismo producto y diseño** — no sumar modelos distintos | Corregir si mezclan polo+gorra+… |
| Foto cliente | `ask_about_file` → hechos (cuello, manga, logos). Sin “me encanta” | `quote.media_refs` |
| Variantes | Una por turno: cuello, manga, tela | Dry-fit default |
| Precio | Solo si pregunta cuánto / cotización | Tool obligatoria |
| Cierre | Interés claro → notify (no handoff automático) | `notificar_interes_ventas` |

---

## 7. Reglas comerciales (respuestas fijas)

### 7.1 Pedido mínimo

- **6 unidades del mismo producto y diseño** (camiseta, uniforme, buzo, peto, rompevientos, etc.).
- **No** completar 6 mezclando modelos (1 polo + 2 gorras + 1 camisa ≠ válido).
- Medias / pantalonetas / banderas **no** se venden solas; van con uniformes ≥ 6.

### 7.2 Arquero / portero

| Caso | Precio |
|------|--------|
| Mismo diseño que jugadores, **otro color** | **Mismo precio** del uniforme del equipo |
| Diseño **totalmente distinto** | **+$35.000** / unidad |
| Tope de gama | Conjunto arquero (178) ~ **$70.000** — confirmar; no asumir |

### 7.3 Uniforme — qué incluye

- **Todos:** camiseta + **pantaloneta** + **medias** (decir pantaloneta, no pantalón).
- **Fútbol:** medias semiprofesionales (base) o profesionales (+$7.000).
- **Basket / vóley / atletismo:** medias media caña (cortas).

### 7.4 Sobrecostos frecuentes (mín. 6 u.)

| Variante | Sobrecosto |
|----------|------------|
| Manga larga | +$3.000 |
| Cuello sport / especial / “con cuello” | +$3.000 **o** Camiseta Polo (61) ~$35.000 |
| Pantaloneta licra (voley/atletismo) | +$5.000 |
| Impermeable (fútbol/micro) | +$8.000 |
| Bolsillos | +$5.000 |
| Talla 2XL | +$7.000 · 3XL | +$10.000 |
| Dumonti (solo si piden) | ~+$15.000 vs dry-fit |
| Rompevientos forro PRESEAS | +$5.000 (~$65.000) |

### 7.5 Descuento / mayorista

*“Somos fabricantes: el precio ya es el mínimo de catálogo; no manejamos rebaja adicional por cantidad.”*

### 7.6 Deportes que **no** fabricamos

Ciclismo, natación, béisbol, hockey, patinaje, porras, equitación, motociclismo… → *“Por ahora no fabricamos uniformes de [deporte]. Trabajamos fútbol, baloncesto, voleibol y atletismo.”*

### 7.7 Logos

- **No:** Nike, Adidas, Puma, Saeta, FSS (marcas de ropa).
- **Sí:** logo empresa/equipo, escudos país, gráficos propios.

### 7.8 Pago y tiempos

- **50%** abono para iniciar · **50%** contra entrega.
- Medios: Nequi, Bancolombia, Daviplata (asesor confirma cuenta).
- **15 días hábiles** desde **aprobación del diseño** (compromiso cliente). Odoo tarea = 10 interno — ver wiki `life-plazos-entrega-odoo-vs-cliente`.
- Diseño de aprobación **después** del 50% — **no** muestras gratis ni “diseño de prueba” previas. **Prohibido** prometer envío de arte antes del abono.
- Licra / short ajustado (vóley/atletismo) = **+$5.000** — **nunca** “sin costo adicional”.

### 7.9 Envíos

Envia / Interrapidisimo (flete al recibir). Bogotá: moto. Recogida en fábrica Los Álamos.

### 7.10 IVA

Precios chat/catálogo **sin IVA** — mencionar **solo si preguntan**.

---

## 8. Formas de subir pedidos

### 8.1 Carril ventas (cliente → bot)

1. Conversación gradual → `quote.*` en vars.
2. Interés claro → `crear_presupuesto_odoo` → opp + SO draft en **Kapso pedidos** (12). Sin aviso a Paola/Javier.
3. Si pide asesor → `notify-sales-interest` (un teléfono) + handoff.
4. Cliente puede llenar **Formulario Excel** (`enviar_formulario_excel`) y reenviar por WA.

### 8.2 Carril staff (v10)

Pedido **ya sembrado** desde ventas. Staff:

- Consulta / corrige con tools (`buscar_pedido_odoo`, `corregir_pedido_odoo`, `crear_presupuesto_odoo`).
- Parseo listas: Excel, Word, imagen, PDF (`parsear-lista-*`, `clasificar-adjuntos-pedido`).
- Write pipeline: `validate-staff-write` → `build-quote-payload` → `odoo-create-lead-and-so`.
- Proyecto: origen Kapso → **Kapso pedidos** (12). Ingreso propio staff → Javier (8) / Paola (9).

### 8.3 Formatos de lista aceptados

| Formato | Tool / skill |
|---------|--------------|
| Excel Formulario Life | `enviar_formulario_excel` + cliente reenvía |
| Excel FORMATO PEDIDO LIFE | Staff parse (`parsear-lista-excel-pedido`) |
| Word lista familia | `parsear-lista-texto-pedido` / imagen |
| Imagen lista | `parsear-lista-imagen-pedido` |
| PDF impresión | `parsear-lista-pdf-pedido` (+ OCR local si sin texto) |

---

## 9. Notify + asignación asesor

**Function:** `notify-sales-interest` (`a2236fdc-…`)

1. `pickGlobalRoundRobinPhone` — alterna Paola/Javier por último `Asignado a` en CRM.
2. `claimAssignee` — sticky en **partner** (`kapso:advisor`); bootstrap solo opps **activas**.
3. Resuelve teléfono Kapso si vars traen solo BSUID.
4. Aviso staff corto: L1 resumen · L2 wa.me · L3 link Kapso verificado.
5. PATCH exec cliente → **`handoff`** (compose staff habilitado).
6. Dedupe outbound staff (anti-doble aviso).

**Intents:** `sales` · `needs_human` · `hot_lead_doubt` · (sin señal → no avisa).

**Puente:** `ensure-crm-from-quote` invoca notify en aceptación (`interes_confirmado`).

---

## 10. Agente histórico (existing_customer)

- Seguimiento pedido/tarjeta — **no** reinicia venta salvo pedido nuevo.
- Tools: `consultar_tarjeta_pedido`, `consultar_referencias_diseno`.
- Si quiere **otro pedido**: guarda `customer_line=returning_sale` → próximo inbound → **vendedor**.

---

## 11. Estados Kapso (cliente)

| Estado | Bot | Staff compose | Próximo inbound |
|--------|-----|---------------|-----------------|
| `waiting` | Reanuda mismo agente | Bloqueado | Reanuda |
| `handoff` | Callado | Abierto | No dispara workflow |
| `ended` | — | Abierto | Start + classify + hydrate/TTL |

---

## 12. KBs del agente vendedor

| KB | Contenido |
|----|-----------|
| `life_horarios_ventas` | Ventanas envío, copy hoy/mañana, handoff |
| `life_reglas_comerciales` | FAQ, mínimos, arquero, logos, pago |
| `life_catalogo_precios` | IDs producto, alias, sobrecostos |
| `life_lenguaje_cliente_productos` | Cómo dice el cliente → producto Odoo |
| `life_tienda_fotos` | URLs shop, cuándo mandar foto |
| `life_flujo_audio_foto` | Audio/foto/adjuntos |
| `kapso_whatsapp_patterns` | Patrones WA |

---

## 13. Chequeos operativos (debug)

| Síntoma | Revisar |
|---------|---------|
| Staff no puede escribir | Exec en `waiting` → handoff o ended |
| Link Kapso abre otro cliente | `resolveVerifiedConversationId` / tel mismatch |
| Todo a Javier | Partner bootstrap · opp activa más reciente · round-robin |
| “Teléfono no público” con BSUID | Fallback API Kapso conv · `buildWaMeLink` 10 dígitos |
| Bot repregunta cotización vieja | `client_profile.memory_expired` · TTL 14d |
| Cliente no recibe WA de noche | `customer_send_ok` — correcto por diseño |
| Lead sin asignar | notify desplegado · `claimAssignee` · logs function |

---

## 14. Referencias cruzadas

- Plan tags/memoria: `client_profile_tags_plan.md`
- Contrato vars: `vars_contract.md`
- Staff v10: `staff_graph_v10.md`
- Prompt vendedor: `prompts/agent_vendedor_v11_deepseek.md`
- Wiki proyecto: `wiki/projects/lifedeportes.md`
