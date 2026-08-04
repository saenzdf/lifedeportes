# Plan: follow-up WA + templates + CRM mañana 7:00 + webhook Presupuesto

Fecha: 2026-07-27 · Fuente: Kapso conversaciones (~20 jul–27 jul) · phone `1095603153637786`

Scratch: `scratch/followup_2026-07-27/` (classified + chat tails).

---

## 1. Qué vimos en la última semana

~83 chats con actividad ≥ 20 jul. ~14 son Meta Ads prefill (`Hola, quiero cotizar…`) sin respuesta real → **ignorar** (ya hay edge `ignore` en el grafo).

### 1.1 Life debe seguir (prioridad)

| Cliente | Tel | Estado | Acción sugerida | ¿CRM? | ¿Template >24h? |
|---------|-----|--------|-----------------|-------|-----------------|
| **Así Es La Vida** | 573207640189 | Sáb 18: aceptó cotización 10 unif. + lista nombres/tallas; bot prometió **confirmación lunes mañana** y **nunca escribió** | `retomar_pedido` + crear oportunidad ya | **Sí** (interés claro + payload) | **Sí** (ventana 24h muerta) |
| **Jan** | 573504987921 | “Deseo hacer el pedido”; bot registró 9 unif. + pendiente tela Hidrotec; esperaba asesor | `retomar_pedido` (+ luego `abono_50` cuando cierren tela) | **Sí** | **Sí** |
| **Juan Pablo Segura** | 573154081111 | Pedido confirmado $2.02M; pidió contacto para abono; **aún sin contacto humano**; dijo gracias tras números | Llamar/WA humano **hoy**; si >24h sin reply → `abono_50` | **Sí** (ya “confirmado”) | `abono_50` |
| **Valentina** | 573125012480 | Abono 50% el **lunes** ($165k de $330k, 11 camisetas); bot prometió escribir lunes | Lunes AM: `abono_50` + CRM | **Sí** | Si no hay sesión: template |
| **JR** | 573046432036 | Transferencia **viernes**; pidió número de cuenta; bot pospuso a “asesor” | Viernes AM: `abono_50` (cuenta real) + CRM | **Sí** | Template si >24h |
| **Emily Zuluaga** | 573052656508 | “Mañana te envío listado y el 50%” (23 camisetas CDI $690k); esperando logos/listado | Esperar inbound; si no llega → soft `retomar_pedido` | **Sí** (interés claro) | Solo si >24h sin respuesta Life |
| **Sebastián Martinez** | 573204691043 | 24 unif. + bandera; preguntó abono 50%; sin cuenta | `abono_50` cuando confirmen | **Sí** si “sí adelante”; si solo preguntó abono sin cerrar → semilla opcional | Template si fuera ventana |
| **Victor.E** | 573194249321 | 60 camisetas + 60 sudaderas + 16 chaquetas; Javier Ayala debía cotizar; cliente “Si porfa” sobre pantalón sudadera | Humano/Javier retoma; CRM estimado | **Sí** (volumen alto) | Si >24h |
| **Jaime Anaya** | 573003928039 | 20 unif. + entrenador; pidió dos precios; ball con cliente | No acosar; si no vuelve en 48–72h soft follow-up | Solo si acepta | Opcional marketing/utility |
| **Julian B** | 573209779415 | 9 voleibol $450k; bot preguntó colores (hoy) | Esperar colores (sesión abierta) | Aún exploratorio | No |

### 1.2 No crear CRM (piensa / consulta / no aplica)

| Cliente | Motivo |
|---------|--------|
| **Yeison** | “Bueno voy a consultarlo con el equipo y mañana te doy razón” → **no oportunidad** hasta que vuelva con sí |
| **Aleee** | Soft close “si más adelante…” |
| **Johan** | Natación / fuera de línea — cerrado bien |
| **Ads prefill** | Sin habla real |

### 1.3 Respuestas de seguimiento (sesión <24h, texto libre)

- **Julian:** esperar colores; si no, mañana soft.
- **Emily:** si escribe → pedir logos PNG + listado + confirmar abono.
- **Stefannia / My Flia / David O:** hay preguntas abiertas (tela, audio, plazos) — responder en sesión o template corto de retoma si ya pasó 24h.

---

## 2. Templates (copy aprobado Diego 2026-07-27)

Categoría: **UTILITY** · idioma `es` · sin variables ni botones.

### 2.1 `retomar_pedido_v2` — solo staff / agente bajo orden

(Meta no permite reusar el nombre `retomar_pedido` tras REJECTED.)

```
Hola, te escribimos para confirmar o retomar su pedido.
```

WABA id **1381646390243187** · status PENDING.

### 2.2 `abono_50_cuentas`

```
Hola, Para pagar su orden por favor enviar el 50% para empezar.
Bancolombia: 54793749654
Davivienda: 108900235772 NIT 901164485
Bre-B: 0050571942
```

JSON: `kapso/assets/templates/abono_50_cuentas.json`.
WABA id **1837702047209606** · status PENDING.

### 2.3 Presupuesto Odoo → Kapso (no template)

Webhook `on_odoo_presupuesto`: actualiza `vars.quote.status=presupuesto` / `order_state`. **Sin WhatsApp al cliente.**

---

