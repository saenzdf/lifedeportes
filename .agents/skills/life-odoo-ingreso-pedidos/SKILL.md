---
name: life-odoo-ingreso-pedidos
description: >-
  Ingresa pedidos Life Deportes en Odoo vía MCP: interpreta texto/audio/foto del
  cliente, resuelve producto (camiseta sola vs uniforme), Partner, CRM, SO borrador,
  línea Diseño $0 y línea(s) de producto. Usar al pedir ingresar/crear/subir pedido
  en Odoo, cotización borrador, SO, o digitalizar pedido WhatsApp sin Kapso.
---

# Life Deportes — Ingreso de pedido en Odoo (Antigravity + MCP)

Skill **autocontenida** para PC con Antigravity y **MCP Odoo** Life. No requiere Kapso ni este repositorio.

Alineada con KB Kapso 2026-07: interpretación de producto, camiseta vs uniforme, media (audio/foto), reglas comerciales Engativá.
Para la guía conceptual y detallada de flujos, casos de productos, adjuntos y Kapso, ver skill maestro [`life-guia-flujos-y-listas`](../life-guia-flujos-y-listas/SKILL.md).

## Qué hace (y qué no)

| Sí (preventa / ingreso) | No |
|-------------------------|-----|
| Interpretar pedido (texto, transcript, notas de foto) | Confirmar SO (`action_confirm`) |
| Crear/reutilizar `res.partner` | Cobrar abono 50% |
| `crm.lead` + `sale.order` **borrador** | Subir Excel tallas a tarea diseño |
| Línea **Diseño** **$0** (id 504) | Asignar tarjeta Kanban |
| Línea(s) producto con qty y precio Odoo | Responder WhatsApp al cliente |

Tallas/nombres/números por jugador = **posventa** → anotar en `note` del SO; no bloquear ingreso.

**Formato de la nota:** ver [notas-odoo.md](notas-odoo.md) — listas en `sale.order.note` y `project.task.description` **sin** nombre/teléfono del cliente ni montos (Odoo ya los tiene en partner y líneas).

---

## Reglas de producto (obligatorias — jul 2026)

| Cliente / operaria dice | Ingresar como | Plantilla Odoo ref. |
|-------------------------|---------------|---------------------|
| **camiseta**, **camisa**, **camisetas** | Camiseta sola dry-fit | **62** |
| **camiseta de fútbol** / camiseta futbol | Camiseta sola dry-fit (deporte = contexto) | **62** |
| **uniforme**, **uniformes**, **kit** | Uniforme completo | **115** fútbol, **23** basket, **31** voley, **35** atletismo |
| **solo camisa** / solo la camiseta | Camiseta sola | **62** |
| cuello **polo** (camiseta) | Camiseta polo sin botones | **61** |
| uniforme **polo** | Uniformes con cuello polo | **947** |
| **arquero** / portero | Conjunto arquero (línea aparte) | **178** |
| **buzo**, **hoodie**, **sudadera** | Sudaderas algodón lycrado (u otro catálogo) | **1811** |
| **voley** / volei | Voleibol | **31** |
| microfútbol + uniforme | Fútbol + pant. impermeable si aplica | **1815** o **115** |

**No preguntar** “¿camiseta o uniforme?” si dijeron **camiseta** o **camiseta de fútbol**.

**Sí preguntar** solo si no nombraron la prenda o si hay señales incompatibles entre texto y adjunto. *“10 camisetas para el equipo”* sigue siendo camiseta sola.

Detalle completo: [interpretacion.md](interpretacion.md) · Catálogo: [catalogo.md](catalogo.md)

---

## Entrada desde WhatsApp (texto, audio, foto)

Antigravity **no transcribe audio** — la operaria pega lo que tenga:

| Fuente | Qué hacer |
|--------|-----------|
| **Texto** | Interpretar con reglas arriba |
| **Transcript** (Kapso/wacli) | Pegar transcript; tratar como texto |
| **Foto** | Operaria describe: polo vs V/redondo, manga corta/larga/sisa, ¿solo camiseta o se ve short? |
| **Audio + foto** | Transcript (cantidad/deporte) + descripción visual (cuello/manga) |

