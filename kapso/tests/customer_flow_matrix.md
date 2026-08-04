# Matriz de prueba — flujo cliente (sin decides post-agente)

**Modelo:** cada mensaje = nuevo trigger desde Start. Agentes usan `enter_waiting`; cierre con `handoff_to_human`.  
**Prerequisitos:** test mode (`kapso/docs/test_mode.md`), secrets Odoo, grafo sin `route-intent-next` en carril cliente.

Ver arquitectura: `kapso/docs/graph_architecture.md`

---

## C1 — Cliente nuevo, venta gradual

| Paso | Acción | Esperado |
|------|--------|----------|
| 1 | Cliente: "Hola, quiero uniformes" | Vendedor: saludo Life Deportes, sublimación, mínimo 6 u, **sin** precio total de golpe |
| 2 | Cliente responde cantidad/deporte | Una pregunta a la vez; sin emojis |
| 3 | Inspeccionar execution | Agente usó `enter_waiting`; **no** hay nodo Decision post-vendedor en el run |
| 4 | Cliente pide cotización con producto+cantidad claros | `buscar_producto_odoo` o catálogo; unitario + total |

## C2 — Cierre e handoff

| Paso | Acción | Esperado |
|------|--------|----------|
| 1 | Cliente acepta presupuesto | Frase exacta de cierre 50% |
| 2 | | `quote.product_text`, `quote.quantity` guardados |
| 3 | | `handoff_to_human` (inbox abierto) |
| 4 | Siguiente mensaje cliente | Re-entra Start → classify → **sigue vendedor o humano en inbox** (no crash por decide faltante) |

## C3 — Tras pedido en Odoo (staff)

| Paso | Acción | Esperado |
|------|--------|----------|
| 1 | Staff `SUBIR PEDIDO` + confirm | SO creada, handoff staff |
| 2 | Mismo cliente escribe "¿cómo va mi pedido?" | `classify` → `existing_customer` → **histórico** |
| 3 | | `consultar_tarjeta_pedido` lista tarjeta activa o detalle |

## C4 — Histórico → nueva venta (sin decide post-histórico)

| Paso | Acción | Esperado |
|------|--------|----------|
| 1 | Cliente existente: "quiero otro uniforme" | Histórico confirma paso a ventas |
| 2 | | `customer_line=returning_sale` guardado + `enter_waiting` |
| 3 | Cliente: "necesito 10 de fútbol" | **Nuevo** run → `route-customer-entry` → edge `new_customer` → **vendedor** |
| 4 | | Cotización; no usa tools de histórico |

## C5 — Consultas histórico

| Paso | Acción | Esperado |
|------|--------|----------|
| 1 | "¿tienen el diseño del pedido pasado?" | `consultar_referencias_diseno` |
| 2 | Pedido inexistente | Mensaje claro; no inventar |

## C6 — Policy

| Paso | Acción | Esperado |
|------|--------|----------|
| 1 | Jailbreak obvio | `policy-guard-input` bloquea |
| 2 | Staff `SUBIR PEDIDO` | No bloqueado |

---

## Debug execution

```bash
export KAPSO_API_BASE_URL=https://api.kapso.ai
node ~/.agents/skills/automate-whatsapp/scripts/list-executions.js 8995b14c-d852-4fb3-bceb-8a51a6ccc2c6
node ~/.agents/skills/automate-whatsapp/scripts/get-execution.js <execution-id>
node ~/.agents/skills/automate-whatsapp/scripts/get-context-value.js <execution-id> --variable-path vars.customer_line
```

### Checklist por ejecución

- [ ] ¿Pasó por `classify-contact-odoo`?
- [ ] ¿Edge correcto en `route-customer-entry`?
- [ ] ¿Agente terminó con `enter_waiting` (chat) o `handoff_to_human` (cierre)?
- [ ] ¿**No** apareció `route-intent-next` en carril cliente?

---

## Automatizado (router returning_sale)

Añadir a `tests/run_staff_function_tests.js` o script aparte:

```bash
node -e "
const h = require('./kapso/functions/route_customer_entry.js');
// mock: existing_customer + returning_sale → new_customer edge
"
```

(Pendiente: test unitario formal en próxima pasada de debug.)
