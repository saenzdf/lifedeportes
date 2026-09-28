# Plan: Handoff a Paola — aviso al cliente + resumen con wa.me + fotos bajo pedido

> **Para Hermes:** implementación **de pruebas** (no prod). Cambios **aditivos y quirúrgicos** a la function
> `notify_sales_interest` y **sin** tocar config de agente / cambios manuales. Validar en test antes de prod.

**Goal:** Cuando hay interés claro (abono / "sí adelante" / aceptación), (1) al **cliente** se le avisa que su
pedido lo tomó un asesor; (2) a **Paola** se le envía el resumen del pedido **con un enlace `wa.me`** que la lleva
directo a hablar con el cliente; (3) las **fotos de referencia** NO se envían automáticamente — Paola puede pedirlas
por staff (ya existe `consultar_referencias_diseno`), sin duplicar.

**Architecture:** Extender la function existente `notify_sales_interest` (id `a2236fdc-…`, tool `notificar_interes_ventas`,
ya cableada en carril cliente). Todo el cambio vive en el `.js` de esa function y su bundle `_deploy.js`. No se toca
prompt vendedor, no se toca topología del grafo, no se añade function nueva (la de fotos ya existe en staff).

**Tech Stack:** Node (Cloudflare Workers style) · API REST Kapso (Meta WhatsApp Cloud API v24.0) · Odoo JSON-RPC.

---

## Estado verificado (contexto real, no supuesto)

| Pieza | Estado |
|-------|--------|
| `notify_sales_interest` (id `a2236fdc-…`) | ✅ Deployed, cableada en carril cliente (`notificar_interes_ventas`) |
| Siembra/actualiza `crm.lead` con `LIFE_DOSSIER_v1` + adjunta imágenes como `ir.attachment` | ✅ Ya funciona |
| Envía **texto** a líneas comerciales con resumen | ✅ Ya funciona |
| Destinos default en código: **Javier `573103362484`, Paola `573213988464`** | ✅ Coincide con `staff_only_mode.md` |
| Secret `LIFE_SALES_NOTIFY_PHONES` en la function | ❌ No está (usa default del código) |
| Secret `LIFE_SALES_NOTIFY_ENABLED` | Presente; **en pruebas debe estar `false`** (ver §Pitfalls) |
| Link `wa.me` al cliente en el mensaje a Paola | ❌ Falta (hoy solo `Cliente WA: <tel>`) |
| Mensaje de aviso **al cliente** ("pedido tomado por asesor") | ❌ Falta en la function |
| Fotos de referencia a Paola bajo pedido (staff) | ✅ `consultar_referencias_diseno` (get-customer-design-references-scoped-odoo) ya existe |

**Números confirmados (`kapso/docs/staff_only_mode.md`):**
- Paola `573213988464` · Proyecto Paola (id 9)
- Javier Ayala `573103362484` · Proyecto Javier (id 8)

---

## Cambios propuestos

### Task 1 — Añadir link `wa.me` al mensaje de Paola/Javier (en `buildNotifyBody`)

**Files:**
- Modify: `kapso/functions/notify_sales_interest.js` → `buildNotifyBody()` (~línea 461)
- Modify: `kapso/functions/notify_sales_interest_deploy.js` (bundle — se regenera desde la fuente)

**Step 1 — helper `buildWaMeLink(customerPhone, customerName, product)`**

Añadir una función junto a `buildNotifyBody`:

```js
function buildWaMeLink(customerPhone, customerName, product) {
  const digits = String(customerPhone || "").replace(/\D/g, "");
  const national = digits.startsWith("57") && digits.length >= 12 ? digits : digits; // e164 esperado
  if (!national || national.length < 11) return null;
  const greeting = `Hola ${(customerName || "cliente")}, le escribo de Life Deportes por su pedido de ${product || "uniformes"}`;
  return `https://wa.me/${national}?text=${encodeURIComponent(greeting)}`;
}
```

**Step 2 — insertar la línea del enlace en `buildNotifyBody`**

Reemplazar la línea `\`Cliente WA: ${customerPhone || "sin teléfono"}\`` por:

