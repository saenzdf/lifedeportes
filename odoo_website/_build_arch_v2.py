"""
Build iter 2: copia fiel de lifedeportes.com sobre la home de Odoo Website.

Estrategia
- CSS original literal (de https://lifedeportes.com/style.css) limpiado de las
  secciones que no queremos (nav del header, footer, optimizaciones específicas)
  y scoped bajo `.ld-home` para no chocar con Odoo / Bootstrap.
- HTML por secciones, copiando textos, estructura y atributos del sitio actual.
- Imágenes referenciadas a `https://lifedeportes.com/img/...` (CDN del cliente).
- JS: hero carousel rotacional (texto+imagen sincronizados), counter, flip-cards
  en mobile, testimonios paginados, smooth-scroll, fetch del form a CRM
  con fallback a WhatsApp si falla.
"""
import re
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

# --------------------------------------------------------------------------
# 1) CSS — original, scope bajo .ld-home, eliminar reglas de header/nav/footer
# --------------------------------------------------------------------------

with open("/tmp/ld_orig.css", "r", encoding="utf-8") as f:
    css_raw = f.read()

# Eliminar bloques que no queremos copiar (mantener Odoo header/footer)
blocks_to_remove_starts = [
    "/* ---------- HEADER ----------",
    "/* ---------- FOOTER ----------",
    "/* ---------- WHATSAPP FLOAT ----------",
    "/* ============================================\n   PERFORMANCE",
]
for marker in blocks_to_remove_starts:
    idx = css_raw.find(marker)
    if idx == -1:
        continue
    # Avanzar hasta el siguiente bloque /* ----------
    next_idx = css_raw.find("/* ----------", idx + len(marker))
    if next_idx == -1:
        next_idx = css_raw.find("/* ===========", idx + len(marker))
    if next_idx == -1:
        next_idx = len(css_raw)
    css_raw = css_raw[:idx] + css_raw[next_idx:]

# Tampoco queremos las reglas .header / .nav-* / .footer / .menu-toggle / .whatsapp-float
# que puedan haber quedado en responsive @media. Las quito a regex de selectores.
def strip_selector_rules(css, prefixes):
    """Elimina cualquier regla cuyo primer selector empiece con uno de los prefixes."""
    out = []
    i = 0
    n = len(css)
    while i < n:
        # Encontrar el siguiente { de regla
        brace = css.find("{", i)
        if brace == -1:
            out.append(css[i:])
            break
        selector = css[i:brace]
        # Buscar el cierre (cuenta llaves para anidados de @media)
        depth = 1
        j = brace + 1
        while j < n and depth > 0:
            if css[j] == "{":
                depth += 1
            elif css[j] == "}":
                depth -= 1
            j += 1
        rule = css[i:j]
        sel_clean = selector.strip().lstrip("}")
        # Si es @media, recursar dentro
        if sel_clean.startswith("@media"):
            inner_open = rule.find("{") + 1
            inner_close = rule.rfind("}")
            inner = rule[inner_open:inner_close]
            new_inner = strip_selector_rules(inner, prefixes)
            rule = rule[:inner_open] + new_inner + rule[inner_close:]
            out.append(rule)
        else:
            # Comprobar primer selector (split por coma)
            first = sel_clean.split(",")[0].strip()
            if any(first.startswith(p) for p in prefixes):
                pass  # drop
            else:
                out.append(rule)
        i = j
    return "".join(out)

UNWANTED_PREFIXES = [
    ".header", ".nav", ".menu-toggle", ".footer", ".whatsapp-float",
    ".btn-wa-hero", ".scroll-progress", ".back-to-top",
    ".categories,", ".about,", ".process,", ".testimonials,",
    ".why-us,", ".videos,", ".contact,",  # content-visibility multi-selector
    ".hp-field",
]
# Note: .footer-* hits .footer class too via startswith — fine
css_clean = strip_selector_rules(css_raw, UNWANTED_PREFIXES)

# Ahora: prefijar todos los selectores con `.ld-home `, dejando @media, @keyframes,
# y los de @keyframes intactos.

KEYFRAME_NAMES = re.findall(r"@keyframes\s+([\w-]+)", css_clean)