## 3. CRM: as-they-come + barrido 7:00 a.m.

### 3.1 Gap actual

`notificar_interes_ventas` hoy:

1. Guarda fingerprint / avisa WA a líneas comerciales (si enabled).
2. **No crea** `crm.lead` en Odoo.

La oportunidad real se crea después por **staff** (`odoo_create_lead_and_so` en modo `opportunity_only` + `LIFE_DOSSIER_v1`).

Por eso casos como Así Es La Vida / Jan quedan “prometidos” sin tarjeta CRM.

### 3.2 Regla de negocio (gate)

Crear/actualizar oportunidad **solo si**:

| Gate | Sí | No |
|------|----|----|
| Intención | “sí”, “listo”, “deseo hacer el pedido”, “te mando el 50%”, “cómo pago” **con** aceptación | “voy a pensarlo”, “consulto con el equipo”, “mañana te digo”, soft close |
| Payload mínimo | producto + cantidad (≥6) **o** lista/nombres **o** total cotizado + deporte | solo saludo / precio exploratorio sin cierre |
| Quote | `quoteLooksUseful` + fingerprint | ads prefill |

Clasificador sugerido en Kapso function (antes del write Odoo):

```
intent ∈ {accepted, deposit_intent, order_confirm}
NOT intent ∈ {thinking, consulting, soft_close}
AND (qty≥6 AND product) OR has_list OR (unit_cop AND qty)
```

### 3.3 As-they-come (preferido)

En el mismo path de `notificar_interes_ventas` (o function hermana `seed_crm_opportunity`):

1. Gate §3.2.
2. `POST` Odoo `crm.lead` (prod) con:
   - partner por teléfono WA
   - nombre / estimado / `LIFE_DOSSIER_v1` desde `vars.quote`
   - stage: **Nueva** / primer stage pipeline Life
   - `kapso_conversation_id` en dossier o campo Studio
3. Idempotencia: fingerprint conversación+quote (ya existe en notify).
4. Mensaje cliente: copy `life_horarios_ventas` §4 (hoy / mañana mañana) — **sin** decir “ya hay presupuesto” si solo hay oportunidad.

Fuera de horario: igual se **crea** la oportunidad (as-they-come); el copy al cliente dice revisión **siguiente día hábil**.

### 3.4 Barrido 7:00 a.m. America/Bogota (lunes–sábado)

Job (Kapso scheduled workflow **o** cron → function) — **solo CRM / backlog interno**, sin WA al cliente:

1. Listar conversaciones con `quote.status=interested` / notify fingerprint **sin** `crm.lead_id`.
2. Re-aplicar gate §3.2 (por si el cliente dijo “consultar” después).
3. Crear oportunidades faltantes en orden FIFO (`notified_at`).
4. Marcar en dossier / nota CRM “fuera de ventana 24h — candidato `retomar_pedido`” para que **staff** decida y dispare el template (ellos o agente bajo orden).

**Prohibido** en este job: enviar `retomar_pedido`, `abono_50_cuentas` u otro template al cliente.

Domingo/festivo: no hace falta job a las 7; el **lunes 7:00** barre fin de semana.

### 3.5 Relación con “Presupuesto”

```
Interés claro → crm.lead (oportunidad)     [automático §3.3/3.4]
Lista + refs + HAZ PRESUPUESTO → sale.order draft + stage Presupuesto  [staff]
```

No saltar a SO desde el vendedor.

---

## 4. Odoo stage Presupuesto → Kapso → cliente

### 4.1 Trigger Odoo

Automatización Studio / `base.automation` en `crm.lead` (o en `sale.order` si “Presupuesto” vive en SO):

- **On:** `stage_id` → etapa **Presupuesto** (confirmar ID en prod).
- **Action:** server action → HTTP POST a Kapso webhook/function.

Payload sugerido:

```json
{
  "event": "crm.stage.presupuesto",
  "lead_id": 123,
  "partner_phone": "57320…",
  "partner_name": "…",
  "order_summary": "9 uniformes fútbol…",
  "so_name": "S0xxxx",
  "kapso_conversation_id": "uuid-opcional"
}
```

### 4.2 Kapso receptor

Function `on_odoo_presupuesto`:

1. Validar secret webhook.
2. Escribir `vars.quote.status=presupuesto` + `order_state` (lead/SO ids).
3. **No** enviar WhatsApp ni template al cliente.

### 4.3 Alternativa

Webhook Odoo → Kapso function directo (secret compartido). Sin n8n obligatorio.

---

## 5. Orden de implementación sugerido

1. Crear en WABA `retomar_pedido` + `abono_50_cuentas` (copy §2); esperar APPROVED.
2. Hot follow-ups: staff decide `retomar_pedido` / humano.
3. Seed CRM en `notificar_interes_ventas` (gate consultar/pensar).
4. Cron 7:00: solo CRM + flag candidato retoma; sin WA.
5. Tool staff `ENVIAR RETOMAR` → `retomar_pedido`.
6. Automation Odoo Presupuesto → webhook Kapso estado (sin reply cliente).

---

## 6. Preguntas abiertas

1. ¿Stage CRM exacto en prod “Presupuesto” (ID)? ¿O es etapa de `sale.order`?
2. ¿El barrido 7:00 es lun–sáb o solo lun–vie?
