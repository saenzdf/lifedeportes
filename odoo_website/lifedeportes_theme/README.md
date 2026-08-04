# Life Deportes — Tema y Home para Odoo Website

Replica la home de [`lifedeportes.com`](https://lifedeportes.com/) sobre el módulo
**Website** de Odoo, manteniendo el branding y dejando todo editable desde el
Website Editor.

## Stack

- **QWeb (XML)** para todo el contenido SSR de la home, header y footer.
- **SCSS** con la paleta de marca (namespace `.ld-*` para no chocar con Odoo).
- **Vanilla JS** (registrado como `publicWidget`) para hero carousel, flip cards
  y contadores animados.
- **OWL 2** sólo para la pieza interactiva más útil: el `ContactQuoteForm`
  (envío al CRM con fallback a WhatsApp). Es el ejemplo "este es OWL" para
  mostrarle al webmaster.

## Estructura

```
lifedeportes_theme/
├── __manifest__.py
├── views/
│   ├── header.xml          # Topbar con WhatsApp + clase .ld-header
│   ├── footer.xml          # Footer con logo + redes
│   └── homepage.xml        # Reemplaza website.homepage (#wrap)
└── static/src/
    ├── scss/lifedeportes.scss
    ├── js/homepage.js                # publicWidget: hero, flip, counters
    ├── js/contact_form_owl.js        # OWL ContactQuoteForm
    ├── xml/contact_form.xml          # Template OWL
    └── img/                          # Aquí van las imágenes (ver lista abajo)
```

## Instalación

### Opción A — Odoo.sh / on-prem (recomendada)

1. Copia la carpeta `lifedeportes_theme/` a tu repositorio de addons (en
   Odoo.sh, dentro del repo del proyecto).
2. Sube las imágenes a `lifedeportes_theme/static/src/img/` (ver lista abajo).
3. Push al branch del entorno → Odoo.sh reconstruye y actualiza módulos
   automáticamente.
4. En Odoo: *Apps → Update Apps List → buscar "Life Deportes"* → Instalar.

### Opción B — Odoo Online (`*.odoo.com`) sin acceso a addons

Odoo Online no permite subir módulos personalizados. Para tener algo similar
sin migrar:

1. Subir todas las imágenes a *Sitio web → Configuración → Editar HTML/CSS →
   Imágenes*, o como adjuntos vía *Ajustes → Técnico → Adjuntos*.
2. En *Sitio web → Personalizar → Editar HTML/CSS*: pegar el contenido de
   `views/homepage.xml` (sólo el bloque dentro de `#wrap`) en la página de
   inicio (botón "Editar HTML"). Reemplazar las rutas
   `/lifedeportes_theme/static/src/img/...` por las URLs de los adjuntos
   (`/web/image/<id>`).
3. En *Ajustes → Sitio web → Custom Code → Head*: pegar el SCSS compilado a
   CSS (puedes compilarlo localmente con `sass`) dentro de `<style>...</style>`.
4. En *Ajustes → Sitio web → Custom Code → Body*: pegar `homepage.js` y
   `contact_form_owl.js` dentro de `<script>...</script>`. Para OWL en SaaS,
   probablemente sea más simple sustituir el componente OWL por el formulario
   QWeb estándar de Odoo (`s_website_form` con `crm.lead` como modelo).

> Para acelerar la transición al webmaster: deja la opción A documentada como
> camino "definitivo" y entrega la opción B como puente para ir cargando
> contenido en paralelo.

## Imágenes a subir (`static/src/img/`)

Estos son los archivos que el módulo espera. Todos pueden tomarse del sitio
actual `lifedeportes.com` (la empresa es propietaria del contenido):

| Archivo | Origen |
|---|---|
| `logo-color.webp` | https://lifedeportes.com/img/logo-color.webp |
| `logo-white.webp` | https://lifedeportes.com/img/logo-white.webp |
| `hero-futbol.webp` | https://lifedeportes.com/img/hero-futbol.webp |
| `hero-baloncesto.webp` | https://lifedeportes.com/img/hero-baloncesto.webp |
| `hero-sudaderas.webp` | https://lifedeportes.com/img/hero-sudaderas.webp |
| `hero-voleibol.webp` | https://lifedeportes.com/img/hero-voleibol.webp |
| `cat-futbol.webp` | https://lifedeportes.com/img/cat-futbol.webp |
| `cat-baloncesto.webp` | https://lifedeportes.com/img/cat-baloncesto.webp |
| `cat-voleibol.webp` | https://lifedeportes.com/img/cat-voleibol.webp |
| `cat-sudaderas.webp` | https://lifedeportes.com/img/cat-sudaderas.webp |
| `futbol-front.webp`, `futbol-back.webp` | sección detalle Fútbol |
| `baloncesto-front.webp`, `baloncesto-back.webp` | sección detalle Baloncesto |
| `voleibol-front.webp`, `voleibol-back.webp` | sección detalle Voleibol |
| `sudaderas-single.webp` | sección detalle Sudaderas |
| `about-banner.webp` | sección Sobre Nosotros |
| `process-1.webp` … `process-4.webp` | sección Proceso |
| `banner-cta.webp` | banner CTA grande (background) |

Comando de descarga rápida (desde la raíz del módulo):

```bash
cd static/src/img
for f in logo-color logo-white \
         hero-futbol hero-baloncesto hero-sudaderas hero-voleibol \
         cat-futbol cat-baloncesto cat-voleibol cat-sudaderas \
         futbol-front futbol-back \
         baloncesto-front baloncesto-back \
         voleibol-front voleibol-back \
         sudaderas-single about-banner \
         process-1 process-2 process-3 process-4; do
    curl -sLO "https://lifedeportes.com/img/${f}.webp"
done
```

## Decisiones de diseño y notas para el webmaster

- **OWL vs QWeb**: la web pública en Odoo se sirve **server-side con QWeb**.
  OWL es el framework JS para componentes interactivos. El `ContactQuoteForm`
  está hecho en OWL como ejemplo concreto; el resto es QWeb.
- **Editable desde el Website Editor**: el `#wrap` mantiene la clase
  `oe_structure`, así que pueden seguirse arrastrando snippets entre/después
  de nuestras secciones sin tocar código.
- **WhatsApp como fallback** del formulario: si `website_crm` no está
  instalado o el endpoint falla, redirige a `wa.me/57…` con el mensaje
  pre-rellenado, así nunca se pierde un lead.
- **Migración a Odoo.sh**: si la cuenta sigue en `*.odoo.com`, este módulo es
  el motivo concreto para considerar mover el sitio a Odoo.sh — permite
  desplegar cambios versionados sin pegar HTML a mano.