def prefix_selectors(css, scope=".ld-home"):
    out = []
    i = 0
    n = len(css)
    in_keyframes = False
    while i < n:
        # Saltar comentarios
        if css.startswith("/*", i):
            end = css.find("*/", i + 2)
            if end == -1:
                out.append(css[i:])
                break
            out.append(css[i:end+2])
            i = end + 2
            continue
        brace = css.find("{", i)
        if brace == -1:
            out.append(css[i:])
            break
        selector = css[i:brace]
        sel_clean = selector.strip()
        # Buscar el cierre
        depth = 1
        j = brace + 1
        while j < n and depth > 0:
            if css[j] == "{": depth += 1
            elif css[j] == "}": depth -= 1
            j += 1
        body_or_block = css[brace:j]
        if sel_clean.startswith("@keyframes") or sel_clean.startswith("@-webkit-keyframes"):
            # Dejar tal cual — los % dentro no se prefijan
            out.append(selector + body_or_block)
        elif sel_clean.startswith("@media"):
            inner_open = body_or_block.find("{") + 1
            inner_close = body_or_block.rfind("}")
            inner = body_or_block[inner_open:inner_close]
            new_inner = prefix_selectors(inner, scope)
            out.append(selector + body_or_block[:inner_open] + new_inner + body_or_block[inner_close:])
        elif sel_clean.startswith("@"):
            out.append(selector + body_or_block)
        else:
            # Prefijar cada selector (split por ,)
            parts = [s.strip() for s in selector.split(",")]
            new_parts = []
            for p in parts:
                if not p:
                    continue
                # No prefijar si ya empieza con .ld-home
                if p.startswith(scope):
                    new_parts.append(p)
                # html, body — aplicar al scope
                elif p in ("html", "body", "*", "*::before", "*::after"):
                    new_parts.append(p)  # mantener globales (las quitaremos abajo)
                else:
                    new_parts.append(f"{scope} {p}")
            new_selector = ", ".join(new_parts)
            out.append(new_selector + " " + body_or_block)
        i = j
    return "".join(out)

# Eliminar el reset global al inicio (* y html/body) para no afectar a Odoo
css_clean = re.sub(r"\*\s*,\s*\*::before\s*,\s*\*::after\s*\{[^}]*\}", "", css_clean)
css_clean = re.sub(r"^\s*html\s*\{[^}]*\}", "", css_clean, count=1, flags=re.MULTILINE)
css_clean = re.sub(r"^\s*body\s*\{[^}]*\}", "", css_clean, count=1, flags=re.MULTILINE)
css_clean = re.sub(r"^\s*img\s*\{[^}]*\}", "", css_clean, count=1, flags=re.MULTILINE)
css_clean = re.sub(r"^\s*a\s*\{[^}]*\}", "", css_clean, count=1, flags=re.MULTILINE)
css_clean = re.sub(r"^\s*ul\s*\{[^}]*\}", "", css_clean, count=1, flags=re.MULTILINE)
css_clean = re.sub(r"^\s*input\s*,[^{]*\{[^}]*\}", "", css_clean, count=2, flags=re.MULTILINE)

# Importar fuentes Google
fonts_import = (
    "@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:"
    "wght@500;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');"
)

css_scoped = prefix_selectors(css_clean)

# Forzar las fuentes en el scope (body original las define)
css_extra = """
.ld-home { font-family: 'DM Sans', sans-serif; color: #1a1a2e; line-height: 1.6; }
.ld-home img { max-width: 100%; height: auto; display: block; }
.ld-home a { color: inherit; text-decoration: none; transition: color .2s; }
.ld-home ul { list-style: none; padding: 0; }
.ld-home .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
/* Ocultar el menú de odoo NO — lo dejamos para que el cliente edite */
"""

css_final = fonts_import + "\n" + css_extra + css_scoped

print("CSS scoped length:", len(css_final))

# --------------------------------------------------------------------------
# 2) HTML — secciones del sitio, con paths absolutos y textos literales
# --------------------------------------------------------------------------

IMG = "https://lifedeportes.com/img"