Checklist interpretación antes de Odoo:

```
- [ ] Tipo prenda: camiseta_sola | uniforme_completo | arquero | buzo | otro
- [ ] Deporte (si aplica): futbol | baloncesto | voleibol | atletismo
- [ ] Variante: cuello (V/redondo/polo), manga (corta/larga/sisa), tela (dry fit / dumonti)
- [ ] Cantidad ≥ 6 del mismo artículo
- [ ] Precio = list_price Odoo salvo precio acordado explícito
```

---

## Contexto comercial (referencia)

- **Empresa:** LIFE SOLUCIONES DEPORTIVAS SAS — Cl. 66a #98a 12, Los Álamos, Engativá, Bogotá
- **Horario:** Lun–Vie 8–18 · Sáb 8–13
- **Mínimo:** 6 u. mismo producto/diseño
- **Abono:** 50% producción · 50% antes entrega (coordina humano)
- **Fabricación:** ~10 días hábiles post-abono · entrega ~15 días hábiles post-diseño
- **Deportes SÍ:** fútbol, baloncesto, voleibol, atletismo

---

## Prerrequisito MCP Odoo

Paso 0 (primera vez en PC):

1. `product.product` id **504** — servicio Diseño (línea $0). Verificar nombre contiene Diseño servicio.
2. Plantilla **115** → anotar `product.product` variante venta (no asumir id).
3. Plantilla **62** camiseta dry-fit → variante venta.
4. `project.project` ids **8** (Javier), **9** (Paola) — referencia en `note`.

---

## Datos a pedir (checklist)

```
- [ ] Nombre cliente/club (display_name)
- [ ] Teléfono 573XXXXXXXXX (solo dígitos)
- [ ] Producto interpretado + cantidad (≥ 6)
- [ ] Variante si aplica (polo, manga larga, dumonti…)
- [ ] Notas (diseño, proyecto Javier/Paola, fecha)
- [ ] x_studio_nombre_de_pedido (equipo en factura, opcional)
```

Una pregunta por mensaje si falta algo crítico.

---

## Flujo Odoo (orden estricto)

**Kapso staff (jul 2026, ADR 0008):** oportunidad CRM primero (cliente + estimado); SO solo con lista+refs + `HAZ PRESUPUESTO`. En MCP manual se puede seguir el orden completo abajo cuando ya hay lista.

```
1. Validar reglas (cantidad, deporte, interpretación producto)
2. Resolver product.template → product.product + list_price
3. res.partner (teléfono)
4. crm.lead (opportunity) — etapa temprana Kapso: basta cliente + estimado en description
5. sale.order (draft) — solo cuando lista+refs listas (Kapso: HAZ PRESUPUESTO)
6. sale.order.line — Diseño 504 × 1 × $0
7. sale.order.line — producto(s) principal(es)
8. Escribir `sale.order.note` (HTML) y, si hay tarjeta, `project.task.description` con el **mismo** HTML — reglas en [notas-odoo.md](notas-odoo.md)
9. read sale.order → reportar S0xxxx
```

### 1. Validar

- Cantidad ≥ 6 del **mismo** producto/diseño.
- Deporte permitido.
- Camiseta sola con 6+ u. → **válido** (template 62 u otro según variante).
- Arquero aparte del lote jugadores → **segunda línea** mismo SO o aclarar con operaria.

### 2. Resolver producto y variante

