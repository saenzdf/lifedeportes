"""
Construye el arch_db de la vista website.home (id=5324, website lifedeportes.com)
con las secciones replicando lifedeportes.com.

- CSS y JS quedan inline (CDATA) para que basta una sola escritura.
- Imágenes: URLs absolutas https://lifedeportes.com/img/...
  Mantener filenames al día con lifedeportes.com (los recursos pueden renombrarse).

Salida: /tmp/ld_home_arch.json con {"arch": "..."} listo para pasar a write.
Testimonios: archivo local testimonials_data.json → inyectado como JSON en JS.
"""
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
TESTIMONIALS_PATH = os.path.join(ROOT, "testimonials_data.json")
CSS_PATH = "/tmp/ld_compiled.css"

with open(TESTIMONIALS_PATH, encoding="utf-8") as _tf:
    _TESTIMONIALS_FOR_JS = json.load(_tf)
TESTIMONIALS_JSON_LITERAL = json.dumps(_TESTIMONIALS_FOR_JS, ensure_ascii=False)

with open(CSS_PATH, "r", encoding="utf-8") as f:
    css = f.read()

# JS vanilla (hero, testimonios, contadores, flip, form)
JS_HEAD = """(function () {
  var LD_TESTIMONIALS = """

JS_TAIL = r""";
  function init() {
    var roots = document.querySelectorAll('.ld-home');
    if (!roots.length) return;
    roots.forEach(function (root) { initHome(root); });
  }
  function initHome(el) {
    // ----- HERO CAROUSEL -----
    var slider = el.querySelector('[data-ld-hero-slider]');
    if (slider) {
      var slides = Array.prototype.slice.call(slider.querySelectorAll('.ld-hero-slide'));
      var dots = Array.prototype.slice.call(el.querySelectorAll('.ld-hero-dot'));
      var active = 0;
      slides.forEach(function (img) {
        var lazy = img.getAttribute('data-src');
        if (lazy && !img.getAttribute('src')) img.setAttribute('src', lazy);
      });
      function go(idx) {
        active = (idx + slides.length) % slides.length;
        slides.forEach(function (s, i) { s.classList.toggle('active', i === active); });
        dots.forEach(function (d, i) { d.classList.toggle('active', i === active); });
      }
      dots.forEach(function (d, i) { d.addEventListener('click', function () { go(i); }); });
      setInterval(function () { go(active + 1); }, 5000);
    }

    // ----- CONTADORES -----
    var stats = el.querySelectorAll('.ld-why-stat strong[data-target]');
    function animate(node) {
      var target = parseInt(node.dataset.target, 10) || 0;
      var prefix = node.dataset.prefix || '';
      var suffix = node.dataset.suffix || '';
      var dur = 1400, t0 = performance.now();
      function tick(now) {
        var p = Math.min(1, (now - t0) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        node.textContent = prefix + Math.floor(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
        else node.textContent = prefix + target + suffix;
      }
      requestAnimationFrame(tick);
    }
    if (stats.length && 'IntersectionObserver' in window) {
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { animate(e.target); obs.unobserve(e.target); }
        });
      }, { threshold: 0.4 });
      Array.prototype.forEach.call(stats, function (s) { obs.observe(s); });
    }

    // ----- FLIP CARDS EN MOBILE -----
    if (!window.matchMedia('(hover:hover)').matches) {
      el.querySelectorAll('.ld-flip-container').forEach(function (c) {
        c.addEventListener('click', function () { c.classList.toggle('ld-flipped'); });
      });
      var style = document.createElement('style');
      style.textContent = '.ld-flip-container.ld-flipped .ld-flip-inner { transform: rotateY(180deg); }';
      document.head.appendChild(style);
    }

    // ----- TESTIMONIOS (mismo modelo que lifedeportes.com) -----
    var tGrid = el.querySelector('[data-ld-testimonial-grid]');
    var tDotsC = el.querySelector('[data-ld-testimonial-dots]');
    if (tGrid && tDotsC && LD_TESTIMONIALS && LD_TESTIMONIALS.length) {
      var perPage = 4;
      var totalPages = Math.ceil(LD_TESTIMONIALS.length / perPage);
      var curPage = 0;
      var testimonialTimer;

      function showTestimonialPage(p) {
        curPage = p;
        tGrid.innerHTML = '';
        var start = p * perPage;
        var end = Math.min(start + perPage, LD_TESTIMONIALS.length);
        for (var i = start; i < end; i++) {
          var c = LD_TESTIMONIALS[i];
          var div = document.createElement('div');
          div.className = 'ld-testimonial-card';
          var q = document.createElement('div');
          q.className = 'ld-testimonial-quote';
          q.textContent = '"';
          var pEl = document.createElement('p');
          pEl.textContent = String(c.t);
          var au = document.createElement('div');
          au.className = 'ld-testimonial-author';
          var nm = document.createElement('strong');
          nm.textContent = String(c.n);
          var sp = document.createElement('span');
          sp.textContent = String(c.s);
          au.appendChild(nm);
          au.appendChild(sp);
          div.appendChild(q);
          div.appendChild(pEl);
          div.appendChild(au);
          tGrid.appendChild(div);
        }
        Array.prototype.forEach.call(tDotsC.querySelectorAll('button'), function (d, idx) {
          d.classList.toggle('active', idx === curPage);
        });
      }

      tDotsC.innerHTML = '';
      for (var i = 0; i < totalPages; i++) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('data-page', String(i));
        if (i === 0) dot.classList.add('active');
        dot.addEventListener('click', function () {
          var p = parseInt(this.getAttribute('data-page'), 10);
          if (testimonialTimer) clearInterval(testimonialTimer);
          showTestimonialPage(p);
          testimonialTimer = setInterval(function () {
            showTestimonialPage((curPage + 1) % totalPages);
          }, 8000);
        });
        tDotsC.appendChild(dot);
      }

      showTestimonialPage(0);
      testimonialTimer = setInterval(function () {
        showTestimonialPage((curPage + 1) % totalPages);
      }, 8000);
    }

    // ----- CRM (website form estándar Odoo → crm.lead) -----
    // POST a /website/form/crm.lead ; solo campos reales del modelo.
    var form = el.querySelector('form#ld-quote-form');
    if (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var tipoEl = document.getElementById('ld-quote-tipo');
        var tipo = tipoEl ? (tipoEl.value || '').toString() : '';
        var data = new FormData(form);
        var name = (data.get('contact_name') || '').toString();
        var msg  = (data.get('description') || '').toString();
        data.set('description',
          'Tipo de uniforme: ' + tipo + '\n\nMensaje:\n' + (msg || '(sin mensaje)'));
        data.set('name', 'Cotización web — ' + (tipo || 'general'));
        data.delete('ld_tipo');
        form.setAttribute('action', '/website/form/crm.lead');
        var msgEl = el.querySelector('#ld-form-msg');
        var btn = form.querySelector('button[type=submit]');
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
        fetch('/website/form/crm.lead', {
          method: 'POST',
          body: data,
          credentials: 'same-origin',
          headers: {'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest'}
        }).then(function (r) {
          var ct = (r.headers.get('content-type') || '');
          if (ct.indexOf('application/json') !== -1)
            return r.json().catch(function () { return {}; });
          if (!r.ok) throw new Error('http ' + r.status);
          return {};
        }).then(function () {
          if (msgEl) {
            msgEl.className = 'ld-form-success';
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

JS = JS_HEAD + TESTIMONIALS_JSON_LITERAL + JS_TAIL

# URL base de las imágenes (CDN propio del cliente)
IMG = "https://lifedeportes.com/img"

HTML = """<section class="ld-hero">
    <div class="container ld-hero-inner">
        <div class="ld-hero-content">
            <span class="ld-hero-badge">+20 Años de Experiencia</span>
            <h1 class="ld-hero-title">Uniformes de Fútbol<br/><span class="text-accent">Personalizados</span></h1>
            <p class="ld-hero-sub">La mejor tecnología en confección y manufactura. 100% personalizados con envíos a toda Colombia, USA y Puerto Rico.</p>
            <div class="ld-hero-actions">
                <a href="#contacto" class="ld-btn ld-btn-primary">Cotiza Ya</a>
                <a href="#categorias" class="ld-btn ld-btn-outline">Ver Catálogo</a>
            </div>
            <a href="https://wa.me/573103362484?text=Hola%2C%20quiero%20cotizar%20uniformes%20de%20" class="ld-hero-wa">
                <i class="fa fa-whatsapp"/> Cotiza gratis por WhatsApp
            </a>
            <p class="ld-hero-trust d-md-none">Sin compromiso · Respuesta en minutos</p>
            <div class="ld-hero-badges">
                <div class="ld-hero-badge-item"><strong>+20</strong><span>Años</span></div>
                <div class="ld-hero-badge-item"><strong>100%</strong><span>Personalizado</span></div>
                <div class="ld-hero-badge-item"><strong>Envío</strong><span>Nacional</span></div>
            </div>
        </div>
        <div class="ld-hero-image" data-ld-hero-slider="1">
            <img src="{IMG}/uniformes-de-futbol-personalizados-colombia.webp" alt="Uniforme de fútbol personalizado" class="ld-hero-slide active" data-index="0"/>
            <img data-src="{IMG}/uniformes-de-baloncesto-personalizados.webp" alt="Uniforme de baloncesto" class="ld-hero-slide" data-index="1"/>
            <img data-src="{IMG}/sudaderas-deportivas-personalizadas.webp" alt="Sudadera deportiva" class="ld-hero-slide" data-index="2"/>
            <img data-src="{IMG}/uniformes-de-voleibol-personalizados.webp" alt="Uniforme de voleibol" class="ld-hero-slide" data-index="3"/>
        </div>
    </div>
    <div class="ld-hero-dots">
        <button class="ld-hero-dot active" data-index="0"/>
        <button class="ld-hero-dot" data-index="1"/>
        <button class="ld-hero-dot" data-index="2"/>
        <button class="ld-hero-dot" data-index="3"/>
    </div>