HTML = f"""
<!-- TOPBAR (encima del header de Odoo, queda flotante) -->
<div class="topbar">
    <div class="container topbar-inner">
        <span class="topbar-text">Uniformes Personalizados · Envíos a toda Colombia, USA y Puerto Rico</span>
        <div class="topbar-phones">
            <a href="https://wa.me/573103362484?text=Hola%2C%20quiero%20cotizar%20uniformes%20de%20" target="_blank">
                <span class="wa-icon"><svg viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.111.547 4.099 1.504 5.828L0 24l6.335-1.652A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.82c-1.964 0-3.836-.53-5.478-1.51l-.393-.233-3.76.98.998-3.648-.256-.406A9.788 9.788 0 012.18 12c0-5.422 4.398-9.82 9.82-9.82 5.422 0 9.82 4.398 9.82 9.82 0 5.422-4.398 9.82-9.82 9.82z"/></svg></span>
                <span>310 336 2484</span>
            </a>
            <a href="https://wa.me/573213988464?text=Hola%2C%20quiero%20cotizar%20uniformes%20de%20" target="_blank">
                <span class="wa-icon"><svg viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.111.547 4.099 1.504 5.828L0 24l6.335-1.652A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.82c-1.964 0-3.836-.53-5.478-1.51l-.393-.233-3.76.98.998-3.648-.256-.406A9.788 9.788 0 012.18 12c0-5.422 4.398-9.82 9.82-9.82 5.422 0 9.82 4.398 9.82 9.82 0 5.422-4.398 9.82-9.82 9.82z"/></svg></span>
                <span>321 398 8464</span>
            </a>
        </div>
    </div>
</div>

<!-- HERO -->
<section class="hero">
    <div class="container hero-inner">
        <div class="hero-content">
            <span class="hero-badge">+20 Años de Experiencia</span>
            <h1 class="hero-title" id="heroTitle">Uniformes de Fútbol<br/><span class="text-accent">Personalizados</span></h1>
            <p class="hero-sub" id="heroSub">La mejor tecnología en confección y manufactura. 100% personalizados con envíos a toda Colombia, USA y Puerto Rico.</p>
            <div class="hero-actions hero-actions-desktop">
                <a href="#contacto" class="btn btn-primary">Cotiza Ya</a>
                <a href="#categorias" class="btn btn-outline">Ver Catálogo</a>
            </div>
            <div class="hero-badges">
                <div class="hero-badge-item"><strong>+20</strong><span>Años</span></div>
                <div class="hero-badge-item"><strong>100%</strong><span>Personalizado</span></div>
                <div class="hero-badge-item"><strong>Envío</strong><span>Nacional</span></div>
            </div>
        </div>
        <div class="hero-image" id="heroImage">
            <img src="{IMG}/hero-futbol.webp" alt="Uniforme personalizado" class="hero-slide active" data-index="0"/>
            <img data-src="{IMG}/hero-baloncesto.webp" alt="Uniforme de baloncesto" class="hero-slide" data-index="1"/>
            <img data-src="{IMG}/hero-sudaderas.webp" alt="Sudadera deportiva" class="hero-slide" data-index="2"/>
            <img data-src="{IMG}/hero-voleibol.webp" alt="Uniforme de voleibol" class="hero-slide" data-index="3"/>
        </div>
    </div>
    <div class="hero-dots" id="heroDots">
        <button class="hero-dot active" data-index="0"/>
        <button class="hero-dot" data-index="1"/>
        <button class="hero-dot" data-index="2"/>
        <button class="hero-dot" data-index="3"/>
    </div>
</section>

<!-- CATEGORIES -->
<section class="categories" id="categorias">
    <div class="container">
        <h2 class="section-title">Nuestros Productos</h2>
        <p class="section-sub">La mejor tecnología en confección y manufactura deportiva</p>
        <div class="cat-grid">
            <a href="/gallery#futbol" class="cat-card">
                <img src="{IMG}/cat-futbol.webp" alt="Uniformes de Fútbol" class="cat-bg" loading="lazy"/>
                <div class="cat-overlay">
                    <h3>Fútbol</h3>
                    <p>La mejor tecnología en confección y manufactura</p>
                    <span class="cat-card-cta">Ver colección →</span>
                </div>
            </a>
            <a href="/gallery#baloncesto" class="cat-card">
                <img src="{IMG}/cat-baloncesto.webp" alt="Uniformes de Baloncesto" class="cat-bg" loading="lazy"/>
                <div class="cat-overlay">
                    <h3>Baloncesto</h3>
                    <p>La creatividad en los diseños la pones tú</p>
                    <span class="cat-card-cta">Ver colección →</span>
                </div>
            </a>
            <a href="/gallery#voleibol" class="cat-card">
                <img src="{IMG}/cat-voleibol.webp" alt="Uniformes de Voleibol" class="cat-bg" loading="lazy"/>
                <div class="cat-overlay">
                    <h3>Voleibol</h3>
                    <p>Excelente desarrollo de prendas para tu equipo</p>
                    <span class="cat-card-cta">Ver colección →</span>
                </div>
            </a>
            <a href="/gallery#sudaderas" class="cat-card">
                <img src="{IMG}/cat-sudaderas.webp" alt="Sudaderas Deportivas" class="cat-bg" loading="lazy"/>
                <div class="cat-overlay">
                    <h3>Sudaderas</h3>
                    <p>Tus sudaderas como siempre las soñaste</p>
                    <span class="cat-card-cta">Ver colección →</span>
                </div>
            </a>
        </div>
    </div>
</section>

<!-- PRODUCT DETAILS -->
<section class="product-details">
    <div class="container">
        <div class="product-headline">
            <span class="product-headline-label">Nuestros Productos</span>
            <h2>Diseñado Para<br/><span>Los Mejores</span></h2>
            <div class="product-headline-line"/>
        </div>

        <div class="product-row">
            <div class="product-img flip-container">
                <div class="flip-inner">
                    <img src="{IMG}/futbol-front.webp" class="flip-front" alt="Uniforme de Fútbol - Frente" loading="lazy"/>
                    <img src="{IMG}/futbol-back.webp" class="flip-back" alt="Uniforme de Fútbol - Detalle" loading="lazy"/>
                </div>
                <span class="flip-hint">Hover para ver detalle</span>
            </div>
            <div class="product-info">
                <span class="product-num">01</span>
                <span class="product-label">Fútbol</span>
                <h2>Uniformes de Fútbol</h2>
                <ul>
                    <li>La mejor tecnología en confección y manufactura</li>
                    <li>Uniformes de fútbol 100% personalizados</li>
                    <li>Óptimo proceso de fabricación de uniformes</li>
                </ul>
                <a href="#contacto" class="btn-arrow">Cotiza Ya
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </a>
            </div>
        </div>

        <div class="product-row reverse">
            <div class="product-img flip-container">
                <div class="flip-inner">
                    <img src="{IMG}/baloncesto-front.webp" class="flip-front" alt="Uniforme de Baloncesto - Frente" loading="lazy"/>
                    <img src="{IMG}/baloncesto-back.webp" class="flip-back" alt="Uniforme de Baloncesto - Detalle" loading="lazy"/>
                </div>
                <span class="flip-hint">Hover para ver detalle</span>
            </div>
            <div class="product-info">
                <span class="product-num">02</span>
                <span class="product-label">Baloncesto</span>
                <h2>Uniformes de Baloncesto</h2>
                <ul>
                    <li>Inolvidables experiencias para tu equipo</li>
                    <li>Los mejores procesos de elaboración</li>
                    <li>La creatividad en los diseños la pones tú</li>
                </ul>
                <a href="#contacto" class="btn-arrow">Cotiza Ya
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </a>
            </div>
        </div>

        <div class="product-row">
            <div class="product-img">
                <img src="{IMG}/sudaderas-single.webp" alt="Sudaderas Deportivas Personalizadas" loading="lazy"/>
            </div>
            <div class="product-info">
                <span class="product-num">03</span>
                <span class="product-label">Sudaderas</span>
                <h2>Sudaderas Deportivas</h2>
                <ul>
                    <li>Tus sudaderas como siempre las soñaste</li>
                    <li>La presentación de tu equipo la hacemos nosotros</li>
                    <li>La mejor calidad para tu equipo de fútbol</li>
                </ul>
                <a href="#contacto" class="btn-arrow">Cotiza Ya
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </a>
            </div>
        </div>

        <div class="product-row reverse">
            <div class="product-img flip-container">
                <div class="flip-inner">
                    <img src="{IMG}/voleibol-front.webp" class="flip-front" alt="Uniforme de Voleibol - Frente" loading="lazy"/>
                    <img src="{IMG}/voleibol-back.webp" class="flip-back" alt="Uniforme de Voleibol - Detalle" loading="lazy"/>
                </div>
                <span class="flip-hint">Hover para ver detalle</span>
            </div>
            <div class="product-info">
                <span class="product-num">04</span>
                <span class="product-label">Voleibol</span>
                <h2>Uniformes de Voleibol</h2>
                <ul>
                    <li>Nosotros te damos los puntos en innovación</li>
                    <li>Creamos lo mejor para ti</li>
                    <li>Excelente desarrollo de prendas para tu equipo</li>
                </ul>
                <a href="#contacto" class="btn-arrow">Cotiza Ya
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </a>
            </div>
        </div>
    </div>
</section>

<!-- BANNER CTA -->
<section class="banner-cta" style="background: url('{IMG}/banner-bg.png') center/cover no-repeat fixed;">
    <div class="banner-overlay">
        <div class="container banner-inner">
            <span class="banner-label">Desde 2003</span>
            <h2>Más de 20 Años Creando<br/>lo Mejor Para los Mejores</h2>
            <a href="#contacto" class="btn btn-white">Cotiza Ya →</a>
        </div>
    </div>
</section>

<!-- ABOUT -->
<section class="about" id="nosotros">
    <div class="container about-inner">
        <div class="about-content">
            <span class="section-label">Sobre Nosotros</span>
            <h2>Fabricación de Uniformes Personalizados</h2>
            <p>Somos una empresa con exigentes procesos de calidad que busca brindar lo mejor de lo mejor para los mejores. Todo en Uniformes Personalizados deportivos, Uniformes de Fútbol, Microfútbol, Baloncesto, Ciclismo, Voleibol, Béisbol, sudaderas y dotaciones empresariales &amp; implementos deportivos.</p>
            <p>Pretendemos contribuir por medio del deporte con las mejores vivencias y una experiencia única y cercana a nuestros clientes.</p>
            <a href="#contacto" class="btn btn-primary">Saber Más</a>
        </div>
        <div class="about-image">
            <img src="{IMG}/about-banner.webp" alt="Fábrica de uniformes Life Deportes" loading="lazy"/>
        </div>
    </div>
</section>

<!-- PROCESS -->
<section class="process">
    <div class="container">
        <h2 class="section-title">Proceso Fácil y Rápido</h2>
        <p class="section-sub">En 4 simples pasos tendrás tus uniformes personalizados</p>
        <div class="process-grid">
            <div class="process-step">
                <div class="process-img-wrap">
                    <img src="{IMG}/process-1.webp" alt="Cotiza ahora" loading="lazy"/>
                    <span class="process-num">01</span>
                </div>
                <h3>Cotiza Ahora</h3>
                <p>Cuéntanos qué necesitas y te asesoramos</p>
            </div>
            <div class="process-step">
                <div class="process-img-wrap">
                    <img src="{IMG}/process-2.webp" alt="Diseña con nosotros" loading="lazy"/>
                    <span class="process-num">02</span>
                </div>
                <h3>Diseña con Nosotros</h3>
                <p>Personalizamos cada detalle a tu gusto</p>
            </div>
            <div class="process-step">
                <div class="process-img-wrap">
                    <img src="{IMG}/process-3.webp" alt="Vive el proceso" loading="lazy"/>
                    <span class="process-num">03</span>
                </div>
                <h3>Vive el Proceso</h3>
                <p>Acompañamos la fabricación de principio a fin</p>
            </div>
            <div class="process-step">
                <div class="process-img-wrap">
                    <img src="{IMG}/process-4.webp" alt="Disfruta tus prendas" loading="lazy"/>
                    <span class="process-num">04</span>
                </div>
                <h3>Disfruta tus Prendas</h3>
                <p>Recibe uniformes de calidad premium</p>
            </div>
        </div>
    </div>
</section>

<!-- TESTIMONIALS -->
<section class="testimonials">
    <div class="container">
        <h2 class="section-title light">Lo Que Dicen Nuestros Clientes</h2>
        <div class="testimonial-grid" id="testimonial-grid"/>
        <div class="testimonial-dots" id="testimonial-dots"/>
    </div>
</section>

<!-- WHY US -->
<section class="why-us">
    <div class="container">
        <div class="why-stats">
            <div class="why-stat">
                <strong data-target="20" data-prefix="+">+20</strong>
                <span>Años de<br/>Experiencia</span>
            </div>
            <div class="why-stat">
                <strong data-target="100" data-suffix="%">100%</strong>
                <span>Satisfacción<br/>Garantizada</span>
            </div>
            <div class="why-stat">
                <strong data-target="32">32</strong>
                <span>Departamentos<br/>con Entrega</span>
            </div>
            <div class="why-stat">
                <strong data-target="200" data-prefix="+">+200</strong>
                <span>Equipos<br/>Uniformados</span>
            </div>
        </div>
    </div>
</section>

<!-- CONTACT -->
<section class="contact" id="contacto">
    <div class="container contact-inner">
        <div class="contact-info">
            <h2>Información de Contacto</h2>
            <div class="contact-cards">
                <div class="contact-card">
                    <div class="contact-card-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                    </div>
                    <a href="tel:+573103362484">(310) 336 2484</a>
                </div>
                <div class="contact-card">
                    <div class="contact-card-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                    </div>
                    <a href="tel:+573213988464">(321) 398 8464</a>
                </div>
                <div class="contact-card">
                    <div class="contact-card-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    </div>
                    <a href="mailto:info@lifedeportes.com">info@lifedeportes.com</a>
                </div>
                <div class="contact-card">
                    <div class="contact-card-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    </div>
                    <a href="https://maps.google.com/?cid=12304529363039725410" target="_blank">Cl. 66a #98a 12, Bogotá,<br/>Cundinamarca, Colombia</a>
                </div>
            </div>
            <div class="contact-map">
                <iframe src="https://maps.google.com/maps?cid=12304529363039725410&amp;output=embed" loading="lazy" title="Ubicación Life Deportes"/>
            </div>
        </div>
        <div class="contact-form-card">
            <h2>¡Cotiza Ya!</h2>
            <p class="form-subtitle">Tu uniforme ideal está a un mensaje de distancia. Cuéntanos qué necesitas.</p>
            <div id="ld-form-msg"/>
            <form id="ld-quote-form" class="quote-form" action="/website_form/crm.lead" method="post" enctype="multipart/form-data">
                <input type="hidden" name="csrf_token" t-att-value="request.csrf_token() if request else ''"/>
                <div class="form-row">
                    <div class="form-field">
                        <label class="form-label">Nombre completo <span class="form-req">*</span></label>
                        <input type="text" name="contact_name" placeholder="Tu nombre" required="required" autocomplete="name"/>
                    </div>
                    <div class="form-field">
                        <label class="form-label">Tipo de uniforme <span class="form-req">*</span></label>
                        <select name="ld_tipo" required="required">
                            <option value="">Selecciona...</option>
                            <option value="futbol">Fútbol</option>
                            <option value="microfutbol">Microfútbol</option>
                            <option value="baloncesto">Baloncesto</option>
                            <option value="voleibol">Voleibol</option>
                            <option value="sudaderas">Sudaderas</option>
                            <option value="ciclismo">Ciclismo</option>
                            <option value="otro">Otro deporte</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-field">
                        <label class="form-label">WhatsApp / Teléfono <span class="form-req">*</span></label>
                        <input type="tel" name="phone" placeholder="310 000 0000" required="required" autocomplete="tel"/>
                    </div>
                    <div class="form-field">
                        <label class="form-label">Correo electrónico</label>
                        <input type="email" name="email_from" placeholder="tu@correo.com" autocomplete="email"/>
                    </div>
                </div>
                <div class="form-field">
                    <label class="form-label">¿Qué necesitas?</label>
                    <textarea name="description" rows="4" placeholder="Ej: 15 uniformes de fútbol con número y nombre, tallas S, M y L..."/>
                </div>
                <button type="submit" class="btn btn-primary btn-full">Solicitar Cotización Gratis</button>
            </form>
        </div>
    </div>
</section>
"""

