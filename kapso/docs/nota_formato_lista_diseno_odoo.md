# Nota de diseño — formato lista en `sale.order.note` / tarea de proyecto

**Fecha:** jul 2026  
**Referencia en Odoo prod:** **S02524** (GUAINIA / Studiant FC) y **S02526** (Hub Ball / voleibol)  
**Audiencia de la nota:** diseñadores y producción (leen la tarjeta de proyecto y el presupuesto en Odoo).  
**No es audiencia comercial:** no deben ver datos del contacto ni precios.

---

## 1. Qué hizo bien el agente / ingreso manual (patrón a conservar)

En ambos pedidos la descripción sigue la **misma estructura en HTML**, que es la que queremos automatizar desde Kapso:

| Bloque | S02524 GUAINIA | S02526 Hub Ball |
|--------|----------------|-----------------|
| **Título** | `Pedido Studiant FC - GUAINIA` | `Pedido Hub Ball — VALENTINA SILVA (voleibol)` |
| **Resumen de uniformes** | Bullets por género + variantes técnicas (cuello, arquero) | Bullets hombre/mujer + deporte + notas de diseño |
| **Separador** | `<hr>` | `<hr>` |
| **Tabla(s) de detalle** | Masculino (16 filas) + Femenino (9 filas) | Hombre (7) + Mujer (6) |
| **Columnas tabla** | N° · Nombre · Talla · Rol/Tipo o Manga | Igual |
| **Referencias** | Lista de JPEG/PDF en carpeta | (en versión ideal: archivos adjuntos) |
| **Sync** | Mismo HTML en `sale.order.note`, CRM lead y `project.task.description` | Igual (tareas 2325 y 2326) |

**Fortalezas del formato:**

- Tablas legibles en Odoo (filas alternas `#f9f9f9`, bordes, sans-serif).
- **Separación por género** (masculino / femenino) cuando la lista lo trae.
- **Rol / variante** explícito: Campo, Arquero (colores invertidos), manga sisa, manga corta, licra.
- **Resumen arriba** para que diseño entienda el pedido sin abrir todas las filas.
- Una fila = un jugador con dorsal, nombre en lista, talla y variante de prenda.

Eso es lo que debe salir de `order_draft.detail.rows` → `build_odoo_order_note.js` → `order_note_html`.

---

## 2. Qué NO debe ir en la nota (cruce de información)

Hoy **S02524 y S02526 todavía tienen** contenido que no debería ver diseño. Hay que **filtrarlo** al implementar el flujo Kapso.

### Prohibido

| Tipo | Ejemplo real en Odoo hoy | Por qué no |
|------|--------------------------|------------|
| **Precios** | `@ $50.000 COP c/u`, `(+$3.000)`, `11139 @ $50.000` | Ya están en líneas del SO; diseño no cotiza |
| **Datos del cliente** | `Cliente: VALENTINA SILVA · 321 3799926` | Ya está en `partner_id`; es dato de tercero |
| **Nombre del cliente en título** | `VALENTINA SILVA` en `<h1>` | Usar **equipo / pedido** (`Hub Ball`, `Studiant FC — GUAINIA`) |
| **Abonos / pagos** | `Abono del 50% recibido por el cliente` | Seguimiento comercial, no producción |
| **IDs Odoo + precio** | `variante 12202 … @ $50.000` | En nota solo texto legible: *licra · manga corta · cuello V* |
| **Totales del presupuesto** | `$1.487.500`, `$710.000` | Campo `amount_total` del SO |

### Permitido en tablas de detalle

- **Nombres en la lista de uniformes** (JIM D., Estiben, Val…) — son datos de **producción**, no del contacto comercial.
- **Dorsales, tallas, rol arquero, manga, cuello, licra**, etc.

---

## 3. Formato objetivo (versión diseño)

Implementación ya esbozada en `kapso/functions/lib/build_odoo_order_note.js`.  
Reglas completas en `.agents/skills/life-odoo-ingreso-pedidos/notas-odoo.md`.

### S02524 — cómo debería quedar (sin precios ni cliente)

**Título:** `Studiant FC — GUAINIA` (equipo, no partner GUAINIA como dato comercial repetido)

**Resumen (ejemplo):**