```js
const waLink = buildWaMeLink(customerPhone, customerName, product);
lines.push(waLink
  ? `📲 Contactar cliente: ${waLink}`
  : `Cliente WA: ${customerPhone || "sin teléfono"}`);
```

**Step 3 — verificación (local)**

```bash
cd /Users/diego/Documents/Sync/projects/lifedeportes && node --check kapso/functions/notify_sales_interest.js
# sin errores de sintaxis
```
Assert manual del output de `buildWaMeLink("573213988464"... )` → `https://wa.me/573213988464?text=Hola%20...`

**Step 4 — commit** (solo fuente; deploy aparte en Task 3)

---

### Task 2 — Mensaje de aviso al cliente ("su pedido lo tomó un asesor")

**Decisión de diseño (bajo petición explícita del usuario):** el aviso al cliente **no** se hace con
`handoff_to_human` ni cambiando el prompt vendedor. Se envía desde la misma function `notify_sales_interest`
como un **mensaje de texto al cliente** (`to = vars.user.wa_id` / `customerPhone`), dentro de la ventana de 24 h
(no requiere template Meta).

**Files:**
- Modify: `kapso/functions/notify_sales_interest.js` → `handler()` (bloque `notifyEnabled`, ~línea 1357)
- Modify: `kapso/functions/notify_sales_interest_deploy.js`

**Step 1 — enviar texto al cliente**

Dentro de `handler`, después del `text = buildNotifyBody(...)`, añadir envío al cliente **solo si** hay
`customerPhone` válido y no es uno de los destinatarios staff (anti-bucle):

```js
// Aviso al cliente: pedido tomado por asesor (NO handoff_to_human; solo texto).
let clientAck = { ok: false, skipped: true, reason: "no_customer_phone" };
const clientAckText =
  "¡Listo! ✅ Tu pedido lo tomó un asesor de ventas de Life Deportes y te contactará en breve para " +
  "confirmar el abono del 50% y arrancar la producción. Gracias por tu confianza 🙏";
const staffPhones = (destinations.length ? destinations : []).map((p) => String(p).replace(/\D/g, ""));
if (customerPhone && !staffPhones.includes(customerPhone)) {
  clientAck = await sendWhatsAppText(env, customerPhone, clientAckText);
}
```

> ⚠️ Regla anti-insistencia (KB `life_reglas_comerciales_v1.md` §Límites): este aviso **solo** cuando se dispara
> `notify` (interés claro + payload). No spamear: la function ya es idempotente por `fingerprint` (`vars.sales_notify.status === "sent"`).

**Step 2 — reflejar en el `vars` de respuesta**

Añadir `client_ack: clientAck` dentro del objeto `sales_notify` de la respuesta (junto a `whatsapp`).

**Step 3 — verificación**
```bash
node --check kapso/functions/notify_sales_interest.js
```

---

### Task 3 — Deploy en pruebas + validación (NO prod)

> ⚠️ **Antes de desplegar:** confirmar que `LIFE_SALES_NOTIFY_ENABLED` está en `false` en la function para que
> **no** se envíe WhatsApp real a Paola/Javier durante las pruebas (el aviso al cliente solo si `customerPhone`
> es un número de prueba). Para pruebas usar un número controlado o Development env (`LIFE_FORCE_STAFF_LANE`).

**Files:**
- Run: `kapso/scripts/deploy_notify_sales_interest.js` (despliega la function + secrets)
- Docs a actualizar: `kapso/docs/lane_goals.md`, `kapso/docs/mejora-continua-kapso.md`, KB staff

**Step 1 — deploy**
```bash
cd /Users/diego/Documents/Sync/projects/lifedeportes && set -a; source .env; set +a
env -u PYTHONPATH node kapso/scripts/deploy_notify_sales_interest.js
# espera status deployed/active
```

