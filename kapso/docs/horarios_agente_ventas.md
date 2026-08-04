# Horarios agente vendedor — diseño (pre-deploy)

**Estado:** copy y KB listos; **grafo v10 sin cambios** hasta activar function de horario.

---

## Regla de negocio

| Ventana | Días | Comportamiento agente |
|---------|------|------------------------|
| **Horario comercial** | Lun–vie 8:00–17:00, sáb 8:00–14:00 | Venta + handoff → confirmación **mismo día**; humano **lo antes posible** si lo piden |
| **Fuera de horario** | Noches, dom, festivo, sáb tarde | Cotizar + adelantar pedido; fabricación revisa **siguiente día hábil en la mañana** |

El chat **nunca se apaga**: el asistente siempre puede orientar y dejar el pedido avanzado.

---

## Copy aprobado (cliente)

### Bienvenida / horarios

> Le saluda el asistente de Life Deportes. Puede escribirnos a cualquier hora: le ayudo con dudas, cotización y a **dejar avanzado su pedido**.
>
> **Horario comercial:** lunes a viernes de 8:00 a.m. a 5:00 p.m. y sábados hasta las 2:00 p.m. En ese horario, si cierra su pedido o prefiere hablar con una persona, **un asesor le responde lo antes posible** y el equipo confirma el pedido **el mismo día**.
>
> **Fuera de ese horario**, domingos y festivos: igual puede cotizar y dejar listo su pedido conmigo; la revisión final, abono y diseño los atiende el **equipo de fabricación a primera hora del siguiente día hábil**.

### Cierre en horario

> Perfecto, ya tengo anotado su pedido. Nuestro equipo comercial lo revisa **hoy mismo** para confirmar diseño y abono del 50%. Si prefiere hablar con un asesor, en horario laboral le respondemos lo antes posible. ¿Le queda alguna duda mientras tanto?

### Cierre fuera de horario

> Perfecto, ya tengo anotado su pedido. Como escribió fuera del horario comercial, el equipo de fabricación lo revisará **mañana en la mañana** (primer día hábil) y le indica cómo hacer el abono del 50%. ¿Le queda alguna duda mientras tanto?

### Pide humano (en horario)

> Con gusto. Ya dejé su conversación con un asesor; en horario laboral le respondemos lo antes posible. Mientras tanto, si le sirve, puedo ayudarle con la cotización o los detalles del pedido.

### Pide humano (fuera de horario)

> Entiendo que prefiera hablar con alguien del equipo. Nuestros asesores atienden de lunes a viernes de 8:00 a.m. a 5:00 p.m. y sábados hasta las 2:00 p.m. Mientras tanto, con gusto le ayudo a dejar avanzado su pedido y lo revisan a primera hora del siguiente día hábil.

---

## Archivos repo

| Archivo | Rol |
|---------|-----|
| `knowledge/life_horarios_ventas_v1.md` | KB agente (copy + reglas) |
| `prompts/agent_vendedor_v5_slim.md` | Prompt v5 |
| `functions/lib/business_hours.js` | Cálculo `in_hours` / `off_hours` (Bogotá) |
| `knowledge/life_reglas_comerciales_v1.md` | Horarios públicos alineados |

---

## Activación (cuando decidan)

1. Registrar KB en `embed_agent_knowledge.js` → `life_horarios_ventas`
2. Cambiar vendedor a `agent_vendedor_v5_slim.md` + añadir KB a `knowledgeKeys`
3. (Opcional) Function `resolve-business-hours` al inicio del grafo cliente → `vars.service.business_mode`
4. `node kapso/scripts/embed_agent_knowledge.js --agent vendedor` + deploy grafo

Sin la function, el agente infiere horario leyendo la KB (menos preciso en festivos).

---

## Cambio vs horarios anteriores

| Antes (web/KB) | Ahora (agente ventas) |
|----------------|------------------------|
| Lun–vie 8–**6** p.m. | Lun–vie 8–**5** p.m. |
| Sáb 8–**1** p.m. | Sáb 8–**2** p.m. |

Actualizar web/tienda si deben coincidir con el agente.