</section>

<section class="ld-categories" id="categorias">
    <div class="container">
        <h2 class="ld-section-title">Nuestros Productos</h2>
        <p class="ld-section-sub">La mejor tecnología en confección y manufactura deportiva</p>
        <div class="ld-cat-grid">
            <a href="/gallery#futbol" class="ld-cat-card">
                <img src="{IMG}/categoria-uniformes-futbol.webp" alt="Uniformes de Fútbol" class="ld-cat-bg" loading="lazy"/>
                <div class="ld-cat-overlay">
                    <h3>Fútbol</h3>
                    <p>La mejor tecnología en confección y manufactura</p>
                    <span class="ld-cat-cta">Ver colección →</span>
                </div>
            </a>
            <a href="/gallery#baloncesto" class="ld-cat-card">
                <img src="{IMG}/categoria-uniformes-baloncesto.webp" alt="Uniformes de Baloncesto" class="ld-cat-bg" loading="lazy"/>
                <div class="ld-cat-overlay">
                    <h3>Baloncesto</h3>
                    <p>La creatividad en los diseños la pones tú</p>
                    <span class="ld-cat-cta">Ver colección →</span>
                </div>
            </a>
            <a href="/gallery#voleibol" class="ld-cat-card">
                <img src="{IMG}/categoria-uniformes-voleibol.webp" alt="Uniformes de Voleibol" class="ld-cat-bg" loading="lazy"/>
                <div class="ld-cat-overlay">
                    <h3>Voleibol</h3>
                    <p>Excelente desarrollo de prendas para tu equipo</p>
                    <span class="ld-cat-cta">Ver colección →</span>
                </div>
            </a>
            <a href="/gallery#sudaderas" class="ld-cat-card">
                <img src="{IMG}/categoria-sudaderas-deportivas.webp" alt="Sudaderas Deportivas" class="ld-cat-bg" loading="lazy"/>
                <div class="ld-cat-overlay">
                    <h3>Sudaderas</h3>
                    <p>Tus sudaderas como siempre las soñaste</p>
                    <span class="ld-cat-cta">Ver colección →</span>
                </div>
            </a>
        </div>
    </div>