# --------------------------------------------------------------------------
# 3) JS — hero rotativo, counter, flip mobile, testimonios, form fetch
# --------------------------------------------------------------------------

JS = r"""
(function () {
  function init() {
    var root = document.querySelector('.ld-home');
    if (!root) return;

    // ----- HERO CAROUSEL (texto + imagen sincronizados) -----
    var heroSlides = [
      { title: 'Uniformes de Fútbol<br><span class="text-accent">Personalizados</span>',
        sub: 'La mejor tecnología en confección y manufactura. 100% personalizados con envíos a toda Colombia, USA y Puerto Rico.' },
      { title: 'Diseño y Calidad en<br><span class="text-accent">Cada Uniforme</span>',
        sub: 'Inolvidables experiencias para tu equipo de baloncesto. La creatividad en los diseños la pones tú.' },
      { title: 'Personaliza tus<br><span class="text-accent">Sudaderas</span>',
        sub: 'Tus sudaderas como siempre las soñaste. La presentación de tu equipo la hacemos nosotros.' },
      { title: '+20 Años Vistiendo<br><span class="text-accent">a los Mejores</span>',
        sub: 'Excelente desarrollo de prendas de voleibol para tu equipo. Creamos lo mejor para ti.' }
    ];
    var heroTitle = root.querySelector('#heroTitle');
    var heroSub   = root.querySelector('#heroSub');
    var slides    = root.querySelectorAll('.hero-slide');
    var dots      = root.querySelectorAll('.hero-dot');
    var current   = 0;
    var heroInterval;

    function loadImg(s) {
      if (s && s.dataset.src && !s.src) { s.src = s.dataset.src; delete s.dataset.src; }
    }
    function go(i) {
      loadImg(slides[i]);
      loadImg(slides[(i + 1) % slides.length]);
      heroTitle.classList.add('fade-out');
      heroSub.classList.add('fade-out');
      slides[current].classList.remove('active');
      dots[current].classList.remove('active');
      current = i;
      slides[current].classList.add('active');
      dots[current].classList.add('active');
      setTimeout(function () {
        heroTitle.innerHTML = heroSlides[current].title;
        heroSub.textContent = heroSlides[current].sub;
        heroTitle.classList.remove('fade-out');
        heroSub.classList.remove('fade-out');
      }, 300);
    }
    function nextSlide() { go((current + 1) % slides.length); }
    function startHero() { heroInterval = setInterval(nextSlide, 5000); }
    Array.prototype.forEach.call(dots, function (dot) {
      dot.addEventListener('click', function () {
        clearInterval(heroInterval);
        go(parseInt(dot.dataset.index, 10));
        startHero();
      });
    });
    if (slides.length) startHero();
    setTimeout(function () { loadImg(slides[1]); }, 1500);

    // ----- FLIP CARDS EN MOBILE -----
    if ('ontouchstart' in window) {
      root.querySelectorAll('.flip-container').forEach(function (el) {
        el.addEventListener('click', function () { el.classList.toggle('flipped'); });
      });
    }

    // ----- COUNTERS -----
    var counters = root.querySelectorAll('.why-stat strong[data-target]');
    var why = root.querySelector('.why-us');
    var counted = false;
    if (why && counters.length && 'IntersectionObserver' in window) {
      var obs = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && !counted) {
          counted = true;
          Array.prototype.forEach.call(counters, function (el) {
            var target = +el.dataset.target;
            var prefix = el.dataset.prefix || '';
            var suffix = el.dataset.suffix || '';
            var dur = 1800, t0 = performance.now();
            function tick(now) {
              var p = Math.min((now - t0) / dur, 1);
              var eased = 1 - Math.pow(1 - p, 3);
              el.textContent = prefix + Math.round(eased * target) + suffix;
              if (p < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
          });
          obs.disconnect();
        }
      }, { threshold: 0.5 });
      obs.observe(why);
    }

    // ----- TESTIMONIALS -----
    var testimonials = [
      {t:"Una empresa con un excelente servicio al cliente, seriedad y responsabilidad en los trabajos contratados. Agradecidos y muy satisfechos por el producto terminado.",n:"Omar Valencia",s:"Club Master Real Mediacanoa — Yotoco, Valle del Cauca"},
      {t:"Mandé a hacer 57 uniformes, con diseño exclusivo tanto para camiseta como para pantaloneta, la entrega fue en los 10 días prometidos, la calidad fue espectacular. El personal a cargo de confección son súper amables. 100% recomendado.",n:"Andrés Mariño",s:"Google Local Guide"},
      {t:"Tengo más de 4 años trabajando con esta empresa, soy propietario de 5 escuelas de fútbol y siempre han sido muy profesionales. Gran atención, puntualidad, buenos precios y buena calidad.",n:"Dreyer Bracho",s:"Propietario de 5 escuelas de fútbol"},
      {t:"Como club con más de 34 años de trayectoria, siempre buscamos calidad y compromiso. Life Soluciones Deportivas ha sido un aliado clave. Su responsabilidad, eficiencia y rápida respuesta nos han permitido trabajar con confianza durante varios años.",n:"Mezly Brito",s:"Academia Iguarán F.C — 34 años de trayectoria"},
      {t:"Excelente empresa, llevo más de 5 años con Life Deportes donde me hacen los uniformes de mi club de fútbol Real Pensilvania. La he recomendado a varios amigos, siempre me han quedado muy bien, uniformes de muy buena calidad.",n:"Omar Salazar Nieto",s:"Club Real Pensilvania — +5 años como cliente"},
      {t:"Hemos estado trabajando con esta empresa haciendo pedidos para nuestros equipos femeninos y niños en Sevilla, Valle del Cauca. Muy buena calidad y diseños, y lo más importante: el cumplimiento de las entregas.",n:"Carlos Alberto Ortega",s:"Sevilla, Valle del Cauca"},
      {t:"Ya son 7 oportunidades que hemos contratado con Life Deportes, serios y muy atentos durante todo el proceso de confección. La calidad de sus confecciones, ni se diga, únicas e inigualables. Recomendados al 200%.",n:"Nelson E. Altamar C.",s:"Cliente recurrente — 7 pedidos"},
      {t:"Mandé a hacer 10 uniformes para dama para jugar microfútbol y todas quedamos contentas con la calidad y el diseño. Lo más importante: son confiables y responsables.",n:"Yisney Carolina Herrera",s:"Equipo femenino de microfútbol"},
      {t:"Excelente servicio, muy buena la atención, todo vía WhatsApp. El material y los terminados de buena calidad, y nos llegaron los uniformes hasta El Viento, Vichada.",n:"Jefferson Morris",s:"El Viento, Vichada"},
      {t:"Excelente servicio y mejor aún las prendas, hemos sacado diferentes tipos de uniformes, chaquetas y camisetas y nos ha encantado. Vale mencionar que son útiles para muchas disciplinas deportivas y de calle.",n:"Club Deportivo Shaolin",s:"Escuela de Vida"},
      {t:"Recomendadísimo Life Soluciones Deportivas!! Productos de excelente calidad, cumplidos con la entrega de los pedidos. Un servicio completo que nos da tranquilidad y confianza al momento de tomar la decisión de compra.",n:"Inversiones ME SAS",s:"Cliente empresarial"},
      {t:"Solo tengo agradecimiento por el trabajo realizado para la escuela de fútbol de Páramo, Santander. Excelente empresa y cumplida.",n:"Edinson Tiria Gómez",s:"Escuela de fútbol — Páramo, Santander"}
    ];
    var tGrid  = root.querySelector('#testimonial-grid');
    var tDotsC = root.querySelector('#testimonial-dots');
    var perPage = 4;
    var totalPages = Math.ceil(testimonials.length / perPage);
    if (tGrid && tDotsC) {
      function showPage(p) {
        tGrid.style.animation = 'none';
        void tGrid.offsetHeight;
        tGrid.style.animation = 'fadeIn .4s ease';
        tGrid.innerHTML = '';
        var start = p * perPage;
        var end = Math.min(start + perPage, testimonials.length);
        for (var i = start; i < end; i++) {
          var c = testimonials[i];
          tGrid.innerHTML +=
            '<div class="testimonial-card"><div class="testimonial-quote">"</div><p>' +
            c.t + '</p><div class="testimonial-author"><strong>' +
            c.n + '</strong><span>' + c.s + '</span></div></div>';
        }
        tDotsC.querySelectorAll('button').forEach(function (d) {
          d.classList.toggle('active', parseInt(d.dataset.page, 10) === p);
        });
      }
      for (var i = 0; i < totalPages; i++) {
        var b = document.createElement('button');
        b.dataset.page = i;
        if (i === 0) b.classList.add('active');
        b.addEventListener('click', function () { showPage(parseInt(this.dataset.page, 10)); });
        tDotsC.appendChild(b);
      }
      showPage(0);
      var tInterval = setInterval(function () {
        showPage((parseInt(tDotsC.querySelector('button.active').dataset.page, 10) + 1) % totalPages);
      }, 8000);
    }

    // ----- FORM SUBMIT con fallback a WhatsApp -----
    var form = root.querySelector('form#ld-quote-form');
    if (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var data = new FormData(form);
        var name = (data.get('contact_name') || '').toString();
        var tipo = (data.get('ld_tipo') || '').toString();
        var msg  = (data.get('description') || '').toString();
        data.set('description',
          'Tipo de uniforme: ' + tipo + '\n\nMensaje:\n' + (msg || '(sin mensaje)'));
        data.set('name', 'Cotización web ' + (tipo || 'general'));
        var msgEl = root.querySelector('#ld-form-msg');
        var btn = form.querySelector('button[type=submit]');
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
        fetch('/website_form/crm.lead', {
          method: 'POST', body: data, credentials: 'same-origin'
        }).then(function (r) {
          if (!r.ok) throw new Error('http ' + r.status);
          return r.json().catch(function () { return {}; });
        }).then(function () {
          if (msgEl) {
            msgEl.style.cssText =
              'background:#ecfdf5;border:1px solid #10b981;color:#065f46;' +
              'padding:14px;border-radius:12px;margin-bottom:16px;font-weight:600;';
            msgEl.textContent = '¡Listo! Recibimos tu solicitud y te contactaremos por WhatsApp pronto.';
          }
          form.reset();
          if (btn) { btn.disabled = false; btn.textContent = 'Solicitar Cotización Gratis'; }
        }).catch(function () {
          var wa = 'https://wa.me/573103362484?text=' + encodeURIComponent(
            'Hola, soy ' + (name || 'interesado') + '. Quiero cotizar uniformes de ' +
            (tipo || 'deportes') + '. ' + (msg ? '\nDetalle: ' + msg : '')
          );
          window.location.href = wa;
        });
      });
    }
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
"""

# --------------------------------------------------------------------------
# 4) Construir arch QWeb completo
# --------------------------------------------------------------------------

# Restringir CDATA: en QWeb XML, CDATA se reescribe pero el contenido se
# preserva. Probamos sin CDATA usando entities donde toque, ya que Odoo
# decodifica entities al renderizar (verificado en iter 1).

style_block = '<style type="text/css"><![CDATA[\n' + css_final + '\n]]></style>'
script_block = '<script type="text/javascript"><![CDATA[\n' + JS + '\n]]></script>'

arch = (
    '<t t-name="website.home">\n'
    '    <t t-call="website.layout">\n'
    '        <div id="wrap" class="oe_structure ld-home">\n'
    + style_block + '\n'
    + HTML + '\n'
    + script_block + '\n'
    '        </div>\n'
    '    </t>\n'
    '</t>'
)

with open("/tmp/ld_home_arch_v2.json", "w", encoding="utf-8") as f:
    json.dump({"arch": arch}, f, ensure_ascii=False)

print("OK iter2 arch length:", len(arch))
print("css len:", len(css_final), "html len:", len(HTML), "js len:", len(JS))
