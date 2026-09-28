# Horarios del agente vendedor — Life Deportes

Guía para el agente WhatsApp de ventas: **cuándo** prometer confirmación el mismo día, **cómo** hablar fuera de horario y **copy exacto** para el cliente.

Zona horaria: **America/Bogota** (Colombia).

Hay **tres relojes**. No los mezcles.

| Reloj | Ventana | Para qué |
|-------|---------|----------|
| **Envío al cliente (vendedor)** | 6:00 a.m. – **10:00 p.m.** **todos los días** | Solo el agente vendedor. Fuera: **no** `send_notification_to_user`. Tools sí. A las 6:00 a.m. se responde lo que quedó. |
| **Aviso proactivo al staff** | 8:00 a.m. – 6:00 p.m. lun–sáb | Notify / wa.me / llegada / catch-up. **Desde 6:00 p.m. pausado** aunque el vendedor siga hasta 10:00 p.m. Si Paola o Javier **escriben**, sí se les contesta. Domingo: no proactivo. |
| **Confirmación comercial “hoy”** | Lun–vie 8:30 a.m.–5:00 p.m.; sáb 8:30 a.m.–2:00 p.m. | Copy §4.1 vs §4.2 (`service.business_mode`). |

`vars.service.customer_send_ok` / `staff_notify_ok` / `business_mode` los inyecta `resolve-business-hours`. Si dudas, `get_current_datetime`.

---

## 1. Horario comercial (confirmación el mismo día)

| Día | Horario | Qué puede prometer el agente |
|-----|---------|------------------------------|
| **Lunes a viernes** | 8:30 a.m. – 5:00 p.m. | Cotizar, adelantar pedido, **handoff** → equipo comercial confirma **hoy mismo** |
| **Sábado** | 8:30 a.m. – 2:00 p.m. | Igual que entre semana |
| **Domingo y festivos** | Fuera de horario | Cotizar y adelantar pedido; revisión **siguiente día hábil en la mañana** |
| **Noches** (después del cierre del día) | Fuera de horario | Igual que domingo |

**Festivos:** tratar como domingo (fuera de horario comercial). Si el cliente pregunta por un festivo concreto, indicar que ese día no hay confirmación comercial y que el pedido queda para el **primer día hábil siguiente**.

---

## 2. Dos modos de operación

Consulta `vars.service.business_hours` si el grafo la inyecta. Si no existe, infiere por la hora actual (Bogotá) con esta KB.

| Modo | Cuándo | Agente puede | Handoff |
|------|--------|--------------|---------|
| **`in_hours`** | Lun–vie 8:30–17, sáb 8:30–14 | Venta completa + escalar a humano con respuesta rápida | Confirmación **mismo día** |
| **`off_hours`** | Noches, domingo, festivo, sáb después de 2 p.m. | Resolver dudas, cotizar, **adelantar pedido** | **Noche:** un asesor lo contacta **al día siguiente**. **Fin de semana:** un asesor le escribe el **siguiente día hábil** (desde 8:30 a.m.) |

**Siempre activo (24/7) para recibir:** orientación, cotización gradual, diseños/referencias, dejar pedido anotado. **Enviar** al cliente (vendedor) **6:00 a.m.–10:00 p.m.** De **10:00 p.m.** a 6:00 a.m. callas; a las 6:00 a.m. contestas. **6:00 p.m.–10:00 p.m.:** solo vendedor al cliente; avisos staff y llegada **pausados**.

**Nunca prometer fuera de horario:** “le confirmamos hoy”, “le llamamos en un rato”, “abono hoy mismo”.

---

## 3. Mensaje de bienvenida / horarios

**No** pegar el bloque de horarios en cada saludo de ventas. Saludo comercial = 1–2 frases (ver prompt vendedor).

Solo si preguntan “¿están abiertos?” / “¿me atienden ahora?”:

> Lun–vie 8:30 a.m.–5 p.m., sáb desde 8:30 hasta 2 p.m. Fuera de eso cotizamos igual; confirmación comercial el siguiente día hábil en la mañana.

---

## 4. Frases de cierre según horario

**Solo** tras aceptación explícita (`sí` / `dale` / `listo` / `confirmo`) o interés claro (abono / “cómo pago” con intención de avanzar). Preguntar por el abono **sin** aceptar aún no crea presupuesto.

Orden obligatorio:

1. `save_variable` de `quote.*` con `status: esperando_contacto_asesor` (o `interes_confirmado`)
2. Tool **`notificar_interes_ventas`** (**obligatorio** antes de cualquier frase “asesor le escribe / contacta”). Siembra CRM + nota **⚠️ Esperando que un asesor se comunique** + aviso a **un** asesor.
3. (Opcional) `crear_presupuesto_odoo` si la tool responde OK — no bloquea el cierre si falla.
4. Mensaje corto al cliente (§4.1 o §4.2 — **no** busques horarios en KB)
5. **`enter_waiting`**. El bot sigue.