</section>

<section class="ld-product-details">
    <div class="container">
        <div class="ld-product-headline">
            <span class="ld-product-headline-label">Nuestros Productos</span>
            <h2>Diseñado Para Los<br/><span>Mejores</span></h2>
            <div class="ld-product-headline-line"/>
        </div>

        <div class="ld-product-row">
            <div class="ld-product-img ld-flip-container">
                <div class="ld-flip-inner">
                    <img src="{IMG}/futbol-front.webp" class="ld-flip-front" alt="Uniforme de Fútbol - Frente"/>
                    <img src="{IMG}/futbol-back.webp" class="ld-flip-back" alt="Uniforme de Fútbol - Detalle"/>
                </div>
                <span class="ld-flip-hint">Hover para ver detalle</span>
            </div>
            <div class="ld-product-info">
                <span class="ld-product-num">01</span>
                <span class="ld-product-label">Fútbol</span>
                <h2>Uniformes de Fútbol</h2>
                <ul>
                    <li>La mejor tecnología en confección y manufactura</li>
                    <li>Uniformes de fútbol 100% personalizados</li>
                    <li>Óptimo proceso de fabricación de uniformes</li>
                </ul>
                <a href="#contacto" class="ld-btn-arrow">Cotiza Ya <i class="fa fa-long-arrow-right"/></a>
            </div>
        </div>

        <div class="ld-product-row reverse">
            <div class="ld-product-img ld-flip-container">
                <div class="ld-flip-inner">
                    <img src="{IMG}/baloncesto-front.webp" class="ld-flip-front" alt="Uniforme de Baloncesto - Frente"/>
                    <img src="{IMG}/baloncesto-back.webp" class="ld-flip-back" alt="Uniforme de Baloncesto - Detalle"/>
                </div>
                <span class="ld-flip-hint">Hover para ver detalle</span>
            </div>
            <div class="ld-product-info">
                <span class="ld-product-num">02</span>
                <span class="ld-product-label">Baloncesto</span>
                <h2>Uniformes de Baloncesto</h2>
                <ul>
                    <li>Inolvidables experiencias para tu equipo</li>
                    <li>Los mejores procesos de elaboración</li>
                    <li>La creatividad en los diseños la pones tú</li>
                </ul>
                <a href="#contacto" class="ld-btn-arrow">Cotiza Ya <i class="fa fa-long-arrow-right"/></a>
            </div>
        </div>

        <div class="ld-product-row">
            <div class="ld-product-img">
                <img src="{IMG}/sudaderas-single.webp" alt="Sudaderas Deportivas Personalizadas" loading="lazy"/>
            </div>
            <div class="ld-product-info">
                <span class="ld-product-num">03</span>
                <span class="ld-product-label">Sudaderas</span>
                <h2>Sudaderas Deportivas</h2>
                <ul>
                    <li>Tus sudaderas como siempre las soñaste</li>
                    <li>La presentación de tu equipo la hacemos nosotros</li>
                    <li>La mejor calidad para tu equipo de fútbol</li>
                </ul>
                <a href="#contacto" class="ld-btn-arrow">Cotiza Ya <i class="fa fa-long-arrow-right"/></a>
            </div>
        </div>

        <div class="ld-product-row reverse">
            <div class="ld-product-img ld-flip-container">
                <div class="ld-flip-inner">
                    <img src="{IMG}/voleibol-front.webp" class="ld-flip-front" alt="Uniforme de Voleibol - Frente"/>
                    <img src="{IMG}/voleibol-back.webp" class="ld-flip-back" alt="Uniforme de Voleibol - Detalle"/>
                </div>
                <span class="ld-flip-hint">Hover para ver detalle</span>
            </div>
            <div class="ld-product-info">
                <span class="ld-product-num">04</span>
                <span class="ld-product-label">Voleibol</span>
                <h2>Uniformes de Voleibol</h2>
                <ul>
                    <li>Nosotros te damos los puntos en innovación</li>
                    <li>Creamos lo mejor para ti</li>
                    <li>Excelente desarrollo de prendas para tu equipo</li>
                </ul>
                <a href="#contacto" class="ld-btn-arrow">Cotiza Ya <i class="fa fa-long-arrow-right"/></a>
            </div>
        </div>
    </div>
