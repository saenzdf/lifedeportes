# Reglas comerciales — extract staff

Versión corta para el Agent Staff. Detalle cliente/FAQ → KB vendedor `life_reglas_comerciales` (no hace falta repetir aquí).

## Hard rules Odoo / write

- Kapso crea `sale.order` **borrador** (`draft`). **Nunca** `action_confirm`.
- La operaria revisa, corrige y confirma en Odoo.
- Pedido: CRM primero (`opportunity_only`); SO solo con *HAZ PRESUPUESTO*.
- Opp creada a mano en **Canal Ventas** → `buscar_oportunidad_odoo` y retomar (no duplicar). KB: `life_retomar_oportunidad_crm`. Si ya hay opp con nombre → **no** repreguntar nombre ni pedir CONFIRMO por eso; completar lista/fotos/`opportunity_only`.
- **Nunca renombrar** oportunidad, `x_studio_nombre_del_pedido`, ni tarea sin **orden explícita** de staff («renombrar a…», «llamar el pedido…»). Prioridad: nombre que puso staff. Un archivo de diseño (ej. CHAMEZA) **no** es el nombre del pedido.
- **Nombre en confirmaciones WA:** usar el nombre del pedido que dio staff (suele ser el **equipo**; a veces el **cliente**, ej. FREDY BRAM). Si staff dijo cliente, **mantener cliente** — no sobrescribir con equipo ni con nombre de archivo PNG/PDF. En el ack: `Listo S0… {nombre}: …` nunca `Listo S0… CHAMEZA…` por el mockup.
- Nómina/compra: tools propias; **no** `complete_task` de pedido.
- Subir borrador aunque la organización de datos sea `partial` / `generic` (espejo + warnings en nota).
- **Nunca digas «parseo»** al staff: di **organización de los datos** / «organicé la lista».
- Teléfono del cliente → campo **phone** / partner. **Nunca** en description CRM ni nota visible del pedido.
- Línea Diseño a valor **0** cuando el grafo ingresa con 6+ unidades.
- **Exploración diseño:** *solo diseño* o *1 uniforme de muestra* permitido si staff lo marca (`design_exploration`). Producción final ≥ 6 + lista.

## Pedido mínimo

**6 unidades** del mismo producto/diseño (camiseta, uniforme, peto, rompevientos, etc.). No mezclar tipos para cumplir el mínimo.

### Excepción — exploración de diseño

Staff puede subir **solo diseño** o **1 uniforme de muestra** si el hilo/CRM dice explícitamente *solo diseño* / *exploración de diseño* / *muestra* (`quote.order_kind=design_exploration`).

- Línea Diseño $0 + (opcional) 1× uniforme/camiseta de muestra.
- Tras **aprobación del diseño**, el pedido de producción exige lista completa **≥ 6**.
- En WA: «solo diseño Emmanuelle» / «muestra diseño + 1 uniforme» → no bloquear por mín. 6.

## Productos / deportes (referencia rápida)

- **Sí:** fútbol, baloncesto, voleibol, atletismo.
- **No:** ciclismo, natación, béisbol, hockey, patinaje, porras, equitación, motociclismo, etc. → no cotizar ni forzar match.
- **Rompevientos** = Chaqueta Rompevientos Odoo **68** (~$60k). No confundir con Lotto.
- **Petos** = Peto sublimado **69** (~$28k).
- Fabricantes: precios de catálogo ya son mínimos; no hay descuento por volumen (si el staff pregunta).

## Formulario Excel → cliente

Comando: **ENVIAR EXCEL DETALLE** / «envíale el formato a {cliente}».

1. Teléfono: del hilo, `quote`, o `buscar_oportunidad_odoo`.
2. Tool **`enviar_formulario_excel`** (`customer_phone`).
3. No uses `send_media` genérico al lead; solo esta tool.

## Template retoma → cliente (fuera 24h)

Comando: **ENVIAR RETOMAR** / «manda retoma a {cliente}».

1. Teléfono igual que arriba.
2. Tool **`enviar_retomar_pedido`** → Meta `retomar_pedido_v2`.
3. Si el Excel falló por ventana 24h → primero retoma; cuando el cliente conteste, Excel.

## Lenguaje lista

- Uniforme de campo = camiseta + **pantaloneta** (no digas *pantalón* al staff/cliente en ese contexto).
- Match fino → `life_catalog_staff_match` + `buscar_producto_odoo`.

## Tono staff WA

- Corto, español colombiano, sin emojis.
- No imprimas `vars.*` ni JSON en WhatsApp.
- No narres tools; resumen + link CRM/SO.
