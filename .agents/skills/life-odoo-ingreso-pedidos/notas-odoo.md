# Notas HTML — presupuesto (`sale.order.note`) y tarea (`project.task.description`)

Mismo contenido en **ambos** campos cuando exista tarjeta de proyecto vinculada.

Odoo ya guarda el cliente en `partner_id` / CRM y los precios en las líneas del presupuesto. **No repetir** eso en la nota ni en la descripción de la tarea.

---

## Prohibido en la nota / tarea

| No incluir | Motivo |
|------------|--------|
| Nombre del contacto, teléfono, WA, línea `Cliente: …` | Ya está en el partner del SO |
| Montos: `$50.000`, `@ $50.000 COP`, `(+$3.000)`, totales, subtotales | Ya están en `sale.order.line` |
| IDs Odoo de variante solo para cotizar (ej. `11139 @ $50.000`) | Operación usa líneas del SO; en nota solo atributos legibles |
| Abonos / pagos del cliente en la lista de jugadores | Va en seguimiento comercial, no en lista de producción |

---

## Sí incluir

1. **Resumen de uniformes** — cantidades por **manga corta / larga** y género (sin precio):
   - Ej.: `Masculino — manga corta (15 u.): Uniforme fútbol dry-fit. Dorsal #99 arquero (colores invertidos, mismo precio camiseta/uniforme, sin cargo adicional).`
2. **Tablas agrupadas** — un bloque por combinación género + manga:
   - Masculino (manga corta) · Masculino (manga larga) · Femenino (manga corta)
   - Columnas: **N°** · **Nombre** · **Talla** · **Rol / variante** (sin repetir manga en rol)
3. **Bloqueadores** pendientes de confirmar con operaria (si aplican).
4. **Referencias de archivos** (Excel, JPEG de diseño) cuando existan en carpeta o adjuntos.
5. **Proyecto diseño** (solo id/nombre interno): `Proyecto Paola` o `Proyecto Javier` — no mezclar con datos del contacto.

Para volcar lista Excel/imagen en tarea existente → skill **`life-odoo-lista-tarea`** y script `kapso/scripts/sync_lista_pedido_to_odoo.js`.

Título opcional: nombre del **equipo o pedido** (`x_studio_nombre_de_pedido`), no el nombre personal del cliente.

---

## Plantilla mínima

```html
<h1>Pedido [equipo o referencia interna]</h1>

<h2>Resumen de uniformes</h2>
<ul>
  <li><strong>Masculino (N u.):</strong> [producto + variantes técnicas, sin precios]</li>
</ul>

<hr>

<h2>Lista de jugadores (Masculino)</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:left; padding: 8px;">Rol / variante</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="text-align:center; padding: 8px;">10</td><td style="padding: 8px;">Nombre</td><td style="text-align:center; padding: 8px;">M</td><td style="padding: 8px;">Campo · manga corta</td></tr>
  </tbody>
</table>

<p>Proyecto: Paola</p>
```

---

## Flujo (interpretación gradual)

```
1) Entrada Excel / lista / foto
       ↓
   ¿Formato reconocido (Life / familia / texto lista)?
       ├─ Sí → tablas HTML por género/manga/familia
       └─ No → espejo Excel (mirror_v1) en la nota
       ↓
2) order_draft.detail.rows + commercial.lines
       ↓
   buildOdooOrderNoteHtml → sale.order.note  (vendedora corrige aquí)
       ↓
3) odoo-create-lead-and-so → líneas SO + Calculadora
       ↓
   Fill Formulario C–F (+ H–M attrs) desde detalle
```

Kapso staff: el agente llena `order_draft.detail.rows` (o `mirror_grid`); el grafo genera el HTML sin precios ni datos del contacto.

Los precios y la **confirmación del presupuesto** los gestiona la operaria en Odoo; la lista es para **diseño y producción**.