</section>

<section class="ld-banner-cta">
    <div class="ld-banner-overlay">
        <div class="container ld-banner-inner">
            <span class="ld-banner-label">Desde 2003</span>
            <h2>Más de 20 Años Creando lo Mejor Para los Mejores</h2>
            <a href="#contacto" class="ld-btn ld-btn-white">Cotiza Ya →</a>
        </div>
    </div>
</section>

<section class="ld-about" id="nosotros">
    <div class="container ld-about-inner">
        <div class="ld-about-content">
            <span class="ld-section-label">Sobre Nosotros</span>
            <h2>Fabricación de Uniformes Personalizados</h2>
            <p>Somos una empresa con exigentes procesos de calidad que busca brindar lo mejor de lo mejor para los mejores. Todo en Uniformes Personalizados deportivos, Uniformes de Fútbol, Microfútbol, Baloncesto, Ciclismo, Voleibol, Béisbol, sudaderas y dotaciones empresariales &amp; implementos deportivos.</p>
            <p>Pretendemos contribuir por medio del deporte con las mejores vivencias y una experiencia única y cercana a nuestros clientes.</p>
            <a href="#contacto" class="ld-btn ld-btn-primary">Saber Más</a>
        </div>
        <div class="ld-about-image">
            <img src="{IMG}/about-banner.webp" alt="Fábrica de uniformes Life Deportes" loading="lazy"/>
        </div>
    </div>