**Hard rule:** si vas a decir que un asesor lo contacta → **primero** `notificar_interes_ventas`. Sin tool = sin esa frase.

**Prohibido en el cierre:** *el equipo revisa diseño*, *diseñadores lo contactan*, *coordinación de diseño*, *pedido confirmado/registrado* (sin CRM). Diseño/arte solo **después** del abono 50% (KB reglas).

### 4.1 En horario comercial (`in_hours`)

> Listo. Un asesor le escribe en breve para el abono del 50%.

### 4.2 Fuera de horario comercial (`off_hours`)

**Noche** (tras cierre comercial, antes de las 6:00 a.m. o entre 5:00/2:00 p.m. y 10:00 p.m. entre semana/sábado):

> Listo. Un asesor lo contacta **al día siguiente** desde las 8:30 a.m. para el abono del 50%.

**Fin de semana / domingo / festivo** (o sábado después de las 2:00 p.m.):

> Listo. Un asesor le escribe el **siguiente día hábil** desde las 8:30 a.m. para el abono del 50%.

**Prohibido al cliente:** decir *8:00 a.m.* para revisión comercial. El aviso **staff** arranca 8:00; la **confirmación comercial** es desde **8:30** (§1). Si dudas, usa las frases de arriba tal cual.

**Sistema (Kapso):** `notificar_interes_ventas` asigna **un** asesor y deja la opp en CRM con nota de espera. WhatsApp staff proactivo solo **8:00 a.m.–6:00 p.m.** lun–sáb (fuera: encola). Al cliente: vendedor **hasta 10:00 p.m.**; de **10:00 p.m.** a 6:00 a.m. **no** se le escribe.

---

## 5. Cliente pide hablar con un humano / por teléfono

Este es el **único caso de handoff programático** del vendedor. Incluye: “quiero hablar con alguien”, “asesor”, “humano”, “llamada”, “telefónicamente”, “no virtual”.

**No** uses handoff solo porque aceptó la cotización (eso es §4 + presupuesto Kapso).

**Un número, no dos.** Llama `notificar_interes_ventas` primero. Usa **solo** `advisor_phone_display` / `customer_copy_advisor`. **Prohibido** pegar 310 y 321.

| Asignado | Número (solo lo que devuelve la tool) |
|----------|---------------------------|
| Javier   | **310 336 2484** |
| Paola    | **321 398 8464** |

### En horario comercial

Añade: el asesor también puede retomar este chat lo antes posible.

→ `handoff_to_human` de inmediato.

### Fuera de horario

Añade: el asesor atiende lun–vie 8:30 a.m.–5:00 p.m. y sábados hasta 2:00 p.m. **Noche:** le contactan **al día siguiente**. **Fin de semana / festivo:** le escribe un asesor el **siguiente día hábil**.

→ `handoff_to_human` (cola inbox); no prometer respuesta inmediata.

---

## 6. Preguntas frecuentes — respuestas cortas

| Pregunta | Respuesta orientativa |
|----------|----------------------|
| ¿Están abiertos ahora? | Indicar si estamos en horario comercial (según §1) y ofrecer cotizar igual. |
| ¿Me confirman hoy? | Solo **sí** en horario comercial. **Noche:** “al día siguiente”. **Fin de semana:** “siguiente día hábil en la mañana”. |
| ¿Puedo pagar ahora? | En horario: “el equipo le indica la cuenta al confirmar”. Fuera: “un asesor le escribe al día siguiente / siguiente día hábil para el abono”. |
| ¿Atienden domingo? | “El chat está activo; un asesor le escribe el lunes en la mañana.” |

---

## 7. Reglas para el agente (checklist)

- [ ] ¿Consulté esta KB antes de prometer “hoy” o “mañana”?
- [ ] ¿Interés confirmado → **`notificar_interes_ventas`** (CRM + espera asesor) **antes** del copy §4?
- [ ] ¿Handoff solo si pidió humano (§5) y un solo número (`advisor_phone_display`)?
- [ ] ¿Mensaje de cierre acorde a `in_hours` vs `off_hours`?
- [ ] ¿Sin prometer diseño/diseñadores antes del abono 50%?
- [ ] ¿Sin emojis, 1–3 frases, tono colombiano profesional?
- [ ] ¿22:00–06:00 → cero WhatsApp al cliente?
- [ ] ¿No inventé horarios distintos a los de esta KB?

---

## 8. Integración técnica

`resolve-business-hours` escribe:

```json
{
  "service": {
    "business_hours": true,
    "business_mode": "in_hours",
    "customer_send_ok": true,
    "staff_notify_ok": true,
    "timezone": "America/Bogota"
  }
}
```

Fuera de envío al cliente: `customer_send_ok: false`, `next_customer_send_hint`: “mañana 6:00 a.m.”.
Fuera de aviso staff: `staff_notify_ok: false` (encola `pending_staff_notify`; flush ~8:00 a.m.).

Código: `kapso/functions/lib/send_windows.js` + `lib/business_hours.js`.