# Prompt vendedor — propuesta v11 y mejora continua

**Estado:** v11 **sistémico publicado** (lock **1863**, 2026-08-28). Fuente: `prompts/agent_vendedor_v11_deepseek.md`.  
v10 queda en repo como archivo, no como `promptFile` del embed.

El v10 se alargó a parches (Helena, Jordani, Clau, Sandra, Anthony…). Cada parche era correcto; juntos diluyen el **trato** y la **venta progresiva**. v11 no tira esas lecciones: las deja en Mal→bien y en el router, y deja al **código** lo que ya hace el código.

---

## 1. Qué cambió de estrategia (no solo recorte)

| Eje | v10 | v11 |
|-----|-----|-----|
| Centro | Manual de excepciones | Trato + un avance de venta por turno |
| Prioridad | §0 después de una FAQ enorme | Router de 8 ramas al inicio |
| Asesor | Round-robin / “el sistema” narrado | Tú no eliges asesor; `claimAssignee` pega el mismo |
| Celular | Ausente, luego 2 viñetas al final de Humano | Rama 2 del router; distinto de “pide asesor” |
| Notify | 8 repeticiones | Ramas 3, 6 y 7 |
| Incidentes | Párrafos | 7 pares Mal→bien |
| `quote.history` | En el prompt | Fuera: no es conversación |

KBs (catálogo, reglas, horarios, fotos) **siguen** siendo la fuente de detalle. El prompt es plano de control.

---

## 2. Coordinación con functions (no duplicar en prosa)

| Function | Prompt le dice al modelo | No le dice |
|----------|--------------------------|------------|
| `notificar_interes_ventas` | Cuándo llamarla | Cómo clasifica (`sales` / `needs_human` / `hot_lead_doubt`) ni a quién avisa |
| `claimAssignee` (dentro de notify) | Nada (invisible) | Paola vs Javier |
| `on-contact-shared` | Copy si el cliente **ya** dio el número | Extraer dígitos, wa.me, webhook |
| `request-contact-info` | “No es tu tool” | Template Meta, BSUID |
| `ensure-crm-from-quote` | Que el grafo también siembra | IDs de lead |
| `enviar_ubicacion` | `notify_staff` solo llegada/puerta | Coordenadas |
| `staff-sales-notify-reply` | Nada (carril staff) | — |

Si un bug se arregla en function, **no** añadas un párrafo al prompt. Añade como mucho un Mal→bien si el modelo **habló** mal (Sandra).

---

## 3. Cuándo parchar vs cuándo refactorizar

**Parcho (1 línea o 1 fila Mal→bien)** si anoche el bot dijo algo raro **una vez** y la regla ya existe pero no la ganó. Ejemplo: otro “no me permite escribirle” → no hace falta un ensayo; el par ya está.

**Refactor (esta perspectiva)** cuando:

- el `.md` vivo pasa de ~12–14k caracteres, o
- el mismo tema se parcheó 3 veces en una semana, o
- hay dos reglas que se pisan (“teléfono” = celular vs asesor).

Ciclo de refactor (cada tanto, no cada incidente):

1. `get-graph` → diff prompt vivo vs `.md` (no pisar ediciones UI).
2. Preguntar: ¿esto es **trato/venta**, **FAQ**, o **código**? Solo lo primero vive en el prompt.
3. Incidentes del periodo → pares Mal→bien (máx. ~8; el más viejo que ya no falla, sale).
4. Publicar **solo** `system_prompt` del vendedor (como el lock 1752), no re-embeber staff.

Cutover v11 (cuando Diego diga sí):

1. Diff `v11` contra el prompt **vivo** (por si hubo ediciones UI después del 22/08).
2. En `embed_agent_knowledge.js`, `promptFile` → `prompts/agent_vendedor_v11_deepseek.md`.
3. Pull grafo → reemplazar solo el `system_prompt` del nodo vendedor → validate → `update-graph`.
4. Dejar v10 en el repo como archivo (no borrar).

---

## 4. Seguimiento estas noches (sin perder mejora continua)

Mirar hilos reales, no el prompt. Preguntas:

1. **Trato:** ¿1–2 frases? ¿empujó “¿avanzamos?”? ¿se puso nombre?
2. **Venta:** ¿precio sin que lo pidieran? ¿mín. 6 mezclando modelos? ¿polo a precio base?
3. **Asesor:** ¿pidió humano y llamó notify? ¿solo soltó 310/321?
4. **Número / asesor:** si pegó celular, ¿confirmó que el asesor escribe? ¿llegó wa.me **solo** al asignado? Catch-up y llegada a fábrica: **nunca** el mismo lote a Paola y Javier (cualquier tarea de atención).
5. **Código:** lead con Kapso + wa.me si hay E.164; `Asignado a` estable entre conversaciones Kapso nuevas.

Anotar el fallo en una línea (quién, qué dijo el bot, qué debió decir). Al día siguiente: parche mínimo **o** espera al refactor si ya hay par.

No medir “el prompt está largo”. Medir si el cliente sintió prisa o si Paola/Javier recibieron el lead correcto.

---

## 5. Publicar el v11 (cuando se apruebe)

No usar `deploy_graph_kb_progressive.sh` a ciegas: embebe también staff. Camino seguro = el del lock 1752: pull → parchear solo el prompt del vendedor → validate → push.