</section>

<section class="ld-process">
    <div class="container">
        <h2 class="ld-section-title">Proceso Fácil y Rápido</h2>
        <p class="ld-section-sub">En 4 simples pasos tendrás tus uniformes personalizados</p>
        <div class="ld-process-grid">
            <div class="ld-process-step">
                <div class="ld-process-img-wrap">
                    <img src="{IMG}/process-1.webp" alt="Cotiza ahora" loading="lazy"/>
                    <span class="ld-process-num">01</span>
                </div>
                <h3>Cotiza Ahora</h3>
                <p>Cuéntanos qué necesitas y te asesoramos</p>
            </div>
            <div class="ld-process-step">
                <div class="ld-process-img-wrap">
                    <img src="{IMG}/process-2.webp" alt="Diseña con nosotros" loading="lazy"/>
                    <span class="ld-process-num">02</span>
                </div>
                <h3>Diseña con Nosotros</h3>
                <p>Personalizamos cada detalle a tu gusto</p>
            </div>
            <div class="ld-process-step">
                <div class="ld-process-img-wrap">
                    <img src="{IMG}/process-3.webp" alt="Vive el proceso" loading="lazy"/>
                    <span class="ld-process-num">03</span>
                </div>
                <h3>Vive el Proceso</h3>
                <p>Acompañamos la fabricación de principio a fin</p>
            </div>
            <div class="ld-process-step">
                <div class="ld-process-img-wrap">
                    <img src="{IMG}/process-4.webp" alt="Disfruta tus prendas" loading="lazy"/>
                    <span class="ld-process-num">04</span>
                </div>
                <h3>Disfruta tus Prendas</h3>
                <p>Recibe uniformes de calidad premium</p>
            </div>
        </div>
    </div>
</section>

<section class="ld-testimonials">
    <div class="container">
        <h2 class="ld-section-title ld-testimonials-heading">Lo Que Dicen Nuestros Clientes</h2>
        <div class="ld-testimonial-grid" data-ld-testimonial-grid=""></div>
        <div class="ld-testimonial-dots" data-ld-testimonial-dots=""></div>
    </div>
</section>

<section class="ld-why-us">
    <div class="container">
        <div class="ld-why-stats">
            <div class="ld-why-stat">
                <strong data-target="20" data-prefix="+">+20</strong>
                <span>Años de<br/>Experiencia</span>
            </div>
            <div class="ld-why-stat">
                <strong data-target="100" data-suffix="%">100%</strong>
                <span>Satisfacción<br/>Garantizada</span>
            </div>
            <div class="ld-why-stat">
                <strong data-target="32">32</strong>
                <span>Departamentos<br/>con Entrega</span>
            </div>
            <div class="ld-why-stat">
                <strong data-target="200" data-prefix="+">+200</strong>
                <span>Equipos<br/>Uniformados</span>
            </div>
        </div>
    </div>
</section>

