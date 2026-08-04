# Research: ¿WhatsApp Flows para lista de detalle Life?

Fecha: 2026-07-27  
Contexto: reemplazar/complementar Excel `Formulario-detalle-pedido` con Flow multi-fila (grupos de producto, tandas de 6).

---

## 1. Qué dice Kapso / Meta (hechos)

| Límite / hecho | Implicación Life |
|----------------|------------------|
| Máx. **10 pantallas** por Flow | Cabe un Flow estático; ver UX abajo. |
| Máx. **50 componentes** por pantalla | Una fila ≈ 6–8 campos → **1–2 filas por pantalla** (no 6 en la misma). |
| Best practice industria: **3–5 pantallas** (abandono sube fuerte >5) | 8× “1 fila = 1 pantalla” choca con la práctica. Mejor: **cabecera + 2–3 pantallas de filas (2 c/u) + resumen**. |
| Kapso casos: lead, citas, surveys, **order forms**, intake | Encaja intake; **no** hay caso público “roster de 30 jugadores en un Flow”. |
| Order forms COD/Shopify tipicos: catálogo + talla + dirección + resumen (**4–5 pantallas**, 1–pocos ítems) | Parecido a **1 grupo + pocas filas**, no a Excel de equipo completo. |
| Solo **móvil**; **sin upload** de archivos | Logos / Excel siguen por chat. |
| Publicado = inmutable; fuera 24h → template FLOW | Draft interno primero; staff en sesión abierta. |
| Dynamic: endpoint ≤10s + encryption | v1 **estático** basta (dropdowns fijos de producto/talla). |

Fuentes: [Kapso Flows](https://docs.kapso.ai/docs/whatsapp/flows/overview), [static vs dynamic](https://docs.kapso.ai/docs/whatsapp/flows/static-vs-dynamic), [8x8 best practices](https://developer.8x8.com/connect/docs/whatsapp/whatsapp-flows-best-practices/), Moveo/Exotel limits, COD order-form guides 2026.

---

## 2. Casos parecidos (referencia)

| Caso | Parecido a Life | Qué aprendemos |
|------|-----------------|----------------|
| **Lead / registro** (Meta) | Cabecera equipo + deporte | Flow brilla con **pocos campos fijos**. |
| **Appointment booking** | Elegir producto/grupo | Dropdowns + 2–4 pantallas = alta conversión. |
| **Product configurator** (D2C) | Elegir prenda + talla | Bueno para **1–3 ítems**, no 20 dorsales. |
| **Support intake** | Comentarios / faltantes | Texto + dropdown; no roster. |
| **Event registration** | Nombre + preferencia | 1 persona, no lista. |

**No encontré** un patrón maduro de “cargar 15–40 jugadores con talla y dorsal” en un solo Flow. Quien lo intenta usa: (a) tandas, (b) web form, o (c) Excel/CSV.

---

## 3. Vale la pena para Life?

### Sí, como **opción** (no reemplazo)

- Pedidos **chicos** (6–12) o **primera tanda** de un pedido grande.  
- Cliente sin Excel / desde el celular.  
- Datos más limpios que texto libre en chat.  
- Humano decide cuándo mandarlo (`ENVIAR FLOW DETALLE`).

### No como único canal

- Pedidos típicos Life **20–60** unidades → 4–10 tandas de Flow = abandono.  
- Excel nuevo ya tiene validaciones (listas) y el staff ya parsea.  
- Logos/diseño siguen fuera del Flow.

### Veredicto

| Pregunta | Respuesta |
|----------|-----------|
| ¿Se puede? | **Sí** (estático, grupo + 6 pantallas fila + cierre). |
| ¿Vale la pena? | **Sí como complemento** al Excel; **no** como reemplazo. |
| ¿Prioridad? | 1) Excel enviable + parser · 2) Flow piloto interno · 3) clientes. |

Arquitectura recomendada (sin cambiar el plan):

```
Humano → ENVIAR EXCEL DETALLE  (default nuevos / pedidos grandes)
       → ENVIAR FLOW DETALLE   (móvil / ≤12 filas o tandas)
Cliente → normalize → order_details (append)
```

---

## 4. Riesgos si implementamos Flow ya

1. **UX de 6+ pantallas** (1 fila c/u): más fricción que un Excel en tablet. Mitigar: preguntar “¿cuántas filas ahora? (1–6)” y solo mostrar esas.  
2. **Media ID del Excel expira ~30 días** en Meta → script de re-upload o URL estable.  
3. **Template FLOW** si se manda fuera de sesión.  
4. Complejidad Kapso (publish, nfm_reply, append) vs ganancia en % de clientes que no usan Excel.

---

## 5. Boceto de Flow propuesto (para diseñar juntos — sin implementar aún)

Objetivo: **≤5 pantallas**, máximo **6 filas** por tanda, append si hace falta más.

| # | Pantalla | Campos |
|---|----------|--------|
| 1 | **GRUPO** | Producto (dropdown), equipo, deporte, color medias (opc.) |
| 2 | **FILAS 1–2** | Por fila: No., Nombre, Talla, Cant., Manga, Género, Arquero, Comentario |
| 3 | **FILAS 3–4** | Igual (opcionales / “dejar vacío si no aplica”) |
| 4 | **FILAS 5–6** | Igual |
| 5 | **RESUMEN** | Texto fijo “Revisa y envía” + submit |

Alternativa más corta (piloto A/B): solo pantallas 1 + 2 + 5 → **máx. 2 filas** por tanda; “¿Agregar más?” reenvía el Flow.

Si en prueba interna el Excel gana siempre → **pausar Flow** y dejar solo Excel + texto.

## 6. Decisión pedida

| Opción | Qué implica |
|--------|-------------|
| **A — Excel first** | Implementar `ENVIAR EXCEL DETALLE` + parser; Flow solo si duele. |
| **B — Dual piloto** | Excel + draft Flow 5 pantallas (preview Meta); staff prueba 1 semana. |
| **C — No Flow** | Solo Excel/chat; evita complejidad Kapso/Meta. |

Recomendación Cursor: **B** si hay tiempo de diseño; **A** si priorizan ship esta semana.