1. Aplicar [interpretacion.md](interpretacion.md) — **deporte primero** (voley ≠ fútbol).
2. `search_read` `product.template`: `[('name','ilike','...'),('sale_ok','=',True)]`.
3. Si hay ambigüedad real sin prenda explícita o señales incompatibles → una pregunta.
4. `search_read` `product.product`: `[('product_tmpl_id','=',TEMPLATE_ID)]` con atributos de cada variante.
5. **Validar combinación** (pantaloneta/licra, cuello, manga siza/china/corta/larga según deporte). Ver tabla en [catalogo.md](catalogo.md).
6. Si la variante **no existe** en Odoo → **no inventar** otra plantilla; anotar bloqueador y preguntar a operaria.
7. Reglas duras:
   - **Licra / lycra** en uniforme completo → solo **Uniforme de voleibol (31)**. En fútbol (115) **no hay** variante licra.
   - **Manga larga** en voleibol → **no existe** en Odoo; anotar excepción en nota (+$3k) o preguntar operaria.
   - **Manga corta** en voleibol → variante **Corta** (ej. licra+V **12202**). **No** confundir con manga china (11144).
8. `price_unit` = `list_price` de la variante salvo precio acordado explícito en el chat.
9. Varias variantes en un pedido → **una línea por `product.product` id** (no mezclar en una sola línea genérica).

### 3–8. Partner, Lead, SO, líneas

Igual que antes — ver [ejemplos.md](ejemplos.md).

**Línea Diseño obligatoria:**

```json
{ "order_id": <id>, "product_id": 504, "name": "Diseño", "product_uom_qty": 1, "price_unit": 0 }
```

**No** `action_confirm`. Estado `draft`.

---

## Pedidos compuestos

| Caso | Odoo |
|------|------|
| 20 uniformes jugador + 2 arquero | 1 SO: línea uniforme ×20 + línea arquero ×2 (+ Diseño $0) |
| 56 uniformes + 20 hoodies | Preferible **2 SO** o 2 líneas producto distintas; no mezclar mínimo 6 entre tipos |
| Dry fit y Dumonti | 2 líneas o 2 borradores según operación |

---

## Reglas de oro

1. Nunca confirmar SO ni pagos (`action_confirm` prohibido).
2. Siempre línea Diseño **504** a **$0** (6+ u.).
3. Líneas usan **`product.product`** con variante real, no template ni id “cualquiera” del mismo template.
4. Teléfono **573…** sin + ni espacios.
5. **Camiseta** = camiseta sola; **uniforme** = completo — no invertir.
6. **Deporte correcto** antes de variante (voleibol 31, fútbol 115, …).
7. **Variante inexistente** → bloquear ingreso o preguntar; nunca fútbol + licra ni manga larga en voley.
8. Español colombiano, sin emojis.

---

## Confirmación — solo Diego / operaria en Odoo

**El agente no confirma cotizaciones.** Eso lo hace la operaria en la interfaz de Odoo.

| Agente | Operaria (Odoo) |
|--------|-----------------|
| Crear SO **borrador** (`draft`) | Revisar líneas, nota, adjuntos |
| Reportar número `S0xxxx` | **Confirmar** el presupuesto cuando esté listo |
| Nunca `action_confirm` | Confirmar abonos / pagos |

- **No** preguntar *"¿Confirmo borrador?"* ni *"¿Confirmo la cotización?"* — crear el borrador cuando los datos estén completos (o la operaria diga *ingrésalo* / *créalo*) y avisar el número.
- Si falta dato crítico (variante ambigua, cantidad &lt; 6): **una pregunta** y esperar; no crear SO incompleto.

---

## Archivos

- [interpretacion.md](interpretacion.md) — lenguaje cliente, audio/foto, variantes
- [notas-odoo.md](notas-odoo.md) — HTML en presupuesto y tarea (sin cliente ni precios en listas)
- [adjuntos-odoo.md](adjuntos-odoo.md) — fotos en SO → tarea (automatización Studio)
- [catalogo.md](catalogo.md) — IDs y precios desde
- [ejemplos.md](ejemplos.md) — casos completos
- [INSTALACION.md](INSTALACION.md) — copiar a otro PC

---

## Relación Kapso

Equivalente manual de `build-quote-payload` + `odoo-create-lead-and-so` + reglas KB `life_lenguaje_cliente_productos` / `interpret-quote-intent`. Skill legacy `life-ingreso-pedidos` (wacli) → usar esta.