<section class="ld-work-ig" id="trabajo">
    <div class="container">
        <h2 class="ld-section-title">Nuestro Trabajo Habla por Nosotros</h2>
        <p class="ld-section-sub">Uniformes que se ven, se sienten y duran. Mira la calidad de cerca.</p>
        <div class="ld-ig-feed">
            <a t-att-href="request.website.social_instagram or 'https://www.instagram.com/lifedeportes/'" target="_blank" rel="noopener noreferrer" class="ld-ig-post"><img src="{IMG}/ig-1.webp" alt="Clientes Life Deportes — fútbol" loading="lazy" width="420" height="420"/></a>
            <a t-att-href="request.website.social_instagram or 'https://www.instagram.com/lifedeportes/'" target="_blank" rel="noopener noreferrer" class="ld-ig-post"><img src="{IMG}/ig-2.webp" alt="Equipos uniformados" loading="lazy" width="420" height="420"/></a>
            <a t-att-href="request.website.social_instagram or 'https://www.instagram.com/lifedeportes/'" target="_blank" rel="noopener noreferrer" class="ld-ig-post"><img src="{IMG}/ig-3.webp" alt="Sudaderas y uniformes" loading="lazy" width="420" height="420"/></a>
            <a t-att-href="request.website.social_instagram or 'https://www.instagram.com/lifedeportes/'" target="_blank" rel="noopener noreferrer" class="ld-ig-post"><img src="{IMG}/ig-4.webp" alt="Voleibol Life Deportes" loading="lazy" width="420" height="420"/></a>
            <a t-att-href="request.website.social_instagram or 'https://www.instagram.com/lifedeportes/'" target="_blank" rel="noopener noreferrer" class="ld-ig-post"><img src="{IMG}/ig-5.webp" alt="Baloncesto" loading="lazy" width="420" height="420"/></a>
            <a t-att-href="request.website.social_instagram or 'https://www.instagram.com/lifedeportes/'" target="_blank" rel="noopener noreferrer" class="ld-ig-post"><img src="{IMG}/ig-6.webp" alt="Fútbol sala" loading="lazy" width="420" height="420"/></a>
        </div>
        <p class="ld-ig-follow">
            <a t-att-href="request.website.social_instagram or 'https://www.instagram.com/lifedeportes/'" target="_blank" rel="noopener noreferrer" class="ld-btn ld-btn-outline-dark">Seguir en Instagram</a>
        </p>
    </div>
</section>