- Masculino (16 u.): Uniforme fútbol dry-fit, **cuello redondo**, manga corta. Dorsales #1 y #12 arquero (colores invertidos, sin cargo adicional).
- Femenino (9 u.): Uniforme fútbol dry-fit, **cuello V**, manga corta. Dorsal #12 arquera (colores invertidos, sin cargo adicional).

**Tablas:** 16 + 9 filas como hoy, columnas **N° · Nombre · Talla · Rol / variante**.

**Referencias:** solo nombres de archivo (JPEG/PDF), sin montos.

**Pie:** `Proyecto: Paola` (proyecto diseño interno, no teléfono).

### S02526 — cómo debería quedar

**Título:** `Hub Ball (voleibol)` — sin “VALENTINA SILVA”.

**Resumen (ejemplo):**

- Hombre (7 u.): Pantaloneta, cuello V; 6 manga sisa + Estiben manga larga.
- Mujer (6 u.): Licra, **manga corta** (no china), cuello V.
- Diseño: referencia Wildcats → texto **Hub Ball**; nombre y número en dorsal.

**Tablas:** columna **Rol / variante** unificada (ej. `Manga larga`, `Sisa`, `Manga corta`) — **sin** `(+$3.000)`.

**Referencias:** `referencia_diseno.jpeg`, `lista.jpeg`.

**Sin** párrafo final con teléfono ni nombre del contacto.

---

## 4. Flujo Kapso a implementar / reforzar

```
Staff sube lista (Excel / foto / texto)
        ↓
order_draft.detail.rows[]   ← una fila por jugador
order_draft.commercial.lines[] ← resumen por línea de producto (sin precio en texto)
order_draft.title           ← equipo / nombre pedido (x_studio), NO partner.name
order_draft.reference_files[]
        ↓
build-quote-payload → resolveOrderNoteHtml() → order_note_html
        ↓
odoo-create-lead-and-so
        ↓
sale.order.note  +  project.task.description (mismo HTML)
```

### Shape de `order_draft.detail.rows` (por fila)

| Campo | Ejemplo |
|-------|---------|
| `numero` | `"12"` |
| `nombre` | `"GENILSON E."` |
| `talla` | `"M"` |
| `grupo` | `"masculino"` / `"femenino"` |
| `rol` o `manga` | `"Arquero (colores invertidos)"` / `"Manga corta"` |

El agente staff **no** debe pegar HTML a mano: llena el borrador; el grafo genera la nota.

---

## 5. Checklist antes de escribir en Odoo

- [ ] ¿Título = equipo/pedido, no nombre del contacto?
- [ ] ¿Resumen sin `$`, `COP`, `@`, IDs de variante?
- [ ] ¿Tablas completas desde la lista (conteo ≈ qty por línea comercial)?
- [ ] ¿Arqueros marcados en resumen **y** en fila?
- [ ] ¿Sin teléfono, WA, abonos, totales?
- [ ] ¿Mismo HTML en nota SO y descripción de tarea?

---

## 6. Gap actual (jul 2026)

| Qué | Estado |
|-----|--------|
| Formato HTML tabular en S02524 / S02526 | ✅ Referencia visual correcta |
| Notas en prod sin precios/cliente | ❌ Scripts manuales aún metieron precios y contacto |
| `build_odoo_order_note.js` | ✅ Genera HTML sin precios (tests en `run_build_odoo_order_note_tests.js`) |
| Kapso escribe nota al crear SO | ⚠️ Verificar deploy `build-quote-payload` + `odoo-create-lead-and-so` |
| Agente staff: llenar `detail.rows` desde lista | ⚠️ Reforzar en prompt/KB (`notas-odoo.md`, staff upload) |

**Próximo paso sugerido:** al confirmar un pedido como GUAINIA/Hub Ball, regenerar nota con `resolveOrderNoteHtml` y **reemplazar** la nota en SO + tarea (sin tocar líneas de precio del SO).

---

## 7. Enlaces en repo

- Generador: `kapso/functions/lib/build_odoo_order_note.js`
- Tests: `kapso/tests/run_build_odoo_order_note_tests.js`
- Skill operativo: `.agents/skills/life-odoo-ingreso-pedidos/notas-odoo.md`
- Casos reales corregidos (variantes): `scratch/fix_guainia_valentina_cuello_manga.py`
