---
name: plastinorte-editorial-layout
description: >-
  Reglas de layout para páginas editoriales Plastinorte (#wrap.pn-ed) en Odoo 16.
  Usar al crear secciones nuevas, splits de dos columnas, formularios o grids en
  setup_plastinorte_editorial.py, setup_plastinorte_line_pages.py o SCSS editorial.
---

# Plastinorte — Layout editorial

## Causa raíz de diagramación rota

En Odoo 16, **Bootstrap pisa `display: grid`** cuando se combina `.container` con clases de layout en el **mismo nodo**. El grid no aplica y los hijos quedan en flujo normal con espacios diagonales o apilados mal.

## Reglas obligatorias

### 1. Container y grid en nodos separados

```html
<!-- MAL -->
<div class="container pn-ed-split">...</div>

<!-- BIEN -->
<div class="container">
  <div class="pn-ed-split">...</div>
</div>
```

Para grids con nombre de área, usar patrón de `pn-ed-pay-intro` (título + copy).

### 2. Grid con `!important` y `minmax(0, 1fr)`

En `plastinorte_editorial.scss`, todo layout de columnas dentro de `.container` debe usar:

```scss
#wrap.pn-ed .pn-ed-split {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: clamp(1.5rem, 3vw, 2.5rem);
  align-items: start;
}
#wrap.pn-ed .pn-ed-split > * { min-width: 0; }
```

Referencia: `.container.pn-ed-pay-intro` ya usa `display: grid !important`.

### 3. No anidar `<section>` dentro de splits

`#wrap.pn-ed section { padding: var(--pn-ed-section) 0; }` aplica padding vertical grande a **cada** section anidada.

- Formularios: `<div class="pn-ed-contact-form s_website_form">` (no `<section>`)
- Wrapper de panel: `<div class="pn-ed-panel">` para fondo blanco sobre `.pn-ed-bg-soft`

### 4. Bootstrap `.row` dentro de grid

Resetear márgenes negativos:

```scss
#wrap.pn-ed .pn-ed-split .row,
#wrap.pn-ed .pn-ed-contact-form .row {
  margin-left: 0;
  margin-right: 0;
  --bs-gutter-x: 1rem;
}
```

### 5. Clases de sección

| Clase | Uso |
|-------|-----|
| `pn-ed-tight` | Menos padding vertical |
| `pn-ed-flush-top` | Sin padding-top (continúa sección anterior) |
| `pn-ed-bg-soft` | Fondo azul claro |
| `pn-ed-bg-ink` | Hero oscuro |
| `pn-ed-panel` | Card blanca con borde |

### 6. Helper Python reutilizable

En `setup_plastinorte_editorial.py`:

- `contact_split_html()` — copy izquierda + formulario derecha
- `contact_form()` — solo el form en panel (sin section)

Usar estos helpers en puntos de venta y contacto; no duplicar markup.

## Checklist antes de deploy

- [ ] ¿Grid en hijo de `.container`, no en el mismo nodo?
- [ ] ¿Sin `<section>` anidados en splits?
- [ ] ¿Formulario en `.pn-ed-panel` si el fondo es `.pn-ed-bg-soft`?
- [ ] ¿SCSS con `!important` en display grid si compite con Bootstrap?
- [ ] Revisar en desktop **y** móvil (media query apila `.pn-ed-split` a 1 col)

## Archivos

- SCSS: `plastinorte/odoo_website/plastinorte_theme/static/src/scss/plastinorte_editorial.scss`
- Scripts: `plastinorte/scripts/setup_plastinorte_editorial.py`, `setup_plastinorte_line_pages.py`
- CSS se inyecta vía `css_block()` en cada vista `.pn-ed` — **editar SCSS + re-ejecutar script** para ver cambios.
