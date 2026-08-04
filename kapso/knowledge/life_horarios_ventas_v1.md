# Horarios del agente vendedor — Life Deportes

Guía para el agente WhatsApp de ventas: **cuándo** prometer confirmación el mismo día, **cómo** hablar fuera de horario y **copy exacto** para el cliente.

Zona horaria: **America/Bogota** (Colombia).

---

## 1. Horario comercial (confirmación el mismo día)

| Día | Horario | Qué puede prometer el agente |
|-----|---------|------------------------------|
| **Lunes a viernes** | 8:00 a.m. – 5:00 p.m. | Cotizar, adelantar pedido, **handoff** → equipo comercial confirma **hoy mismo** |
| **Sábado** | 8:00 a.m. – 2:00 p.m. | Igual que entre semana |
| **Domingo y festivos** | Fuera de horario | Cotizar y adelantar pedido; revisión **siguiente día hábil en la mañana** |
| **Noches** (después del cierre del día) | Fuera de horario | Igual que domingo |

**Festivos:** tratar como domingo (fuera de horario comercial). Si el cliente pregunta por un festivo concreto, indicar que ese día no hay confirmación comercial y que el pedido queda para el **primer día hábil siguiente**.

---

## 2. Dos modos de operación

Consulta `vars.service.business_hours` si el grafo la inyecta. Si no existe, infiere por la hora actual (Bogotá) con esta KB.

| Modo | Cuándo | Agente puede | Handoff |
|------|--------|--------------|---------|
| **`in_hours`** | Lun–vie 8–17, sáb 8–14 | Venta completa + escalar a humano con respuesta rápida | Confirmación **mismo día** |
| **`off_hours`** | Noches, domingo, festivo, sáb después de 2 p.m. | Resolver dudas, cotizar, **adelantar pedido** (quote + handoff) | Procesado **mañana en la mañana** (primer día hábil) por **equipo de fabricación** |

**Siempre activo (24/7):** orientación, cotización gradual, recibir diseños/referencias, dejar pedido anotado.

**Nunca prometer fuera de horario:** “le confirmamos hoy”, “le llamamos en un rato”, “abono hoy mismo”.

---

## 3. Mensaje de bienvenida / horarios

**No** pegar el bloque de horarios en cada saludo de ventas. Saludo comercial = 1–2 frases (ver prompt vendedor).

Solo si preguntan “¿están abiertos?” / “¿me atienden ahora?”:

> Lun–vie 8 a.m.–5 p.m., sáb hasta 2 p.m. Fuera de eso cotizamos igual; confirmación comercial el siguiente día hábil en la mañana.

---

## 4. Frases de cierre según horario

**Solo** tras aceptación explícita del presupuesto (`sí` / `dale` / `listo` / `confirmo`) o interés claro de seguir (abono / “cómo pago” con intención de avanzar). Preguntar por el abono **sin** aceptar aún no obliga a notificar.

Orden obligatorio:

1. `save_variable` de `quote.*`
2. Tool **`notificar_interes_ventas`** (avisa a líneas comerciales; no es handoff)
3. Mensaje corto al cliente (abajo)
4. **`enter_waiting`** — **sin** `handoff_to_human`

### 4.1 En horario comercial (`in_hours`)

> Listo. El equipo lo revisa **hoy** y le indica el abono del 50%. ¿Alguna duda?

### 4.2 Fuera de horario comercial (`off_hours`)

> Listo. Lo revisan **mañana en la mañana** (primer día hábil) y le indican el abono del 50%. ¿Alguna duda?

---

## 5. Cliente pide hablar con un humano / por teléfono

Este es el **único caso de handoff programático** del vendedor. Incluye: “quiero hablar con alguien”, “asesor”, “humano”, “llamada”, “telefónicamente”, “no virtual”.

**No** uses handoff solo porque aceptó la cotización (eso es §4 + notify).

**Siempre** entrega primero los números comerciales (mismas líneas del mensaje de mantenimiento):

> 310 336 2484 · 321 398 8464

Copy base:

> Con gusto. Puede escribir o llamar a nuestros asesores: **310 336 2484** o **321 398 8464**. Ahí le atienden por teléfono o WhatsApp.

### En horario comercial

Añade: el equipo también puede retomar este chat lo antes posible.

→ `handoff_to_human` de inmediato.

### Fuera de horario

Añade: asesores atienden lun–vie 8:00 a.m.–5:00 p.m. y sábados hasta 2:00 p.m.; fuera de eso pueden escribir a esos números o dejar el pedido avanzado aquí para revisión el siguiente día hábil.

→ `handoff_to_human` (cola inbox); no prometer respuesta inmediata.

---

## 6. Preguntas frecuentes — respuestas cortas

| Pregunta | Respuesta orientativa |
|----------|----------------------|
| ¿Están abiertos ahora? | Indicar si estamos en horario comercial (según §1) y ofrecer cotizar igual. |
| ¿Me confirman hoy? | Solo **sí** en horario comercial. Fuera: “mañana en la mañana, primer día hábil”. |
| ¿Puedo pagar ahora? | En horario: “el equipo le indica la cuenta al confirmar”. Fuera: “mañana en la mañana le confirman abono”. |
| ¿Atienden domingo? | “El chat está activo; confirmación comercial el lunes en la mañana.” |

---

## 7. Reglas para el agente (checklist)

- [ ] ¿Consulté esta KB antes de prometer “hoy” o “mañana”?
- [ ] ¿Interés confirmado → `notificar_interes_ventas` + waiting (sin handoff)?
- [ ] ¿Handoff solo si pidió humano (§5)?
- [ ] ¿Mensaje de cierre acorde a `in_hours` vs `off_hours`?
- [ ] ¿Sin emojis, 1–3 frases, tono colombiano profesional?
- [ ] ¿No inventé horarios distintos a los de esta KB?

---

## 8. Integración técnica (fase siguiente — no desplegada aún)

Function sugerida: `resolve-business-hours` → escribe:

```json
{
  "service": {
    "business_hours": true,
    "business_mode": "in_hours",
    "business_hours_label": "horario comercial",
    "next_open_hint": null
  }
}
```

Fuera de horario: `business_hours: false`, `business_mode: "off_hours"`, `next_open_hint`: “lunes 8:00 a.m.” (calculado).

Código: `kapso/functions/lib/business_hours.js`