<section class="ld-faq" id="faq">
    <div class="container">
        <h2 class="ld-section-title">Preguntas Frecuentes</h2>
        <p class="ld-section-sub">Lo que más nos preguntan nuestros clientes sobre uniformes deportivos personalizados</p>
        <div class="ld-faq-list">
            <details class="ld-faq-item">
                <summary class="ld-faq-question">¿Fabrican uniformes personalizados?</summary>
                <div class="ld-faq-answer"><p>Sí, somos fábrica de uniformes personalizados en Colombia. Tú nos envías la imagen, logo o diseño que deseas y nosotros lo fabricamos 100% a tu medida, con el color, talla y estilo que necesites. Trabajamos diseños exclusivos para equipos deportivos, empresas, colegios y eventos.</p></div>
            </details>
            <details class="ld-faq-item">
                <summary class="ld-faq-question">¿Qué tela utilizan para los uniformes?</summary>
                <div class="ld-faq-answer"><p>Trabajamos con tela poliéster dry-fit de alta calidad, ideal para uniformes deportivos y empresariales. Esta tela ofrece control de sudoración, secado rápido, transpirabilidad y durabilidad. Aplicamos sublimación digital, una técnica que fija el diseño dentro de la fibra, garantizando colores vivos que no se despegan ni se decoloran con el lavado.</p></div>
            </details>
            <details class="ld-faq-item">
                <summary class="ld-faq-question">¿Fabrican uniformes deportivos?</summary>
                <div class="ld-faq-answer"><p>Sí, fabricamos uniformes deportivos personalizados para fútbol, voleibol, baloncesto, fútbol sala y otros deportes. También producimos sudaderas deportivas, conjuntos de entrenamiento y ropa deportiva por equipos, todo con diseño exclusivo y sublimación digital a full color.</p></div>
            </details>
            <details class="ld-faq-item">
                <summary class="ld-faq-question">¿Fabrican diseños exclusivos?</summary>
                <div class="ld-faq-answer"><p>Sí, todos nuestros uniformes son 100% personalizados. Diseñamos según tus necesidades: escudos, logos, nombres, números, patrocinadores y combinaciones de color. Si ya tienes un diseño, lo replicamos; si necesitas ayuda, nuestro equipo te asesora para crearlo desde cero.</p></div>
            </details>
            <details class="ld-faq-item">
                <summary class="ld-faq-question">¿Dónde están ubicados?</summary>
                <div class="ld-faq-answer"><p>Nuestra fábrica está ubicada en Bogotá, Colombia, en el barrio Los Álamos: Cl. 66a #98a-12, Bogotá, Cundinamarca. Atendemos pedidos de manera presencial y realizamos envíos a todas las ciudades de Colombia: Medellín, Cali, Barranquilla, Cartagena, Bucaramanga, Pereira y más.</p></div>
            </details>
            <details class="ld-faq-item">
                <summary class="ld-faq-question">¿Puedo realizar un pedido sin abono?</summary>
                <div class="ld-faq-answer"><p>El proceso requiere un abono del 50% del total al iniciar el pedido. Tú nos envías tallas, logos, nombres y números del diseño; nosotros te enviamos imágenes para tu aprobación. Una vez aprobadas, pasamos a confección. Cuando el uniforme está listo, te enviamos fotos del producto terminado y procedes con el pago del 50% restante. Realizamos envíos a toda Colombia (el costo del envío lo asume el cliente).</p></div>
            </details>
            <details class="ld-faq-item">
                <summary class="ld-faq-question">¿Cuál es el pedido mínimo de uniformes?</summary>
                <div class="ld-faq-answer"><p>Nuestro pedido mínimo es de 6 uniformes completos por diseño. Camisetas extra, banderas, medias y otras prendas van adicionales encima de esa base. Esto nos permite ofrecerte el mejor precio por unidad y garantizar la calidad de la sublimación. Para pedidos grandes (equipos, empresas, colegios) manejamos descuentos especiales por volumen. Contáctanos para una cotización personalizada según la cantidad que necesites.</p></div>
            </details>
            <details class="ld-faq-item">
                <summary class="ld-faq-question">¿Cuánto tiempo tarda la fabricación y entrega de los uniformes?</summary>
                <div class="ld-faq-answer"><p>El tiempo de fabricación es de 10 días hábiles desde la aprobación del diseño. Para envíos dentro de Bogotá, la entrega es de 1 a 2 días, y a nivel nacional de 2 a 5 días hábiles según la ciudad.</p></div>
            </details>
            <details class="ld-faq-item">
                <summary class="ld-faq-question">¿Cómo puedo cotizar mi uniforme personalizado?</summary>
                <div class="ld-faq-answer"><p>Cotizar es muy fácil. Escríbenos por WhatsApp o llámanos con la siguiente información: cantidad de uniformes, tallas, deporte o uso, y el diseño o referencia que tengas (foto, logo o idea). En menos de 24 horas te enviamos la cotización con precio, tiempos de entrega y opciones de diseño. La asesoría es totalmente gratuita.</p></div>
            </details>
            <details class="ld-faq-item">
                <summary class="ld-faq-question">¿Fabrican uniformes para hombres y mujeres?</summary>
                <div class="ld-faq-answer"><p>Sí, fabricamos uniformes personalizados para hombres, mujeres y niños. Manejamos cortes y tallas específicas para cada género, garantizando un calce cómodo y deportivo. Tenemos disponibles tallas desde XS hasta 3XL, y también producimos uniformes infantiles para escuelas de fútbol, voleibol, baloncesto y otros deportes. Cada prenda se confecciona con el patrón ideal según el cuerpo de quien la va a usar.</p></div>
            </details>
        </div>
    </div>
</section>