**Step 2 — validación del grafo**
```bash
node kapso/scripts/validate-graph-lifedeportes.js kapso/workflow_lifedeportes_sales_inbound_v10.json
# valid: true, errors: []
```

**Step 3 — prueba real (Development / número de prueba)**
1. En Kapso Inbox: enviar un inbound de prueba con intención de abono/pago (número de prueba).
2. Verificar en la ejecución: `vars.sales_notify.whatsapp[]` con el mensaje a Paola **incluyendo `wa.me` link**, y
   `vars.sales_notify.client_ack` con `ok: true` (aviso al cliente).
3. Verificar que el link `wa.me/57<cliente>?text=...` abre el chat correcto con el saludo precargado.
4. **Fotos:** probar por carril staff que `consultar_referencias_diseno` devuelve las referencias del pedido (bajo
   pedido, no automático). Confirmar si basta con devolver URLs/adjuntos o si Paola requiere el envío como media
   (open question).

**Step 4 — log wiki** (`wiki/log.md`, append-only, `agent:hermes`)
```
## [YYYY-MM-DD] deploy | Handoff Paola: aviso al cliente + wa.me + fotos bajo pedido | agent:hermes
- bullets: qué se tocó, IDs, resultado
```

---

## Files that change

- `kapso/functions/notify_sales_interest.js` (fuente) — añadir `buildWaMeLink`, modificar `buildNotifyBody`, `handler`
- `kapso/functions/notify_sales_interest_deploy.js` (bundle sincronizado)
- (No) prompts vendedor/staff · (No) topología del grafo · (No) functions de staff/fotos
- Docs: `kapso/docs/lane_goals.md` (mencionar aviso al cliente + wa.me), KB `life_reglas_staff_v1.md` (opcional, nota de fotos bajo pedido)

---

## Tests / validation

1. `node --check` en ambas copias de la function.
2. `validate-graph-lifedeportes.js` → `valid: true`.
3. Ejecución de prueba en Kapso Development: assert `wa.me` link presente en el mensaje a Paola; `client_ack.ok=true`.
4. Confirmar **sin** envio real a Paola/Javier en pruebas (`LIFE_SALES_NOTIFY_ENABLED=false`).

---

## Risks, tradeoffs, open questions

- **P1 — Fotos a Paola:** `consultar_referencias_diseno` devuelve referencias/adjuntos (¿URLs? ¿requiere envío media?).
  El usuario pide "que no lo haga automático, solo bajo pedido". **Decisión:** no se cambia esa function; se valida
  en pruebas si el output basta o si hace falta un envío media explícito (entonces es un Task 4 aparte).
- **P2 — Aviso al cliente y ventana 24h:** si el cliente está fuera de la ventana, un texto libre falla. En ese caso
  habría que usar un template Meta (`pedido_tomado_asesor`) o no enviarlo. Confirmar en pruebas.
- **P3 — Anti-spam:** el aviso al cliente debe dispararse solo con interés claro (gate de `notify`), nunca en cada
  turno. La idempotencia por `fingerprint` ya lo limita a 1 por sesión.
- **P4 — No romper config:** no se toca prompt ni topología ni cambios manuales del usuario. Solo código de function.
- **P5 — Números:** Paola/Javier como destinos por default del código; si se quiere solo Paola, setear
  `LIFE_SALES_NOTIFY_PHONES=573213988464` como secret (no default).

---

## Done criteria

- [ ] `wa.me` link al cliente presente en el mensaje de Paola/Javier.
- [ ] Aviso al cliente ("su pedido lo tomó un asesor") enviado por la function (no por handoff_to_human).
- [ ] Fotos de referencia se siguen consultando **bajo pedido** por staff (sin cambio automático).
- [ ] Ningún cambio en prompt de agente, topología del grafo ni config manual del usuario.
- [ ] Validado en pruebas con `LIFE_SALES_NOTIFY_ENABLED=false`; listo para flip a prod.