<section class="ld-contact" id="contacto">
    <div class="container ld-contact-wrap">
        <div class="ld-contact-stack">
            <div class="ld-contact-info">
                <h2>Información de Contacto</h2>
                <div class="ld-contact-cards">
                    <div class="ld-contact-card">
                        <i class="fa fa-phone"/>
                        <a href="tel:+573103362484">(310) 336 2484</a>
                    </div>
                    <div class="ld-contact-card">
                        <i class="fa fa-phone"/>
                        <a href="tel:+573213988464">(321) 398 8464</a>
                    </div>
                    <div class="ld-contact-card">
                        <i class="fa fa-envelope"/>
                        <a href="mailto:info@lifedeportes.com">info@lifedeportes.com</a>
                    </div>
                    <div class="ld-contact-card">
                        <i class="fa fa-map-marker"/>
                        <a href="https://maps.google.com/?cid=12304529363039725410" target="_blank" rel="noopener noreferrer">
                            Cl. 66a #98a 12, Bogotá,<br/>Cundinamarca, Colombia
                        </a>
                    </div>
                </div>
                <div class="ld-contact-social">
                    <a t-att-href="request.website.social_facebook or 'https://www.facebook.com/people/Life-Soluciones-Deportivas/100064176332051/'"
                       target="_blank" rel="noopener noreferrer" class="ld-share ld-share-fb" title="Facebook" aria-label="Facebook">
                       <i class="fa fa-facebook"/>
                    </a>
                    <a t-att-href="request.website.social_instagram or 'https://www.instagram.com/lifedeportes/'"
                       target="_blank" rel="noopener noreferrer" class="ld-share ld-share-ig" title="Instagram" aria-label="Instagram">
                       <i class="fa fa-instagram"/>
                    </a>
                    <a t-att-href="request.website.social_youtube or 'https://www.youtube.com/@lifedeportes'"
                       target="_blank" rel="noopener noreferrer" class="ld-share ld-share-yt" title="YouTube" aria-label="YouTube">
                       <i class="fa fa-youtube-play"/>
                    </a>
                    <a href="https://wa.me/573103362484"
                       target="_blank" rel="noopener noreferrer" class="ld-share ld-share-wa" title="WhatsApp" aria-label="WhatsApp">
                       <i class="fa fa-whatsapp"/>
                    </a>
                </div>
            </div>
            <div class="ld-contact-map-wide">
                <iframe src="https://maps.google.com/maps?cid=12304529363039725410&amp;output=embed"
                        loading="lazy" title="Ubicación Life Deportes"
                        referrerpolicy="no-referrer-when-downgrade" allowfullscreen="allowfullscreen"/>
            </div>
            <div class="ld-contact-form-card">
                <h2>¡Cotiza Ya!</h2>
                <p class="ld-form-subtitle">Tu uniforme ideal está a un mensaje de distancia. Cuéntanos qué necesitas.</p>
                <div id="ld-form-msg"/>
                <form id="ld-quote-form" action="/website/form/crm.lead" method="post" enctype="multipart/form-data">
                    <input type="hidden" name="csrf_token" t-att-value="request.csrf_token() if request else ''"/>
                    <div class="ld-form-row">
                        <div class="ld-form-field">
                            <label>Nombre completo *</label>
                            <input type="text" name="contact_name" placeholder="Tu nombre" required="required"/>
                        </div>
                        <div class="ld-form-field">
                            <label>Tipo de uniforme *</label>
                            <select id="ld-quote-tipo" required="required">
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
                    <div class="ld-form-row">
                        <div class="ld-form-field">
                            <label>WhatsApp / Teléfono *</label>
                            <input type="tel" name="phone" placeholder="310 000 0000" required="required"/>
                        </div>
                        <div class="ld-form-field">
                            <label>Correo electrónico</label>
                            <input type="email" name="email_from" placeholder="tu@correo.com"/>
                        </div>
                    </div>
                    <div class="ld-form-field">
                        <label>¿Qué necesitas?</label>
                        <textarea name="description" rows="4" placeholder="Ej: 15 uniformes de fútbol con número y nombre, tallas S, M y L..."/>
                    </div>
                    <button type="submit" class="ld-btn ld-btn-primary ld-btn-full">Solicitar Cotización Gratis</button>
                </form>
            </div>
        </div>
    </div>
</section>
"""
HTML = HTML.replace("{IMG}", IMG)

arch = (
    '<t t-name="website.home">\n'
    '    <t t-call="website.layout">\n'
    '        <div id="wrap" class="oe_structure ld-home">\n'
    '            <link rel="preconnect" href="https://fonts.googleapis.com"/>\n'
    '            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin=""/>\n'
    '            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&amp;family=DM+Sans:wght@400;500;700&amp;display=swap"/>\n'
    '            <style type="text/css">\n'
    '<![CDATA[\n' + css + '\n]]>\n'
    '            </style>\n'
    + HTML +
    '            <script type="text/javascript">\n'
    '<![CDATA[\n' + JS + '\n]]>\n'
    '            </script>\n'
    '        </div>\n'
    '    </t>\n'
    '</t>'
)

out = {"arch": arch}
with open("/tmp/ld_home_arch.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)

print("OK arch length:", len(arch))
print("Saved to /tmp/ld_home_arch.json")
