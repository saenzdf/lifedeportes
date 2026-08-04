# Odoo Website Production Backup - life-soluciones.odoo.com
**Date:** 2026-07-08
**Base URL:** https://life-soluciones.odoo.com
**Database:** life-soluciones

## Websites Configured

- **ID:** 2 | **Name:** lifedeportes.com | **Domain:** False
- **ID:** 1 | **Name:** Life Soluciones deportivas | **Domain:** False

## Pages Summary

| Page ID | Name | URL | Website | Published | View ID | Last Updated |
|---|---|---|---|---|---|---|
| 3 | Contact Us | `/contactus` | Global (All) | True | 3242 (Contact Us) | 2025-06-06 15:08:25 |
| 1 | Thanks (Contact us) | `/contactus-thank-you` | Global (All) | True | 3243 (Thanks (Contact us)) | 2025-11-08 22:45:50 |
| 5 | Task Submitted | `/your-task-has-been-submitted` | Global (All) | True | 4038 (Task Submitted) | 2025-11-08 22:46:36 |
| 2 | Home | `/` | Global (All) | True | 3241 (Home) | 2025-06-06 15:08:25 |
| 4 | Home | `/` | Life Soluciones deportivas | True | 3249 (Home) | 2025-06-06 15:08:25 |
| 10 | Galería de diseños | `/gallery` | lifedeportes.com | True | 5323 (Galería de diseños) | 2026-07-03 17:17:54 |
| 12 | Anonimato | `/anonimato` | lifedeportes.com | True | 5327 (Anonimato) | 2025-10-09 14:37:56 |
| 8 | Privacy-policy | `/privacy-policy` | lifedeportes.com | True | 5321 (Privacy-policy) | 2025-10-05 14:23:31 |
| 9 | About-us | `/about-us` | lifedeportes.com | True | 5322 (About-us) | 2025-10-05 14:23:31 |
| 7 | Condiciones de venta | `/terms-of-use` | lifedeportes.com | True | 5320 (Condiciones de venta) | 2026-05-21 18:53:36 |
| 11 | Tienda Life Deportes | `/` | lifedeportes.com | True | 5324 (Tienda Life Deportes) | 2026-07-03 15:47:51 |

## Detailed Page Configurations & QWeb Architecture

### Galería de diseños (/gallery)
- **Website:** lifedeportes.com
- **URL:** `/gallery`
- **View Name/ID:** Galería de diseños (ID: 5323)
- **View Key:** `website.galeria-de-disenos`
- **Type:** qweb
- **Last Updated:** 2026-07-03 17:17:54
- **Backup File:** [view_5323_galería_de_diseños.xml](./view_5323_galería_de_diseños.xml)

#### Architecture (QWeb/XML):

```xml
<t t-name="website.galeria-de-disenos">
<t t-call="website.layout">
            <div id="wrap" class="oe_structure ld-home ld-gallery-page" itemscope="itemscope" itemtype="https://schema.org/CollectionPage">
<style type="text/css">
@import url("https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&amp;family=DM+Sans:wght@400;500;700&amp;display=swap");
.ld-home{font-family:'DM Sans',system-ui,sans-serif;color:#1a1a2e;-webkit-font-smoothing:antialiased}
.ld-home .text-accent{color:#5B9BD5!important}
.ld-home .ld-hero {
  position:relative;isolation:isolate;background:linear-gradient(135deg,#051B36 0%,#0a3060 50%,#051B36 100%);
  min-height:560px;color:#fff;overflow:hidden;padding:80px 0 52px}
.ld-home.ld-gallery-page .ld-gallery-page-hero.ld-hero {
  overflow:hidden!important;min-height:clamp(420px,52vh,560px)!important;padding-bottom:clamp(40px,6vw,64px)!important}
.ld-home.ld-gallery-page .ld-gallery-page-hero.ld-hero &gt; .ld-gallery-hero-photo {
  position:absolute;inset:0;z-index:0;background-position:center;background-size:cover;background-repeat:no-repeat}
.ld-home.ld-gallery-page .ld-gallery-page-hero.ld-hero &gt; .ld-hero-overlay {
  z-index:1;background:linear-gradient(160deg,rgba(0,31,63,.88) 0%,rgba(5,27,54,.82) 45%,rgba(0,20,45,.92) 100%)!important}
.ld-home.ld-gallery-page .ld-gallery-page-hero.ld-hero &gt; .ld-gallery-hero-pattern {
  position:absolute;inset:0;z-index:2;pointer-events:none;opacity:.14;
  background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cpath fill='none' stroke='%23ffffff' stroke-width='0.35' d='M0 40c20-8 40 8 60 0s40-8 60 0M0 80c22 10 38-6 60 0s38 6 60 0M20 0c-6 22 6 38 0 60s-6 38 0 60M80 0c8 18-8 42 0 60s-8 42 0 60'/%3E%3C/svg%3E\");
  background-size:280px 280px}
.ld-home.ld-about-page .ld-about-page-hero.ld-hero {
  overflow:visible!important;min-height:clamp(460px,56vh,620px);padding-bottom:64px}
.ld-home .ld-hero &gt; .ld-hero-bg-video {
  position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none}
.ld-home .ld-hero &gt; .ld-hero-overlay {
  position:absolute;inset:0;z-index:1;background:linear-gradient(135deg,rgba(5,27,54,.88) 0%,rgba(15,56,95,.78) 50%,rgba(5,27,54,.92) 100%);
  pointer-events:none}
.ld-home .ld-hero .ld-hero-inner {
  position:relative;z-index:2;display:flex;align-items:center;gap:40px;flex-wrap:wrap;max-width:1200px;margin:0 auto;padding:0 24px}
.ld-home.ld-gallery-page .ld-gallery-page-hero .ld-hero-inner,
.ld-home.ld-about-page .ld-about-page-hero .ld-hero-inner{
  flex-direction:column;text-align:center;justify-content:center;align-items:center;min-height:min(44vh,440px);position:relative;z-index:3}
.ld-home.ld-about-page .ld-about-page-hero .ld-hero-sub{max-width:760px!important;margin:0 auto 28px!important}
.ld-home.ld-about-page .ld-hero-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-bottom:12px!important}
.ld-home.ld-gallery-page .ld-gallery-page-hero .ld-hero-sub{max-width:720px!important;margin:0 auto 0!important;opacity:.95!important;font-size:.96rem!important;color:rgba(255,255,255,.93)!important}
.ld-home.ld-gallery-page .ld-gallery-page-hero .ld-hero-title,
.ld-home .ld-gallery-page-hero .ld-hero-title{font-size:clamp(2.05rem,4.9vw,3.7rem)!important;font-weight:800!important;text-transform:uppercase!important;line-height:1.05!important;color:#fff!important}
.ld-home.ld-about-page .ld-about-page-hero .ld-hero-title{font-size:clamp(2rem,5.5vw,3.85rem)!important;font-weight:800!important;color:#fff!important}
.ld-home .ld-about-page-hero .ld-hero-badge{
  font-size:.78rem!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.15em!important;
  padding:6px 16px!important;border-radius:50px;background:rgba(255,255,255,.1)!important;border:1px solid rgba(255,255,255,.22)!important}
.ld-home .ld-gallery-filter-strip{background:#f8f9fa;border-top:1px solid rgba(5,27,54,.06);border-bottom:1px solid rgba(5,27,54,.06);
  padding:clamp(18px,3vw,26px) 0}
.ld-home .ld-gallery-filter-shell{background:transparent!important;border:none!important;border-radius:0!important;padding:0!important;
  box-shadow:none!important}
.ld-home .ld-gallery-filters{display:flex;flex-wrap:nowrap;justify-content:center;gap:12px;margin:0!important;
 overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px}
.ld-home .filter-btn{appearance:none;border:1px solid #dee2e6;background:#fff;color:#1a2a3d;font-weight:700;
  font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;padding:11px 20px;border-radius:999px;cursor:pointer;transition:.2s;
  box-shadow:0 2px 8px rgba(5,27,54,.06)}
.ld-home .filter-btn.active{border-color:#001f3f;background:#001f3f;color:#fff;
  box-shadow:0 4px 16px rgba(0,31,63,.28)}
.ld-home .filter-btn:hover:not(.active){border-color:rgba(0,31,63,.35);box-shadow:0 3px 12px rgba(5,27,54,.1)}
.ld-home .ld-gallery{padding:clamp(48px,7vw,88px) 0;background:#f8f9fa}
.ld-home .gallery-section-title{padding:clamp(28px,4vw,44px) 0 12px;max-width:900px}
.ld-home .gallery-section-title h2{font-family:'Barlow Condensed',sans-serif;font-size:clamp(1.95rem,4vw,2.65rem)!important;
  font-weight:800!important;text-transform:uppercase;letter-spacing:.035em;color:#051B36!important;line-height:1.12;margin:0 0 14px!important}
.ld-home .gallery-section-title h2::after{content:'';display:block;width:56px;height:3px;margin-top:14px;background:#0F385F;border-radius:2px}
.ld-home .gallery-section-title p{color:#5a6677;font-size:.98rem;margin:0;max-width:880px;line-height:1.6}
.ld-home .ld-gallery-thumb{background:#12151c;border-radius:18px;padding:12px;box-shadow:0 8px 26px rgba(5,27,54,.14)}
.ld-home .ld-gallery-thumb img{border-radius:12px;display:block;width:100%;height:auto;object-fit:contain}
.ld-home .ld-banner-cta{background:#051B36 url('https://lifedeportes.com/img/hero-futbol.webp') center/cover no-repeat;position:relative;min-height:280px;display:flex}
.ld-home .ld-banner-cta .ld-banner-overlay{background:rgba(5,27,54,.76);flex:1;display:flex;align-items:center;padding:48px 0}
.ld-home .ld-banner-inner{text-align:center;margin:0 auto;color:#fff}
.ld-home .ld-banner-label{font-size:.75rem;text-transform:uppercase;letter-spacing:.2em;opacity:.75;display:block;margin-bottom:8px}
.ld-home .ld-banner-inner h2{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;font-size:clamp(1.5rem,3.5vw,2.35rem)}
.ld-home .ld-gallery-cta-title{color:#fff!important;text-align:center;text-transform:none!important;font-weight:800!important;margin-bottom:.5rem!important}
.ld-home .ld-gallery-cta-phone{text-align:center;margin-bottom:28px!important}
.ld-home .ld-gallery-cta-tel{color:rgba(255,255,255,.94)!important;font-weight:700;font-size:1.05rem;text-decoration:none!important;display:inline-flex;gap:8px;align-items:center}
.ld-home .ld-gallery-cta-tel:hover{color:#fff!important}
.ld-home .ld-gallery-cta-buttons{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;margin-top:8px}
.ld-home .btn.btn-ld-primary{background:#0F385F!important;color:#fff!important;border:none!important;padding:.85rem 1.6rem!important;
  border-radius:999px!important;text-transform:uppercase!important;font-weight:700!important;letter-spacing:.04em!important}
.ld-home .btn.btn-ld-primary:hover{background:#051B36!important;color:#fff!important}
.ld-home .btn.btn-ld-outline{background:transparent!important;color:#fff!important;border:2px solid rgba(255,255,255,.65)!important;
  padding:.75rem 1.35rem!important;border-radius:999px!important;text-transform:uppercase!important;font-weight:700!important;letter-spacing:.04em!important}
.ld-home .btn.btn-ld-outline:hover{background:#fff!important;color:#0F385F!important;border-color:#fff!important}
.ld-home .btn.btn-ld-white{background:#fff!important;color:#0F385F!important;border:none!important;padding:.85rem 1.75rem!important;
  border-radius:999px!important;text-transform:uppercase!important;font-weight:700!important;letter-spacing:.04em!important}
.ld-home .btn.btn-ld-white:hover{background:#051B36!important;color:#fff!important}
.ld-home .ld-btn{padding:14px 28px!important;border-radius:10px!important;font-weight:700!important;text-decoration:none!important;
  display:inline-block!important;text-align:center}
.ld-home .ld-btn-white{background:#fff!important;color:#0F385F!important}
.ld-home .ld-btn-outline-light{background:transparent!important;color:#fff!important;border:2px solid rgba(255,255,255,.58)!important;
  border-radius:50px!important}
.ld-home .ld-about{padding:80px 0;background:#f7f8fa}
.ld-home .ld-about-inner{display:flex;align-items:center;gap:60px;max-width:1200px;margin:0 auto;padding:0 24px;flex-wrap:wrap}
@media(max-width:1024px){.ld-home .ld-about-inner{flex-direction:column}}
.ld-home .ld-about-content{flex:1;min-width:280px}
.ld-home .ld-about-content h2{font-family:'Barlow Condensed',sans-serif;font-size:2.35rem!important;font-weight:700!important;
  text-transform:uppercase;color:#051B36!important;margin-bottom:16px!important}
.ld-home .ld-section-label{font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#5B9BD5!important;margin-bottom:8px;display:inline-block}
.ld-home .ld-about-content p{color:#555;margin-bottom:14px!important;font-size:.95rem;line-height:1.65}
.ld-home .ld-about-image img{width:100%;border-radius:12px;display:block}
.ld-home .ld-process{padding:100px 0;background:#fff}
.ld-home .ld-section-title{font-family:'Barlow Condensed',sans-serif;font-size:clamp(2rem,5vw,3.05rem)!important;font-weight:700!important;
  text-transform:uppercase;text-align:center;margin-bottom:8px;color:#051B36!important}
.ld-home .ld-section-sub{text-align:center;color:#5a6677;margin-bottom:40px;margin-left:auto;margin-right:auto;max-width:520px;font-size:1rem}
.ld-home .ld-process-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:32px;max-width:1060px;margin:0 auto;padding:0 24px}
@media(max-width:1024px){.ld-home .ld-process-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:576px){.ld-home .ld-process-grid{grid-template-columns:1fr}}
.ld-home .ld-process-step{text-align:center}
.ld-home .ld-process-img-wrap{position:relative;width:200px;height:200px;margin:0 auto 20px;border-radius:18px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.08)}
.ld-home .ld-process-img-wrap img{width:100%;height:100%;object-fit:cover;display:block}
.ld-home .ld-process-num{position:absolute;bottom:10px;left:10px;font-family:'Barlow Condensed',sans-serif;font-weight:800;color:#fff;
  font-size:1.75rem;text-shadow:0 2px 8px rgba(0,0,0,.55)}
.ld-home .ld-process-step h3{font-family:'Barlow Condensed',sans-serif;font-size:1.2rem;font-weight:700;text-transform:uppercase;color:#051B36!important}
.ld-home .ld-process-step p{font-size:.88rem;color:#888;max-width:220px;margin:0 auto;line-height:1.55}
.ld-home .ld-why-us{padding:72px 0;background:linear-gradient(135deg,#0F385F 0%,#051B36 100%);color:#fff}
.ld-home .ld-why-stats{display:flex;flex-wrap:wrap;justify-content:center;gap:32px;text-align:center}
.ld-home .ld-why-stat strong{display:block;font-family:'Barlow Condensed',sans-serif;font-size:clamp(2.2rem,4vw,3.2rem);font-weight:800;line-height:1;color:#fff}
.ld-home .ld-why-us span{font-size:.85rem;opacity:.9;text-transform:uppercase;letter-spacing:.06em;display:block;margin-top:6px;line-height:1.35;color:#fff!important}
.ld-home .lightbox.ld-lightbox{position:fixed;inset:0;z-index:100050;display:none;align-items:center;justify-content:center;
  background:rgba(5,27,54,.92)}
.ld-home .lightbox.ld-lightbox.open{display:flex!important}
.ld-home #lightboxClose{position:absolute;top:16px;right:20px;width:44px;height:44px;border:none;border-radius:50%;
  background:rgba(255,255,255,.12);color:#fff;font-size:1.65rem;line-height:1;cursor:pointer}
.ld-home #lightboxClose:hover{background:rgba(255,255,255,.22);}
.ld-home .lightbox-nav.lightbox-prev{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:46px;height:46px;
  border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:1.35rem;cursor:pointer}
.ld-home .lightbox-nav.lightbox-next{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;
  border:none;background:rgba(255,255,255,.15);color:#fff;font-size:1.35rem;cursor:pointer}
.ld-home .lightbox-figure{margin:0;max-width:min(94vw,1100px)}
.ld-home #lightboxImg{max-width:100%;max-height:82vh;border-radius:6px;transition:opacity .12s ease}
@keyframes ld-gallery-filterFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
</style>

                <!-- Mismo patrón que homepage.xml (.ld-hero + vídeo/poster + overlay) para que Odoo SaaS cargue una sola hoja visual -->
                <!-- Hero alineado a lifedeportes.com: foto + overlay azul + trama sutil; filtros en franja gris bajo el hero -->
                <section class="ld-hero oe_structure ld-gallery-page-hero">
                    <div class="ld-gallery-hero-photo" role="presentation" style="background-image: url('https://lifedeportes.com/img/hero-futbol.webp');"/>
                    <div class="ld-hero-overlay"/>
                    <div class="ld-gallery-hero-pattern" aria-hidden="true"/>
                    <div class="container ld-hero-inner">
                        <div class="ld-hero-content">
                            <span class="ld-hero-badge">Fabricantes de uniformes deportivos</span>
                            <h1 class="ld-hero-title">Diseños de Uniformes de Fútbol, Voleibol y Baloncesto Personalizados</h1>
                            <p class="ld-hero-sub">En Life Deportes diseñamos y fabricamos uniformes deportivos personalizados con sublimación digital de alta calidad. Esta galería muestra algunos de los miles de diseños que hemos creado para equipos de fútbol, voleibol, baloncesto y sudaderas en toda Colombia. Cada diseño es 100% único y se confecciona con tela poliéster dry-fit que garantiza durabilidad, transpirabilidad y colores vivos que no se desvanecen con el lavado.</p>
                        </div>
                    </div>
                </section>
                <section class="ld-gallery-filter-strip oe_structure">
                    <div class="container">
                        <div class="ld-gallery-filter-shell">
  <div class="gallery-filters ld-gallery-filters" role="tablist">
    <button type="button" class="filter-btn active" data-filter="all" aria-selected="true">Todo</button>
    <button type="button" class="filter-btn" data-filter="futbol" aria-selected="false">Fútbol</button>
    <button type="button" class="filter-btn" data-filter="baloncesto" aria-selected="false">Baloncesto</button>
    <button type="button" class="filter-btn" data-filter="voleibol" aria-selected="false">Voleibol</button>
    <button type="button" class="filter-btn" data-filter="sudaderas" aria-selected="false">Sudaderas</button>
  </div>
</div>
<script type="text/javascript">
document.addEventListener('DOMContentLoaded', function(){
  var root=document.querySelector('.ld-gallery-page.ld-home');
  if(!root)return;
  function filt(cat){root.querySelectorAll('.ld-gallery-wall').forEach(function(w){
   var wc=w.getAttribute('data-wall-cat')||w.dataset.wallCat;var ok=(cat==='all'||wc===cat);
   w.style.display=ok?'':'none';w.style.animation=ok?'ld-gallery-filterFadeIn 0.38s ease both':'';
  });root.querySelectorAll('.gallery-section-title').forEach(function(s){var wc=s.dataset.cat;
   var ok=(cat==='all'||wc===cat);s.style.display=ok?'':'none';});}
  var fb=root.querySelectorAll('.filter-btn'), bar=root.querySelector('.gallery-filters');
  fb.forEach(function(b){b.addEventListener('click',function(){fb.forEach(function(x){x.classList.remove('active');});
   b.classList.add('active');if(bar){var ox=b.offsetLeft-bar.offsetLeft-bar.clientWidth/2+b.offsetWidth/2;
   bar.scrollTo({left:ox,behavior:'smooth'});}filt(b.getAttribute('data-filter')||'all');});});
  var h=(location.hash||'').replace('#','');
  if(['futbol','voleibol','baloncesto','sudaderas'].indexOf(h)&gt;=0){
   var tb=root.querySelector('.filter-btn[data-filter="'+h+'"]');if(tb)tb.click();}
  var lb=root.querySelector('#lightbox'),img=root.querySelector('#lightboxImg'),x=root.querySelector('#lightboxClose'),
   pr=root.querySelector('#lightboxPrev'),nx=root.querySelector('#lightboxNext');
  if(!lb||!img||!x)return;
  function vis(im){var w=im.closest('.ld-gallery-wall');if(!w)return true;return w.style.display!=='none';}
  function list(){return[].filter.call(root.querySelectorAll('.ld-gallery-wall .gallery-item img'),vis);}
  var idx=0;
  function open(im){var a=list();idx=Math.max(0,a.indexOf(im));img.src=im.src;img.alt=im.alt||'';lb.classList.add('open');
   document.body.style.overflow='hidden';}
  function close(){lb.classList.remove('open');document.body.style.overflow='';window.setTimeout(function(){img.src='';},280);}
  function hop(d){var a=list();if(!a.length)return;idx=(idx+d+a.length)%a.length;img.style.opacity='0';window.setTimeout(function(){
   img.src=a[idx].src;img.alt=a[idx].alt||'';img.style.opacity='1';},115);}
  img.style.transition='opacity 0.12s ease';
  root.querySelectorAll('.gallery-item').forEach(function(el){
   el.style.cursor='zoom-in';el.addEventListener('click',function(){var ig=el.querySelector('img');if(ig&amp;&amp;vis(ig))open(ig);});});
  x.addEventListener('click',close);
  if(pr)pr.addEventListener('click',function(e){e.stopPropagation();hop(-1);});
  if(nx)nx.addEventListener('click',function(e){e.stopPropagation();hop(1);});
  document.addEventListener('keydown',function(e){if(!lb.classList.contains('open'))return;if(e.key==='Escape')close();
   if(e.key==='ArrowLeft')hop(-1);if(e.key==='ArrowRight')hop(1);});
  lb.addEventListener('click',function(e){if(e.target===lb)close();});
});
</script>
<div class="ld-lightbox lightbox" id="lightbox" aria-modal="true" role="dialog" aria-label="Ampliación de imagen">
  <button type="button" class="lightbox-close" id="lightboxClose" aria-label="Cerrar">×</button>
  <button type="button" class="lightbox-nav lightbox-prev" id="lightboxPrev" aria-label="Imagen anterior">‹</button>
  <div class="lightbox-figure">
    <img src="" alt="" id="lightboxImg"/>
  </div>
  <button type="button" class="lightbox-nav lightbox-next" id="lightboxNext" aria-label="Imagen siguiente">›</button>
</div>
                    </div>
                </section>
                <section class="ld-gallery oe_structure">
                    <div class="container">

                        <div id="futbol" class="gallery-section-title s_title oe_structure" data-cat="futbol">
            <h2>Galería de Uniformes de Fútbol — Trabajos Reales</h2>
            <p>Equipos de fútbol en Colombia con uniformes personalizados fabricados por Life Deportes. Fotos tomadas de publicaciones oficiales en Facebook.</p>
        </div>
        <section class="s_image_gallery ld-gallery-wall o_spc-small pt24 pb56" data-wall-cat="futbol" style="overflow: hidden;">
            <div class="container px-0 px-lg-1">
                <div class="row s_nb_column_fixed g-3 g-lg-4 mx-0 mx-lg-n1">
        <div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="futbol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/28994" alt="Equipo de fútbol con uniformes personalizados Life Deportes — publicación Facebook 1105549571594244" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="futbol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/28995" alt="Equipo de fútbol con uniformes personalizados Life Deportes — publicación Facebook 1036577555158113" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="futbol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/28996" alt="Equipo de fútbol con uniformes personalizados Life Deportes — publicación Facebook 1036577548491447" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="futbol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/28997" alt="Equipo de fútbol con uniformes personalizados Life Deportes — publicación Facebook 1077999401015928" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="futbol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/28998" alt="Equipo de fútbol con uniformes personalizados Life Deportes — publicación Facebook 1196147692534431" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="futbol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/28999" alt="Equipo de fútbol con uniformes personalizados Life Deportes — publicación Facebook 1218381036977763" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="futbol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29000" alt="Equipo de fútbol con uniformes personalizados Life Deportes — publicación Facebook 1045773040905231" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="futbol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29001" alt="Equipo de fútbol con uniformes personalizados Life Deportes — publicación Facebook 1039542524861616" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="futbol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29002" alt="Equipo de fútbol con uniformes personalizados Life Deportes — publicación Facebook 1141895694626298" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="futbol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29003" alt="Equipo de fútbol con uniformes personalizados Life Deportes — publicación Facebook 1368728425276356" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="futbol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29004" alt="Equipo de fútbol con uniformes personalizados Life Deportes — publicación Facebook 1298852452263954" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="futbol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29005" alt="Equipo de fútbol con uniformes personalizados Life Deportes — publicación Facebook 1130801062402428" loading="lazy" data-name="Image"/>
    </div>
</div>
                </div>
            </div>
        </section>
                        <div id="voleibol" class="gallery-section-title s_title oe_structure" data-cat="voleibol">
            <h2>Galería de Uniformes de Voleibol — Trabajos Reales</h2>
            <p>Equipos de voleibol femenino y masculino con diseños exclusivos en sublimación digital.</p>
        </div>
        <section class="s_image_gallery ld-gallery-wall o_spc-small pt24 pb56" data-wall-cat="voleibol" style="overflow: hidden;">
            <div class="container px-0 px-lg-1">
                <div class="row s_nb_column_fixed g-3 g-lg-4 mx-0 mx-lg-n1">
        <div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="voleibol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29006" alt="Equipo de voleibol con uniformes personalizados Life Deportes — publicación Facebook 1346056374210228" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="voleibol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29007" alt="Equipo de voleibol con uniformes personalizados Life Deportes — publicación Facebook 1049658213850047" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="voleibol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29008" alt="Equipo de voleibol con uniformes personalizados Life Deportes — publicación Facebook 1346056367543562" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="voleibol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29009" alt="Equipo de voleibol con uniformes personalizados Life Deportes — publicación Facebook 1374476374701561" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="voleibol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29010" alt="Equipo de voleibol con uniformes personalizados Life Deportes — publicación Facebook 1346056394210226" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="voleibol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29011" alt="Equipo de voleibol con uniformes personalizados Life Deportes — publicación Facebook 1374476384701560" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="voleibol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29012" alt="Equipo de voleibol con uniformes personalizados Life Deportes — publicación Facebook 1374476364701562" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="voleibol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29013" alt="Equipo de voleibol con uniformes personalizados Life Deportes — publicación Facebook 1346056380876894" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="voleibol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29014" alt="Equipo de voleibol con uniformes personalizados Life Deportes — publicación Facebook 1346056387543560" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="voleibol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29015" alt="Equipo de voleibol con uniformes personalizados Life Deportes — publicación Facebook 1145671494248718" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="voleibol">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29016" alt="Equipo de voleibol con uniformes personalizados Life Deportes — publicación Facebook 1145671477582053" loading="lazy" data-name="Image"/>
    </div>
</div>
                </div>
            </div>
        </section>
                        <div id="baloncesto" class="gallery-section-title s_title oe_structure" data-cat="baloncesto">
            <h2>Galería de Uniformes de Baloncesto — Trabajos Reales</h2>
            <p>Uniformes de baloncesto personalizados en cancha y torneos locales.</p>
        </div>
        <section class="s_image_gallery ld-gallery-wall o_spc-small pt24 pb56" data-wall-cat="baloncesto" style="overflow: hidden;">
            <div class="container px-0 px-lg-1">
                <div class="row s_nb_column_fixed g-3 g-lg-4 mx-0 mx-lg-n1">
        <div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="baloncesto">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29017" alt="Equipo de baloncesto con uniformes personalizados Life Deportes — publicación Facebook 1105549584927576" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="baloncesto">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29018" alt="Equipo de baloncesto con uniformes personalizados Life Deportes — publicación Facebook 1036577561824779" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="baloncesto">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29019" alt="Equipo de baloncesto con uniformes personalizados Life Deportes — publicación Facebook 1036577535158115" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="baloncesto">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29020" alt="Equipo de baloncesto con uniformes personalizados Life Deportes — publicación Facebook 1036577541824781" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="baloncesto">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29021" alt="Equipo de baloncesto con uniformes personalizados Life Deportes — publicación Facebook 1038805608268641" loading="lazy" data-name="Image"/>
    </div>
</div>
                </div>
            </div>
        </section>
                        <div id="sudaderas" class="gallery-section-title s_title oe_structure" data-cat="sudaderas">
            <h2>Galería de Sudaderas y Prendas — Trabajos Reales</h2>
            <p>Sudaderas, chaquetas y conjuntos deportivos personalizados para equipos y clubes.</p>
        </div>
        <section class="s_image_gallery ld-gallery-wall o_spc-small pt24 pb56" data-wall-cat="sudaderas" style="overflow: hidden;">
            <div class="container px-0 px-lg-1">
                <div class="row s_nb_column_fixed g-3 g-lg-4 mx-0 mx-lg-n1">
        <div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="sudaderas">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29022" alt="Sudaderas y ropa deportiva personalizada Life Deportes — publicación Facebook 1045773034238565" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="sudaderas">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29023" alt="Sudaderas y ropa deportiva personalizada Life Deportes — publicación Facebook 1191910396291494" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="sudaderas">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29024" alt="Sudaderas y ropa deportiva personalizada Life Deportes — publicación Facebook 1051232430359292" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="sudaderas">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29025" alt="Sudaderas y ropa deportiva personalizada Life Deportes — publicación Facebook 1039542504861618" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="sudaderas">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29026" alt="Sudaderas y ropa deportiva personalizada Life Deportes — publicación Facebook 1191910389624828" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="sudaderas">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29027" alt="Sudaderas y ropa deportiva personalizada Life Deportes — publicación Facebook 1051231460359389" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="sudaderas">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29028" alt="Sudaderas y ropa deportiva personalizada Life Deportes — publicación Facebook 1105549578260910" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="sudaderas">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29029" alt="Sudaderas y ropa deportiva personalizada Life Deportes — publicación Facebook 1050619607087241" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="sudaderas">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29030" alt="Sudaderas y ropa deportiva personalizada Life Deportes — publicación Facebook 1374476378034894" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="sudaderas">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29031" alt="Sudaderas y ropa deportiva personalizada Life Deportes — publicación Facebook 1115366830612518" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="sudaderas">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29032" alt="Sudaderas y ropa deportiva personalizada Life Deportes — publicación Facebook 1199473918868475" loading="lazy" data-name="Image"/>
    </div>
</div>
<div class="col-6 col-md-4 col-lg-3 gallery-item o_snippet_not_selectable" data-cat="sudaderas">
    <div class="ld-gallery-thumb">
        <img class="img img-fluid rounded w-100" src="https://life-soluciones.odoo.com/web/content/29033" alt="Sudaderas y ropa deportiva personalizada Life Deportes — publicación Facebook 1199473928868474" loading="lazy" data-name="Image"/>
    </div>
</div>
                </div>
            </div>
        </section>
                    </div>
                </section>
                <section class="ld-banner-cta ld-gallery-cta-banner ld-gallery-main-banner">
                    <div class="ld-banner-overlay">
                        <div class="container ld-banner-inner ld-gallery-cta-inner">
                            <h2 class="ld-gallery-cta-title">¿Te Gustó lo que Viste? Cotiza tu Diseño</h2>
                            <p class="ld-gallery-cta-phone">
                                <a href="tel:+573103362484" class="ld-gallery-cta-tel"><i class="fa fa-phone"/> Llámenos (310) 336 2484</a>
                            </p>
                            <div class="ld-gallery-cta-buttons">
                                <a href="/#contacto" class="ld-btn ld-btn-white">Enviar solicitud</a>
                                <a href="https://wa.me/573103362484?text=Hola%2C%20quiero%20cotizar%20uniformes%20de%20" class="ld-btn ld-btn-outline-light" target="_blank" rel="noopener">WhatsApp</a>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </t>
</t>
```
---

### Anonimato (/anonimato)
- **Website:** lifedeportes.com
- **URL:** `/anonimato`
- **View Name/ID:** Anonimato (ID: 5327)
- **View Key:** `website.anonimato`
- **Type:** qweb
- **Last Updated:** 2025-10-09 14:36:58
- **Backup File:** [view_5327_anonimato.xml](./view_5327_anonimato.xml)

#### Architecture (QWeb/XML):

```xml
<t t-name="website.anonimato">
    <t t-call="website.layout">
        <div id="wrap" class="oe_structure oe_empty">
    <section class="s_text_block pt40 pb40 o_colored_level" data-snippet="s_text_block">
        <div class="s_allow_columns container"><h2>Instrucciones para la Eliminación de Datos</h2></div>
    </section>
    <section class="s_text_block o_colored_level pb0 pt16" data-snippet="s_text_block">
        <div class="s_allow_columns o_container_small">
            <p>Para solicitar la eliminación o anonimización de sus datos, por favor, contacte a nuestro responsable de privacidad en privacidad@lifedeportes.com. Verificaremos su identidad y procederemos según nuestras políticas</p><p><span class="fa fa-envelope-o fa-3x" style="width: 25% !important;"/>privacidad@lifedeportes.com</p><p><br/></p></div>
    </section>
    
    
</div>
    </t>
</t>
```
---

### Privacy-policy (/privacy-policy)
- **Website:** lifedeportes.com
- **URL:** `/privacy-policy`
- **View Name/ID:** Privacy-policy (ID: 5321)
- **View Key:** `website.privacy-policy`
- **Type:** qweb
- **Last Updated:** 2025-10-05 14:23:31
- **Backup File:** [view_5321_privacy-policy.xml](./view_5321_privacy-policy.xml)

#### Architecture (QWeb/XML):

```xml
<t t-name="website.privacy-policy">
    <t t-call="website.layout">
        <div id="wrap" class="oe_structure"><section class="s_text_block pt40 pb40 o_colored_level o_cc o_cc1" data-snippet="s_text_block" data-name="Text" ws-snippet="s_text_block_six_txt" data-ws-version="2.1.0">
        
        <div class="container s_allow_columns">
            
            <p>Who we are</p>
            
            <p>Suggested text: Our website address is: https://lifedeportes.com.</p>
            <p>Comments</p>
            <p>Suggested text: When visitors leave comments on the site we collect the data shown in the comments form, and also the visitor’s IP address and browser user agent string to help spam detection.</p>
            <p>An anonymized string created from your email address (also called a hash) may be provided to the Gravatar service to see if you are using it. The Gravatar service privacy policy is available here: https://automattic.com/privacy/. After approval of your comment, your profile picture is visible to the public in the context of your comment.</p>
            <p>Media</p>
            <p>Suggested text: If you upload images to the website, you should avoid uploading images with embedded location data (EXIF GPS) included. Visitors to the website can download and extract any location data from images on the website.</p>
            <p>POLITICA DE PRIVACIDAD</p>
        </div>
    </section><section class="s_text_block pt40 pb40 o_colored_level o_cc o_cc1" data-snippet="s_text_block" data-name="Text" ws-snippet="s_text_block_five_txt" data-ws-version="2.1.0">
        
        <div class="container s_allow_columns">
            
            <p>Cookies</p>
            
            <p>Suggested text: If you leave a comment on our site you may opt-in to saving your name, email address and website in cookies. These are for your convenience so that you do not have to fill in your details again when you leave another comment. These cookies will last for one year.</p>
            <p>If you visit our login page, we will set a temporary cookie to determine if your browser accepts cookies. This cookie contains no personal data and is discarded when you close your browser.</p>
            <p>When you log in, we will also set up several cookies to save your login information and your screen display choices. Login cookies last for two days, and screen options cookies last for a year. If you select “Remember Me”, your login will persist for two weeks. If you log out of your account, the login cookies will be removed.</p>
            <p>If you edit or publish an article, an additional cookie will be saved in your browser. This cookie includes no personal data and simply indicates the post ID of the article you just edited. It expires after 1 day.</p>
            <p>Embedded content from other websites</p>
            <p>Suggested text: Articles on this site may include embedded content (e.g. videos, images, articles, etc.). Embedded content from other websites behaves in the exact same way as if the visitor has visited the other website.</p>
        </div>
    </section><section class="s_text_block pt40 pb40 o_colored_level o_cc o_cc1" data-snippet="s_text_block" data-name="Text" ws-snippet="s_text_block_eight_txt" data-ws-version="2.1.0">
        
        <div class="container s_allow_columns">
            
            <p>These websites may collect data about you, use cookies, embed additional third-party tracking, and monitor your interaction with that embedded content, including tracking your interaction with the embedded content if you have an account and are logged in to that website.</p>
            
            <p>Who we share your data with</p>
            <p>Suggested text: If you request a password reset, your IP address will be included in the reset email.</p>
            <p>How long we retain your data</p>
            <p>Suggested text: If you leave a comment, the comment and its metadata are retained indefinitely. This is so we can recognize and approve any follow-up comments automatically instead of holding them in a moderation queue.</p>
            <p>For users that register on our website (if any), we also store the personal information they provide in their user profile. All users can see, edit, or delete their personal information at any time (except they cannot change their username). Website administrators can also see and edit that information.</p>
            <p>What rights you have over your data</p>
            <p>Suggested text: If you have an account on this site, or have left comments, you can request to receive an exported file of the personal data we hold about you, including any data you have provided to us. You can also request that we erase any personal data we hold about you. This does not include any data we are obliged to keep for administrative, legal, or security purposes.</p>
            <p>Where your data is sent</p>
            <p>Suggested text: Visitor comments may be checked through an automated spam detection service.</p>
        </div>
    </section></div>
    </t>
</t>
```
---

### About-us (/about-us)
- **Website:** lifedeportes.com
- **URL:** `/about-us`
- **View Name/ID:** About-us (ID: 5322)
- **View Key:** `website.about-us`
- **Type:** qweb
- **Last Updated:** 2026-05-01 13:57:35
- **Backup File:** [view_5322_about-us.xml](./view_5322_about-us.xml)

#### Architecture (QWeb/XML):

```xml
<t t-name="website.about-us">
<t t-call="website.layout">
            <div id="wrap" class="oe_structure ld-home ld-about-page">
<style type="text/css">
@import url("https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&amp;family=DM+Sans:wght@400;500;700&amp;display=swap");
.ld-home{font-family:'DM Sans',system-ui,sans-serif;color:#1a1a2e;-webkit-font-smoothing:antialiased}
.ld-home .text-accent{color:#5B9BD5!important}
.ld-home .ld-hero {
  position:relative;isolation:isolate;background:linear-gradient(135deg,#051B36 0%,#0a3060 50%,#051B36 100%);
  min-height:560px;color:#fff;overflow:hidden;padding:80px 0 52px}
.ld-home.ld-gallery-page .ld-gallery-page-hero.ld-hero {
  overflow:hidden!important;min-height:clamp(420px,52vh,560px)!important;padding-bottom:clamp(40px,6vw,64px)!important}
.ld-home.ld-gallery-page .ld-gallery-page-hero.ld-hero &gt; .ld-gallery-hero-photo {
  position:absolute;inset:0;z-index:0;background-position:center;background-size:cover;background-repeat:no-repeat}
.ld-home.ld-gallery-page .ld-gallery-page-hero.ld-hero &gt; .ld-hero-overlay {
  z-index:1;background:linear-gradient(160deg,rgba(0,31,63,.88) 0%,rgba(5,27,54,.82) 45%,rgba(0,20,45,.92) 100%)!important}
.ld-home.ld-gallery-page .ld-gallery-page-hero.ld-hero &gt; .ld-gallery-hero-pattern {
  position:absolute;inset:0;z-index:2;pointer-events:none;opacity:.14;
  background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cpath fill='none' stroke='%23ffffff' stroke-width='0.35' d='M0 40c20-8 40 8 60 0s40-8 60 0M0 80c22 10 38-6 60 0s38 6 60 0M20 0c-6 22 6 38 0 60s-6 38 0 60M80 0c8 18-8 42 0 60s-8 42 0 60'/%3E%3C/svg%3E\");
  background-size:280px 280px}
.ld-home.ld-about-page .ld-about-page-hero.ld-hero {
  overflow:visible!important;min-height:clamp(460px,56vh,620px);padding-bottom:64px}
.ld-home .ld-hero &gt; .ld-hero-bg-video {
  position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none}
.ld-home .ld-hero &gt; .ld-hero-overlay {
  position:absolute;inset:0;z-index:1;background:linear-gradient(135deg,rgba(5,27,54,.88) 0%,rgba(15,56,95,.78) 50%,rgba(5,27,54,.92) 100%);
  pointer-events:none}
.ld-home .ld-hero .ld-hero-inner {
  position:relative;z-index:2;display:flex;align-items:center;gap:40px;flex-wrap:wrap;max-width:1200px;margin:0 auto;padding:0 24px}
.ld-home.ld-gallery-page .ld-gallery-page-hero .ld-hero-inner,
.ld-home.ld-about-page .ld-about-page-hero .ld-hero-inner{
  flex-direction:column;text-align:center;justify-content:center;align-items:center;min-height:min(44vh,440px);position:relative;z-index:3}
.ld-home.ld-about-page .ld-about-page-hero .ld-hero-sub{max-width:760px!important;margin:0 auto 28px!important}
.ld-home.ld-about-page .ld-hero-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-bottom:12px!important}
.ld-home.ld-gallery-page .ld-gallery-page-hero .ld-hero-sub{max-width:720px!important;margin:0 auto 0!important;opacity:.95!important}
.ld-home.ld-gallery-page .ld-gallery-page-hero .ld-hero-title,
.ld-home .ld-gallery-page-hero .ld-hero-title{font-size:clamp(1.8rem,5vw,3.35rem)!important;font-weight:800!important;text-transform:uppercase!important;line-height:1.05!important;color:#fff!important}
.ld-home.ld-about-page .ld-about-page-hero .ld-hero-title{font-size:clamp(2rem,5.5vw,3.85rem)!important;font-weight:800!important;color:#fff!important}
.ld-home .ld-about-page-hero .ld-hero-badge{
  font-size:.78rem!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.15em!important;
  padding:6px 16px!important;border-radius:50px;background:rgba(255,255,255,.1)!important;border:1px solid rgba(255,255,255,.22)!important}
.ld-home .ld-gallery-filter-strip{background:#f8f9fa;border-top:1px solid rgba(5,27,54,.06);border-bottom:1px solid rgba(5,27,54,.06);
  padding:clamp(18px,3vw,26px) 0}
.ld-home .ld-gallery-filter-shell{background:transparent!important;border:none!important;border-radius:0!important;padding:0!important;
  box-shadow:none!important}
.ld-home .ld-gallery-filters{display:flex;flex-wrap:nowrap;justify-content:center;gap:12px;margin:0!important;
 overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px}
.ld-home .filter-btn{appearance:none;border:1px solid #dee2e6;background:#fff;color:#1a2a3d;font-weight:700;
  font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;padding:11px 20px;border-radius:999px;cursor:pointer;transition:.2s;
  box-shadow:0 2px 8px rgba(5,27,54,.06)}
.ld-home .filter-btn.active{border-color:#001f3f;background:#001f3f;color:#fff;
  box-shadow:0 4px 16px rgba(0,31,63,.28)}
.ld-home .filter-btn:hover:not(.active){border-color:rgba(0,31,63,.35);box-shadow:0 3px 12px rgba(5,27,54,.1)}
.ld-home .ld-gallery{padding:clamp(48px,7vw,88px) 0;background:#f8f9fa}
.ld-home .gallery-section-title{padding:clamp(28px,4vw,44px) 0 12px;max-width:900px}
.ld-home .gallery-section-title h2{font-family:'Barlow Condensed',sans-serif;font-size:clamp(1.95rem,4vw,2.65rem)!important;
  font-weight:800!important;text-transform:uppercase;letter-spacing:.035em;color:#051B36!important;line-height:1.12;margin:0 0 14px!important}
.ld-home .gallery-section-title h2::after{content:'';display:block;width:56px;height:3px;margin-top:14px;background:#0F385F;border-radius:2px}
.ld-home .gallery-section-title p{color:#5a6677;font-size:.98rem;margin:0;max-width:880px;line-height:1.6}
.ld-home .ld-gallery-thumb{background:#12151c;border-radius:18px;padding:12px;box-shadow:0 8px 26px rgba(5,27,54,.14)}
.ld-home .ld-gallery-thumb img{border-radius:12px;display:block;width:100%;height:auto;object-fit:contain}
.ld-home .ld-banner-cta{background:#051B36 url('https://lifedeportes.com/img/hero-futbol.webp') center/cover no-repeat;position:relative;min-height:280px;display:flex}
.ld-home .ld-banner-cta .ld-banner-overlay{background:rgba(5,27,54,.76);flex:1;display:flex;align-items:center;padding:48px 0}
.ld-home .ld-banner-inner{text-align:center;margin:0 auto;color:#fff}
.ld-home .ld-banner-label{font-size:.75rem;text-transform:uppercase;letter-spacing:.2em;opacity:.75;display:block;margin-bottom:8px}
.ld-home .ld-banner-inner h2{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;font-size:clamp(1.5rem,3.5vw,2.35rem)}
.ld-home .ld-gallery-cta-title{color:#fff!important;text-align:center;text-transform:none!important;font-weight:800!important;margin-bottom:.5rem!important}
.ld-home .ld-gallery-cta-phone{text-align:center;margin-bottom:28px!important}
.ld-home .ld-gallery-cta-tel{color:rgba(255,255,255,.94)!important;font-weight:700;font-size:1.05rem;text-decoration:none!important;display:inline-flex;gap:8px;align-items:center}
.ld-home .ld-gallery-cta-tel:hover{color:#fff!important}
.ld-home .ld-gallery-cta-buttons{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;margin-top:8px}
.ld-home .btn.btn-ld-primary{background:#0F385F!important;color:#fff!important;border:none!important;padding:.85rem 1.6rem!important;
  border-radius:999px!important;text-transform:uppercase!important;font-weight:700!important;letter-spacing:.04em!important}
.ld-home .btn.btn-ld-primary:hover{background:#051B36!important;color:#fff!important}
.ld-home .btn.btn-ld-outline{background:transparent!important;color:#fff!important;border:2px solid rgba(255,255,255,.65)!important;
  padding:.75rem 1.35rem!important;border-radius:999px!important;text-transform:uppercase!important;font-weight:700!important;letter-spacing:.04em!important}
.ld-home .btn.btn-ld-outline:hover{background:#fff!important;color:#0F385F!important;border-color:#fff!important}
.ld-home .btn.btn-ld-white{background:#fff!important;color:#0F385F!important;border:none!important;padding:.85rem 1.75rem!important;
  border-radius:999px!important;text-transform:uppercase!important;font-weight:700!important;letter-spacing:.04em!important}
.ld-home .btn.btn-ld-white:hover{background:#051B36!important;color:#fff!important}
.ld-home .ld-btn{padding:14px 28px!important;border-radius:10px!important;font-weight:700!important;text-decoration:none!important;
  display:inline-block!important;text-align:center}
.ld-home .ld-btn-white{background:#fff!important;color:#0F385F!important}
.ld-home .ld-btn-outline-light{background:transparent!important;color:#fff!important;border:2px solid rgba(255,255,255,.58)!important;
  border-radius:50px!important}
.ld-home .ld-about{padding:80px 0;background:#f7f8fa}
.ld-home .ld-about-inner{display:flex;align-items:center;gap:60px;max-width:1200px;margin:0 auto;padding:0 24px;flex-wrap:wrap}
@media(max-width:1024px){.ld-home .ld-about-inner{flex-direction:column}}
.ld-home .ld-about-content{flex:1;min-width:280px}
.ld-home .ld-about-content h2{font-family:'Barlow Condensed',sans-serif;font-size:2.35rem!important;font-weight:700!important;
  text-transform:uppercase;color:#051B36!important;margin-bottom:16px!important}
.ld-home .ld-section-label{font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#5B9BD5!important;margin-bottom:8px;display:inline-block}
.ld-home .ld-about-content p{color:#555;margin-bottom:14px!important;font-size:.95rem;line-height:1.65}
.ld-home .ld-about-image img{width:100%;border-radius:12px;display:block}
.ld-home .ld-process{padding:100px 0;background:#fff}
.ld-home .ld-section-title{font-family:'Barlow Condensed',sans-serif;font-size:clamp(2rem,5vw,3.05rem)!important;font-weight:700!important;
  text-transform:uppercase;text-align:center;margin-bottom:8px;color:#051B36!important}
.ld-home .ld-section-sub{text-align:center;color:#5a6677;margin-bottom:40px;margin-left:auto;margin-right:auto;max-width:520px;font-size:1rem}
.ld-home .ld-process-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:32px;max-width:1060px;margin:0 auto;padding:0 24px}
@media(max-width:1024px){.ld-home .ld-process-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:576px){.ld-home .ld-process-grid{grid-template-columns:1fr}}
.ld-home .ld-process-step{text-align:center}
.ld-home .ld-process-img-wrap{position:relative;width:200px;height:200px;margin:0 auto 20px;border-radius:18px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.08)}
.ld-home .ld-process-img-wrap img{width:100%;height:100%;object-fit:cover;display:block}
.ld-home .ld-process-num{position:absolute;bottom:10px;left:10px;font-family:'Barlow Condensed',sans-serif;font-weight:800;color:#fff;
  font-size:1.75rem;text-shadow:0 2px 8px rgba(0,0,0,.55)}
.ld-home .ld-process-step h3{font-family:'Barlow Condensed',sans-serif;font-size:1.2rem;font-weight:700;text-transform:uppercase;color:#051B36!important}
.ld-home .ld-process-step p{font-size:.88rem;color:#888;max-width:220px;margin:0 auto;line-height:1.55}
.ld-home .ld-why-us{padding:72px 0;background:linear-gradient(135deg,#0F385F 0%,#051B36 100%);color:#fff}
.ld-home .ld-why-stats{display:flex;flex-wrap:wrap;justify-content:center;gap:32px;text-align:center}
.ld-home .ld-why-stat strong{display:block;font-family:'Barlow Condensed',sans-serif;font-size:clamp(2.2rem,4vw,3.2rem);font-weight:800;line-height:1;color:#fff}
.ld-home .ld-why-us span{font-size:.85rem;opacity:.9;text-transform:uppercase;letter-spacing:.06em;display:block;margin-top:6px;line-height:1.35;color:#fff!important}
.ld-home .lightbox.ld-lightbox{position:fixed;inset:0;z-index:100050;display:none;align-items:center;justify-content:center;
  background:rgba(5,27,54,.92)}
.ld-home .lightbox.ld-lightbox.open{display:flex!important}
.ld-home #lightboxClose{position:absolute;top:16px;right:20px;width:44px;height:44px;border:none;border-radius:50%;
  background:rgba(255,255,255,.12);color:#fff;font-size:1.65rem;line-height:1;cursor:pointer}
.ld-home #lightboxClose:hover{background:rgba(255,255,255,.22);}
.ld-home .lightbox-nav.lightbox-prev{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:46px;height:46px;
  border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:1.35rem;cursor:pointer}
.ld-home .lightbox-nav.lightbox-next{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;
  border:none;background:rgba(255,255,255,.15);color:#fff;font-size:1.35rem;cursor:pointer}
.ld-home .lightbox-figure{margin:0;max-width:min(94vw,1100px)}
.ld-home #lightboxImg{max-width:100%;max-height:82vh;border-radius:6px;transition:opacity .12s ease}
@keyframes ld-gallery-filterFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
</style>

                <section class="ld-hero oe_structure ld-about-page-hero">
                    <video class="ld-hero-bg-video" autoplay="autoplay" muted="muted" loop="loop" playsinline="playsinline" preload="none" poster="https://lifedeportes.com/img/about-banner.webp" aria-hidden="true"/>
                    <div class="ld-hero-overlay"/>
                    <div class="container ld-hero-inner">
                        <div class="ld-hero-content">
                            <span class="ld-hero-badge">Fábrica de Uniformes Deportivos</span>
                            <h1 class="ld-hero-title">Uniformes Deportivos<br/><span class="text-accent">Personalizados en Colombia</span></h1>
                            <p class="ld-hero-sub">
                                En Life Deportes somos fabricantes especializados en uniformes deportivos personalizados
                                con más de 20 años de experiencia. Desde Bogotá atendemos equipos, escuelas, clubes
                                y empresas en todo Colombia, con envíos también a Estados Unidos y Puerto Rico.
                            </p>
                            <div class="ld-hero-actions">
                                <a href="/#contacto" class="btn btn-ld-primary">Cotiza Gratis</a>
                                <a href="https://wa.me/573103362484?text=Hola%2C%20quiero%20cotizar%20uniformes%20deportivos" class="btn btn-ld-outline" target="_blank" rel="noopener noreferrer">
                                    Escríbenos por WhatsApp
                                </a>
                                <a href="/gallery" class="btn btn-ld-outline">Ver Galería</a>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="ld-about oe_structure" id="contenido">
                    <div class="container ld-about-inner">
                        <div class="ld-about-content">
                            <span class="ld-section-label">Nuestra Historia</span>
                            <h2>Conoce Nuestra Esencia</h2>
                            <p>
                                Somos una empresa colombiana con enfoque en calidad, innovación y cumplimiento.
                                Fabricamos uniformes personalizados para fútbol, voleibol, baloncesto y otras
                                disciplinas, con confección técnica y sublimación digital de alta definición.
                            </p>
                            <p>
                                Acompañamos cada proyecto desde el diseño hasta la entrega para que cada equipo
                                reciba prendas cómodas, durables y con identidad propia.
                            </p>
                            <a href="/#contacto" class="btn btn-ld-primary">Hablar con asesor</a>
                        </div>
                        <div class="ld-about-image">
                            <img src="https://lifedeportes.com/img/about-banner.webp" alt="Equipo deportivo vestido con uniformes personalizados de Life Deportes" loading="lazy"/>
                        </div>
                    </div>
                </section>

                <section class="s_features pt64 pb64 oe_structure bg-white">
                    <div class="container">
                        <div class="row g-4">
                            <div class="col-lg-6">
                                <div class="h-100 p-4 border rounded-3 bg-light">
                                    <span class="ld-section-label">Nuestra Esencia</span>
                                    <h3 class="h2 mb-3">Misión</h3>
                                    <p class="mb-0">
                                        <strong>LIFE SOLUCIONES DEPORTIVAS S.A.S</strong>, a través de exigentes
                                        procesos administrativos, didácticos y pedagógicos, desarrolla productos
                                        dirigidos a diferentes grupos poblacionales para contribuir a mejorar su
                                        calidad de vida y fortalecer la convivencia pacífica.
                                    </p>
                                </div>
                            </div>
                            <div class="col-lg-6">
                                <div class="h-100 p-4 border rounded-3 bg-light">
                                    <span class="ld-section-label">Nuestro Futuro</span>
                                    <h3 class="h2 mb-3">Visión</h3>
                                    <p class="mb-0">
                                        Consolidar a <strong>LIFE SOLUCIONES DEPORTIVAS</strong> como una empresa
                                        sólida en el mercado deportivo, didáctico y recreativo, con productos
                                        excelentes que promuevan salud, responsabilidad, pertenencia y cambio
                                        positivo en la ciudadanía.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="ld-process oe_structure" id="proceso">
                    <div class="container">
                        <h2 class="ld-section-title">Nuestro Proceso de Fabricación</h2>
                        <p class="ld-section-sub">
                            Cada uniforme se fabrica con tela poliéster dry-fit y sublimación digital para lograr
                            colores vivos, secado rápido y durabilidad superior.
                        </p>
                        <div class="ld-process-grid">
                            <div class="ld-process-step">
                                <div class="ld-process-img-wrap">
                                    <img src="https://lifedeportes.com/img/process-1.webp" alt="Paso 1: cotización" loading="lazy"/>
                                    <span class="ld-process-num">01</span>
                                </div>
                                <h3>Cotización</h3>
                                <p>Recibimos tu idea, cantidades, tallas y fechas de entrega.</p>
                            </div>
                            <div class="ld-process-step">
                                <div class="ld-process-img-wrap">
                                    <img src="https://lifedeportes.com/img/process-2.webp" alt="Paso 2: diseño" loading="lazy"/>
                                    <span class="ld-process-num">02</span>
                                </div>
                                <h3>Diseño</h3>
                                <p>Personalizamos escudos, logos, números, nombres y colores.</p>
                            </div>
                            <div class="ld-process-step">
                                <div class="ld-process-img-wrap">
                                    <img src="https://lifedeportes.com/img/process-3.webp" alt="Paso 3: confección" loading="lazy"/>
                                    <span class="ld-process-num">03</span>
                                </div>
                                <h3>Confección</h3>
                                <p>Producimos con estándares de calidad en cada etapa de la prenda.</p>
                            </div>
                            <div class="ld-process-step">
                                <div class="ld-process-img-wrap">
                                    <img src="https://lifedeportes.com/img/process-4.webp" alt="Paso 4: entrega" loading="lazy"/>
                                    <span class="ld-process-num">04</span>
                                </div>
                                <h3>Entrega</h3>
                                <p>Despachamos a nivel nacional e internacional con acompañamiento.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="ld-why-us oe_structure">
                    <div class="container">
                        <h2 class="ld-section-title">A Quiénes Vestimos</h2>
                        <p class="ld-section-sub">
                            Equipos amateur y profesionales, clubes, escuelas deportivas, ligas universitarias,
                            empresas y eventos en todo el país.
                        </p>
                        <div class="ld-why-stats">
                            <div class="ld-why-stat">
                                <strong data-target="20" data-prefix="+">+20</strong>
                                <span>Años de<br/>Experiencia</span>
                            </div>
                            <div class="ld-why-stat">
                                <strong data-target="1000" data-suffix="+">1000+</strong>
                                <span>Equipos<br/>Vestidos</span>
                            </div>
                            <div class="ld-why-stat">
                                <strong data-target="100" data-suffix="%">100%</strong>
                                <span>Personalización<br/>Total</span>
                            </div>
                            <div class="ld-why-stat">
                                <strong data-target="32">32</strong>
                                <span>Departamentos<br/>Cubiertos</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="s_features pt64 pb64 oe_structure bg-light">
                    <div class="container">
                        <h2 class="ld-section-title">Nuestros Valores</h2>
                        <div class="row g-4 mt-2">
                            <div class="col-md-6 col-lg-3">
                                <div class="h-100 p-4 border rounded-3 bg-white">
                                    <h3 class="h4 mb-2">Calidad</h3>
                                    <p class="mb-0">Materiales premium y sublimación de alta definición en cada prenda.</p>
                                </div>
                            </div>
                            <div class="col-md-6 col-lg-3">
                                <div class="h-100 p-4 border rounded-3 bg-white">
                                    <h3 class="h4 mb-2">Compromiso</h3>
                                    <p class="mb-0">Cumplimos tiempos de entrega y acompañamos cada proyecto de principio a fin.</p>
                                </div>
                            </div>
                            <div class="col-md-6 col-lg-3">
                                <div class="h-100 p-4 border rounded-3 bg-white">
                                    <h3 class="h4 mb-2">Innovación</h3>
                                    <p class="mb-0">Diseños únicos con tendencias actuales para cada deporte y categoría.</p>
                                </div>
                            </div>
                            <div class="col-md-6 col-lg-3">
                                <div class="h-100 p-4 border rounded-3 bg-white">
                                    <h3 class="h4 mb-2">Cercanía</h3>
                                    <p class="mb-0">Atención directa por WhatsApp y asesoría personalizada en cada pedido.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="ld-banner-cta oe_structure">
                    <div class="ld-banner-overlay">
                        <div class="container ld-banner-inner">
                            <span class="ld-banner-label">¿Listo para crear tus uniformes?</span>
                            <h2>Cotiza tu diseño con Life Deportes</h2>
                            <div class="d-flex flex-wrap gap-2 justify-content-center">
                                <a href="/#contacto" class="btn btn-ld-white">Cotiza Ya</a>
                                <a href="https://wa.me/573103362484?text=Hola%2C%20quiero%20cotizar%20uniformes%20personalizados" class="btn btn-ld-outline" target="_blank" rel="noopener noreferrer">
                                    WhatsApp
                                </a>
                            </div>
                        </div>
                    </div>
                </section>
<script type="text/javascript">
document.addEventListener('DOMContentLoaded', function(){
  var rows=document.querySelectorAll('.ld-about-page.ld-home .ld-why-stat strong[data-target]');
  if(!rows.length)return;
  function go(el){
    var t=parseInt(el.dataset.target||'0',10)||0,p=(el.dataset.prefix||''),s=(el.dataset.suffix||'');
    var dur=1400,st=performance.now(),fn=function(now){
      var p_=Math.min(1,(now-st)/dur),e_=1-Math.pow(1-p_,3);
      el.textContent=p+Math.floor(t*e_)+s;if(p_&lt;1)requestAnimationFrame(fn);else el.textContent=p+t+s;
    };requestAnimationFrame(fn);
  }
  rows.forEach(function(el){
    new IntersectionObserver(function(ent,o){
      ent.forEach(function(e){if(e.isIntersecting){go(e.target);o.unobserve(e.target);}});
    },{threshold:0.35}).observe(el);
  });
});
</script>


            </div>
        </t>
</t>
```
---

### Condiciones de venta (/terms-of-use)
- **Website:** lifedeportes.com
- **URL:** `/terms-of-use`
- **View Name/ID:** Condiciones de venta (ID: 5320)
- **View Key:** `website.condiciones-de-venta`
- **Type:** qweb
- **Last Updated:** 2026-05-21 18:53:36
- **Backup File:** [view_5320_condiciones_de_venta.xml](./view_5320_condiciones_de_venta.xml)

#### Architecture (QWeb/XML):

```xml
<t t-name="website.terms-of-use">
<style type="text/css">
.ld-legal-page{font-family:'DM Sans',system-ui,sans-serif;color:#1a1a2e}
.ld-legal-page .ld-legal-hero{background:linear-gradient(135deg,#051B36 0%,#0a3060 100%);color:#fff}
.ld-legal-page .ld-section-label{display:inline-block;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#9ec5ff;margin-bottom:12px}
.ld-legal-page h1{font-family:'Barlow Condensed',sans-serif;font-size:clamp(2rem,4vw,3rem);font-weight:800;text-transform:uppercase;margin:0 0 16px}
.ld-legal-page .ld-legal-lead{max-width:860px;font-size:1.05rem;line-height:1.7;margin:0 0 12px;color:rgba(255,255,255,.92)}
.ld-legal-page .ld-legal-meta{opacity:.75;margin:0}
.ld-legal-page .ld-legal-grid{display:grid;gap:18px}
.ld-legal-page .ld-legal-card{background:#fff;border:1px solid rgba(5,27,54,.08);border-radius:14px;padding:22px 24px;box-shadow:0 8px 24px rgba(5,27,54,.05)}
.ld-legal-page .ld-legal-highlight{border-color:#0F385F;background:#f7fbff}
.ld-legal-page h2{font-family:'Barlow Condensed',sans-serif;font-size:1.35rem;font-weight:700;color:#051B36;margin:0 0 12px}
.ld-legal-page p,.ld-legal-page li{line-height:1.65;color:#334155}
.ld-legal-page ul{margin:8px 0 0;padding-left:1.2rem}
.ld-legal-page a{color:#0F385F;font-weight:600}
</style>

<t t-call="website.layout">
            <div id="wrap" class="oe_structure ld-home ld-legal-page">
                <section class="ld-legal-hero pt64 pb32">
                    <div class="container">
                        <span class="ld-section-label">Información comercial</span>
                        <h1>Condiciones de venta</h1>
                        <p class="ld-legal-lead">
                            Life Deportes fabrica y vende uniformes y prendas deportivas personalizadas
                            <strong>al por mayor</strong>. Estas condiciones aplican a cotizaciones, pedidos,
                            pagos y entregas realizados por nuestra tienda en línea, WhatsApp o asesores comerciales.
                        </p>
                        <p class="ld-legal-meta">Última actualización: mayo 2026</p>
                    </div>
                </section>

                <section class="ld-legal-body pt16 pb64">
                    <div class="container">
                        <div class="ld-legal-grid">
                            <article class="ld-legal-card">
                                <h2>1. Venta al por mayor</h2>
                                <p>
                                    Trabajamos principalmente con equipos, clubes, colegios, empresas y organizaciones
                                    que requieren producción en volumen. No vendemos prendas sueltas al detal
                                    (por ejemplo, una camiseta, una bandera o medias sin pedido base).
                                </p>
                            </article>

                            <article class="ld-legal-card ld-legal-highlight">
                                <h2>2. Pedido mínimo</h2>
                                <p>
                                    El pedido base es de <strong>mínimo 6 uniformes completos</strong> por diseño
                                    (camiseta + pantaloneta + medias, según el producto cotizado).
                                </p>
                                <ul>
                                    <li>Camisetas extra, banderas, gorras, medias adicionales u otros complementos se cotizan <strong>encima</strong> de esos 6 uniformes.</li>
                                    <li>Si el pedido es menor a 6 uniformes, puede aplicarse cargo por diseño especial según cotización.</li>
                                </ul>
                            </article>

                            <article class="ld-legal-card">
                                <h2>3. Cotizaciones</h2>
                                <p>
                                    Los precios publicados son referenciales y pueden variar según tela, manga, cuello,
                                    tipo de pantaloneta, medias y personalización. La cotización definitiva se confirma
                                    por un asesor antes de iniciar producción.
                                </p>
                            </article>

                            <article class="ld-legal-card">
                                <h2>4. Forma de pago</h2>
                                <ul>
                                    <li><strong>50% de abono</strong> para iniciar la producción.</li>
                                    <li><strong>50% restante</strong> antes del envío o entrega del pedido terminado.</li>
                                    <li>Los medios de pago se confirman al cerrar la venta (transferencia, consignación u otros acordados).</li>
                                </ul>
                            </article>

                            <article class="ld-legal-card">
                                <h2>5. Tiempos de fabricación</h2>
                                <p>
                                    El tiempo estándar de fabricación es de <strong>10 días hábiles</strong>,
                                    contados después de recibir el abono inicial y la información completa del pedido
                                    (tallas, nombres, números, logos y aprobación de diseño cuando aplique).
                                </p>
                                <p>
                                    La entrega estimada al cliente suele ser de aproximadamente <strong>15 días hábiles</strong>
                                    después de la aprobación del diseño, sujeta a volumen, ciudad de destino y transportadora.
                                </p>
                            </article>

                            <article class="ld-legal-card">
                                <h2>6. Personalización y diseño</h2>
                                <ul>
                                    <li>Los diseños personalizados se elaboran con la información suministrada por el cliente.</li>
                                    <li>El cliente debe revisar y aprobar el diseño antes de imprimir.</li>
                                    <li>Life Deportes no se hace responsable por errores en nombres, números o logos enviados incorrectamente por el cliente.</li>
                                </ul>
                            </article>

                            <article class="ld-legal-card">
                                <h2>7. Envíos</h2>
                                <p>
                                    Realizamos envíos a todo Colombia y, según disponibilidad, a otros destinos acordados
                                    con el cliente. El costo de transporte, empaque adicional o entregas urgentes se cotiza
                                    aparte cuando aplique.
                                </p>
                            </article>

                            <article class="ld-legal-card">
                                <h2>8. Cambios, devoluciones y garantía</h2>
                                <p>
                                    Al tratarse de productos personalizados y fabricados bajo pedido, <strong>no aplican
                                    devoluciones por cambio de opinión</strong>. Si existe un defecto de fabricación
                                    atribuible a Life Deportes, evaluaremos la reposición o corrección correspondiente.
                                </p>
                            </article>

                            <article class="ld-legal-card">
                                <h2>9. Uso del sitio web</h2>
                                <p>
                                    El contenido de este sitio (textos, imágenes, diseños de referencia y catálogo)
                                    es propiedad de Life Deportes o de sus clientes, según corresponda. Queda prohibida
                                    su reproducción no autorizada. Los enlaces a sitios de terceros son informativos;
                                    no controlamos su contenido.
                                </p>
                            </article>

                            <article class="ld-legal-card">
                                <h2>10. Protección de datos</h2>
                                <p>
                                    Los datos personales que nos entregue se usan para cotizar, producir, facturar y
                                    entregar su pedido. Puede consultar más detalle en nuestra
                                    <a href="/privacy-policy">política de privacidad</a>.
                                </p>
                            </article>

                            <article class="ld-legal-card">
                                <h2>11. Legislación aplicable</h2>
                                <p>
                                    Estas condiciones se rigen por la legislación de la <strong>República de Colombia</strong>.
                                    Cualquier controversia se someterá a los jueces competentes de Bogotá, D.C.,
                                    salvo norma imperativa en contrario.
                                </p>
                            </article>

                            <article class="ld-legal-card">
                                <h2>12. Contacto</h2>
                                <p><strong>LIFE SOLUCIONES DEPORTIVAS S.A.S — Life Deportes</strong></p>
                                <ul>
                                    <li>Dirección: Cl. 66a #98a 12, Bogotá, Colombia</li>
                                    <li>Correo: <a href="mailto:info@lifedeportes.com">info@lifedeportes.com</a></li>
                                    <li>WhatsApp: <a href="https://wa.me/573103362484" target="_blank" rel="noopener">+57 310 336 2484</a></li>
                                    <li>Sitio web: <a href="https://lifedeportes.com">lifedeportes.com</a></li>
                                </ul>
                            </article>
                        </div>
                    </div>
                </section>
            </div>
        </t>
</t>
```
---

### Tienda Life Deportes (/)
- **Website:** lifedeportes.com
- **URL:** `/`
- **View Name/ID:** Tienda Life Deportes (ID: 5324)
- **View Key:** `website.tienda-life-deportes`
- **Type:** qweb
- **Last Updated:** 2026-07-03 15:47:51
- **Backup File:** [view_5324_tienda_life_deportes.xml](./view_5324_tienda_life_deportes.xml)

#### Architecture (QWeb/XML):

```xml
<t t-name="website.tienda-life-deportes">
<t t-call="website.layout">
            <div id="wrap" class="oe_structure ld-shop-landing">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&amp;family=DM+Sans:wght@400;500;700&amp;display=swap"/>
<style type="text/css">
.ld-shop-landing{font-family:'DM Sans',system-ui,sans-serif;color:#1a1a2e}
.ld-shop-landing h1,.ld-shop-landing h2{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase}
.ld-shop-hero{background:linear-gradient(135deg,#051B36 0%,#0a3060 55%,#051B36 100%);color:#fff;padding:72px 0 56px}
.ld-shop-hero-inner{max-width:920px}
.ld-shop-badge{display:inline-block;font-size:.75rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
  padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);margin-bottom:18px}
.ld-shop-hero h1{font-size:clamp(2rem,5vw,3.2rem);line-height:1.05;margin:0 0 16px}
.ld-shop-lead{font-size:1.05rem;line-height:1.65;opacity:.95;max-width:760px;margin-bottom:24px}
.ld-shop-actions{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:18px}
.ld-shop-btn-primary{background:#0F385F!important;border:none!important;border-radius:999px!important;
  padding:.85rem 1.6rem!important;font-weight:700!important;text-transform:uppercase!important}
.ld-shop-btn-outline{border:2px solid rgba(255,255,255,.65)!important;border-radius:999px!important;
  padding:.75rem 1.35rem!important;font-weight:700!important;text-transform:uppercase!important;color:#fff!important}
.ld-shop-note{font-size:.92rem;opacity:.9;margin:0}
.ld-shop-note a{color:#9ec5f0;text-decoration:underline}
.ld-shop-featured{padding:56px 0 40px;background:#f8f9fa}
.ld-shop-featured h2{font-size:clamp(1.8rem,4vw,2.4rem);margin:0 0 8px;color:#051B36}
.ld-shop-sub{color:#5a6677;margin:0 0 28px}
.ld-shop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}
.ld-shop-card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(5,27,54,.08);
  text-decoration:none!important;color:inherit!important;display:flex;flex-direction:column;height:100%}
.ld-shop-card img{width:100%;aspect-ratio:4/5;object-fit:cover;background:#eef1f5}
.ld-shop-card-body{padding:14px 16px 18px;display:flex;flex-direction:column;gap:8px;flex:1}
.ld-shop-card h3{font-size:1rem;font-weight:700;margin:0;line-height:1.3;text-transform:none;font-family:inherit}
.ld-shop-card p{font-size:.86rem;color:#5a6677;margin:0;line-height:1.45;flex:1}
.ld-shop-price{font-weight:800;color:#0F385F;font-size:1rem}
.ld-shop-trust{padding:36px 0;background:#fff;border-top:1px solid rgba(5,27,54,.06)}
.ld-shop-trust-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:20px;text-align:center}
.ld-shop-trust strong{display:block;font-family:'Barlow Condensed',sans-serif;font-size:1.8rem;color:#051B36}
.ld-shop-trust span{font-size:.82rem;color:#5a6677;text-transform:uppercase;letter-spacing:.05em}
.ld-shop-cta{padding:52px 0 64px;background:linear-gradient(135deg,#0F385F 0%,#051B36 100%);color:#fff}
.ld-shop-cta h2{font-size:clamp(1.6rem,3.5vw,2.2rem);margin-bottom:10px}
.ld-shop-cta p{opacity:.92;margin-bottom:22px}
</style>
                <section class="ld-shop-hero">
                    <div class="container ld-shop-hero-inner">
                        <span class="ld-shop-badge">Tienda oficial Life Deportes</span>
                        <h1>Catálogo de uniformes deportivos personalizados</h1>
                        <p class="ld-shop-lead">
                            Configura tu producto, elige variantes y cotiza en línea.
                            Fútbol, baloncesto, voleibol, sudaderas y complementos.
                            Pedido mínimo 6 unidades por diseño.
                        </p>
                        <div class="ld-shop-actions">
                            <a href="/shop" class="btn btn-primary ld-shop-btn-primary">Ver catálogo completo</a>
                            <a href="https://wa.me/573103362484?text=Hola%2C%20quiero%20cotizar%20uniformes%20de%20" class="btn btn-outline-light ld-shop-btn-outline" target="_blank" rel="noopener">
                                Cotizar por WhatsApp
                            </a>
                        </div>
                        <p class="ld-shop-note">
                            ¿Buscas inspiración de diseños?
                            <a href="https://lifedeportes.com/galeria.html" target="_blank" rel="noopener">
                                Ver galería en lifedeportes.com
                            </a>
                        </p>
                    </div>
                </section>

                <section class="ld-shop-featured">
                    <div class="container">
                        <h2>Productos destacados</h2>
                        <p class="ld-shop-sub">Los más solicitados por equipos en Colombia</p>
                        <div class="ld-shop-grid"><a class="ld-shop-card" href="/shop/uniforme-de-futbol-115">
              <img src="https://life-soluciones.odoo.com/web/image/product.template/115/image_512" alt="Uniforme de Fútbol" loading="lazy"/>
              <div class="ld-shop-card-body">
                <h3>Uniforme de Fútbol</h3>
                <p>Uniforme de fútbol personalizado (camiseta, pantaloneta y medias).</p>
                <span class="ld-shop-price">Desde $ 50.000</span>
              </div>
            </a>
<a class="ld-shop-card" href="/shop/camiseta-deportiva-dry-fit-62">
              <img src="https://life-soluciones.odoo.com/web/image/product.template/62/image_512" alt="Camiseta deportiva dry-fit" loading="lazy"/>
              <div class="ld-shop-card-body">
                <h3>Camiseta deportiva dry-fit</h3>
                <p>Camiseta deportiva dry-fit personalizada.</p>
                <span class="ld-shop-price">Desde $ 30.000</span>
              </div>
            </a>
<a class="ld-shop-card" href="/shop/uniforme-de-baloncesto-23">
              <img src="https://life-soluciones.odoo.com/web/image/product.template/23/image_512" alt="Uniforme de baloncesto" loading="lazy"/>
              <div class="ld-shop-card-body">
                <h3>Uniforme de baloncesto</h3>
                <p>Uniforme de baloncesto personalizado (camiseta sisa y pantaloneta).</p>
                <span class="ld-shop-price">Desde $ 50.000</span>
              </div>
            </a>
<a class="ld-shop-card" href="/shop/camiseta-deportiva-con-cuello-polo-sin-botones-61">
              <img src="https://life-soluciones.odoo.com/web/image/product.template/61/image_512" alt="Camiseta deportiva con cuello polo, Sin botones" loading="lazy"/>
              <div class="ld-shop-card-body">
                <h3>Camiseta deportiva con cuello polo, Sin botones</h3>
                <p>Camiseta deportiva cuello polo personalizada.</p>
                <span class="ld-shop-price">Desde $ 33.000</span>
              </div>
            </a>
<a class="ld-shop-card" href="/shop/uniforme-de-voleibol-31">
              <img src="https://life-soluciones.odoo.com/web/image/product.template/31/image_512" alt="Uniforme de voleibol" loading="lazy"/>
              <div class="ld-shop-card-body">
                <h3>Uniforme de voleibol</h3>
                <p>Uniforme de voleibol personalizado (camiseta y pantaloneta o licra).</p>
                <span class="ld-shop-price">Desde $ 50.000</span>
              </div>
            </a>
<a class="ld-shop-card" href="/shop/camiseta-deportiva-dumonti-685">
              <img src="https://life-soluciones.odoo.com/web/image/product.template/685/image_512" alt="Camiseta Deportiva Dumonti" loading="lazy"/>
              <div class="ld-shop-card-body">
                <h3>Camiseta Deportiva Dumonti</h3>
                <p>Camiseta deportiva Dumonti personalizada.</p>
                <span class="ld-shop-price">Desde $ 35.000</span>
              </div>
            </a>
<a class="ld-shop-card" href="/shop/sudadera-chaqueta-y-pantalon-orion-66">
              <img src="https://life-soluciones.odoo.com/web/image/product.template/66/image_512" alt="Sudadera Chaqueta y Pantalón Orión" loading="lazy"/>
              <div class="ld-shop-card-body">
                <h3>Sudadera Chaqueta y Pantalón Orión</h3>
                <p>Sudadera chaqueta y pantalón tela Orión personalizados.</p>
                <span class="ld-shop-price">Desde $ 100.000</span>
              </div>
            </a>
<a class="ld-shop-card" href="/shop/chaqueta-rompevientos-68">
              <img src="https://life-soluciones.odoo.com/web/image/product.template/68/image_512" alt="Chaqueta Rompevientos" loading="lazy"/>
              <div class="ld-shop-card-body">
                <h3>Chaqueta Rompevientos</h3>
                <p>Chaqueta rompevientos con capota personalizada.</p>
                <span class="ld-shop-price">Desde $ 60.000</span>
              </div>
            </a></div>
                    </div>
                </section>

                <section class="ld-shop-trust">
                    <div class="container ld-shop-trust-grid">
                        <div><strong>+20 años</strong><span>Fabricación en Bogotá</span></div>
                        <div><strong>6 uds.</strong><span>Pedido mínimo por diseño</span></div>
                        <div><strong>10 días</strong><span>Fabricación tras aprobación</span></div>
                        <div><strong>Envío</strong><span>A toda Colombia</span></div>
                    </div>
                </section>

                <section class="ld-shop-cta">
                    <div class="container text-center">
                        <h2>¿Listo para armar tu pedido?</h2>
                        <p>Entra al catálogo, configura tu uniforme y continúa con la cotización.</p>
                        <a href="/shop" class="btn btn-primary ld-shop-btn-primary">Ir al catálogo</a>
                    </div>
                </section>
            </div>
        </t>
</t>
```
---

### Home (/)
- **Website:** Life Soluciones deportivas
- **URL:** `/`
- **View Name/ID:** Home (ID: 3249)
- **View Key:** `website.homepage`
- **Type:** qweb
- **Last Updated:** 2025-11-08 22:45:50
- **Backup File:** [view_3249_home.xml](./view_3249_home.xml)

#### Architecture (QWeb/XML):

```xml
<t name="Homepage" t-name="website.homepage">
    <t t-call="website.layout">
        <t t-set="pageName" t-value="'homepage'"/>
        <div id="wrap" class="oe_structure"><section class="s_text_cover o_colored_level o_cc o_cc1" data-snippet="s_text_cover" data-name="Portada de texto">
        <div class="container-fluid">
            <div class="row o_grid_mode" data-row-count="15">
                <div class="o_grid_item g-height-9 g-col-lg-6 col-lg-6" style="z-index: 1; grid-area: 4 / 2 / 13 / 8; --grid-item-padding-x: 24px; --grid-item-padding-y: 24px; text-align: right;">
                    <h1 class="display-3">
        <strong>La siguientecolección</strong> <strong>de ropa deportiva</strong><br/> <strong>de verano</strong>
    </h1>
                    <p class="lead">
        <br/>Las tendencias de diseño deportivo ya están listas para brillar el próximo verano.<br/>
    </p>
                    <a class="btn btn-lg btn-primary" href="/contactus">
        Descúbrelo
    </a>
                </div>
                <div class="o_grid_item oe_img_bg o_not_editable d-none d-lg-block o_snippet_mobile_invisible g-col-lg-4 col-lg-4 g-height-15" style="grid-area: 1 / 9 / 16 / 13; --grid-item-padding-x: 0px; --grid-item-padding-y: 0px; background-image: url('/web/image/website.s_text_cover_default_image');"/>
            </div>
        </div>
    </section><section class="s_image_gallery o_masonry pt0 pb0 o_cc o_cc5 o_spc-none" data-vcss="002" data-columns="3" style="overflow: hidden;" data-snippet="s_images_wall" data-name="Muro de imágenes">
        <div class="container-fluid">
            <div class="row s_nb_column_fixed">
                <div class="o_masonry_col o_snippet_not_selectable col-lg-4">
                    <img class="img img-fluid d-block rounded" src="/web/image/website.library_image_03" data-index="0" data-name="Image" alt="" loading="lazy"/>
                    <img class="img img-fluid d-block rounded" src="/web/image/website.library_image_10" data-index="3" data-name="Image" alt="" loading="lazy"/>
                </div>
                <div class="o_masonry_col o_snippet_not_selectable col-lg-4">
                    <img class="img img-fluid d-block rounded" src="/web/image/website.library_image_13" data-index="1" data-name="Image" alt="" loading="lazy"/>
                    <img class="img img-fluid d-block rounded" src="/web/image/website.library_image_05" data-index="4" data-name="Image" alt="" loading="lazy"/>
                </div>
                <div class="o_masonry_col o_snippet_not_selectable col-lg-4">
                    <img class="img img-fluid d-block rounded" src="/web/image/website.library_image_14" data-index="2" data-name="Image" alt="" loading="lazy"/>
                    <img class="img img-fluid d-block rounded" src="/web/image/website.library_image_16" data-index="5" data-name="Image" alt="" loading="lazy"/>
                </div>
            </div>
        </div>
    </section><section class="s_color_blocks_2" data-snippet="s_color_blocks_2" data-name="Cajas grandes">
        <div class="container-fluid">
            <div class="row">
                <div class="o_cc col-lg-4 o_cc3 text-center">
        <i class="fa fa-5x m-3 fa-venus"/>
                    <h2 class="h3-fs">
        Ropa deportiva para ella
    </h2>
                    <p>
        Renueva tu vestuario diario con nuestra gama de ropa deportiva para mujer. Descubre nuestra última colección para ellas de este próximo verano.
    </p>
                    <a href="#" class="btn btn-primary btn-lg">Más detalles</a>
                </div>
                <div class="o_cc o_cc4 col-lg-4 text-center">
        <i class="fa fa-5x m-3 fa-mars"/>
                    <h2 class="h3-fs">
        Estilo deportivo para él
    </h2>
                    <p>
        Combinaciones perfectas para un rendimiento óptimo. Encuentra ideas originales para tus outfits deportivos para la nueva temporada y para cada actividad. Descubre lo que hay para él.
    </p>
                    <a href="#" class="btn btn-primary btn-lg">Más detalles</a>
                </div>
        <div class="col-lg-4 o_cc o_cc5 text-center">
            <i class="fa fa-venus-mars fa-5x m-3"/>
            <h2 class="h3-fs">Rendimiento y estilo para ellos</h2>
            <p>¿Estás buscando ropa deportiva sostenible para hombre o mujer? Descubre nuestra exclusiva marca de ropa deportiva para ambos.</p>
            <a href="#" class="btn btn-primary btn-lg">Más detalles</a>
        </div>
            </div>
        </div>
    </section><section class="s_references o_cc o_cc1 pt80 pb80" data-snippet="s_references" data-name="Referencias">
        <div class="container">
            <div class="row s_nb_column_fixed">
                <div class="col-12 col-lg-12 pb24">
                    <h2 style="text-align: center;">
        <font style="background-image: linear-gradient(135deg, var(--o-color-1) 0%, var(--o-color-2) 100%);" class="text-gradient">Nuestras mejores marcas deportivas</font>
    </h2>
                    <p class="lead" style="text-align: center;">
        Todos los estilos para todos los atletas.
    </p>
                    <p style="text-align: center;">
                        <a href="#">Consultar nuestros casos de estudio <i class="fa fa-long-arrow-right ms-2"/></a>
                    </p>
                </div>
                <div class="col-6 col-lg-2 pt16 pb16">
                    <img src="/web/image/website.s_reference_demo_image_1" class="img img-fluid mx-auto" alt="" loading="lazy"/>
                </div>
                <div class="col-6 col-lg-2 pt16 pb16">
                    <img src="/web/image/website.s_reference_demo_image_2" class="img img-fluid mx-auto" alt="" loading="lazy"/>
                </div>
                <div class="col-6 col-lg-2 pt16 pb16">
                    <img src="/web/image/website.s_reference_demo_image_3" class="img img-fluid mx-auto" alt="" loading="lazy"/>
                </div>
                <div class="col-6 col-lg-2 pt16 pb16">
                    <img src="/web/image/website.s_reference_demo_image_4" class="img img-fluid mx-auto" alt="" loading="lazy"/>
                </div>
                <div class="col-6 col-lg-2 pt16 pb16">
                    <img src="/web/image/website.s_reference_demo_image_5" class="img img-fluid mx-auto" alt="" loading="lazy"/>
                </div>
                <div class="col-6 col-lg-2 pt16 pb16">
                    <img src="/web/image/website.s_reference_default_image_6" class="img img-fluid mx-auto" alt="" loading="lazy"/>
                </div>
            </div>
        </div>
    </section><section class="s_media_list o_colored_level o_cc pt64 pb64 o_cc5" data-vcss="001" data-snippet="s_media_list" data-name="Lista de medios">
        <div class="container">
            <div class="row s_nb_column_fixed s_col_no_bgcolor">
                <div class="col-lg-12 s_media_list_item pt16 pb16" data-name="Media item">
                    <div class="row s_col_no_resize s_col_no_bgcolor g-0 align-items-center o_colored_level">
                        <div class="align-self-stretch s_media_list_img_wrapper col-lg-6">
                            <img src="/web_editor/image_shape/website.s_media_list_default_image_1/web_editor/composition/composition_square_1.svg?c1=o-color-4&amp;c2=o-color-2" class="s_media_list_img h-100 w-100" alt="" data-shape="html_builder/composition/composition_square_1" data-original-mimetype="image/jpeg" data-file-name="s_media_list_1.svg" data-shape-colors="o-color-4;o-color-2;;;" loading="lazy"/>
                        </div>
                        <div class="s_media_list_body col-lg-6">
                            <h3>
        Las mejores marcas de ropa deportiva del mundo
    </h3>
                            <p>
        Sal de tu zona de confort y descubre actividades emocionantes y novedosas. ¡Aquí está nuestra guía definitiva de los mejores deportes que debes probar!
    </p>
                            <a href="#">Descubrir más <i class="fa fa-long-arrow-right align-middle ms-1"/></a>
                        </div>
                    </div>
                </div>
                <div class="col-lg-12 s_media_list_item pt16 pb16" data-name="Media item">
                    <div class="row s_col_no_resize s_col_no_bgcolor g-0 align-items-center o_colored_level flex-row-reverse">
                        <div class="align-self-stretch s_media_list_img_wrapper col-lg-6">
                            <img src="/web_editor/image_shape/website.s_media_list_default_image_2/web_editor/composition/composition_square_3.svg?c1=o-color-1&amp;c5=o-color-2" class="s_media_list_img h-100 w-100" alt="" data-shape="html_builder/composition/composition_square_3" data-original-mimetype="image/jpeg" data-file-name="s_media_list_2.svg" data-shape-colors="o-color-1;;;;o-color-2" loading="lazy"/>
                        </div>
                        <div class="s_media_list_body col-lg-6">
                            <h3>
        Esenciales de verano para el deporte
    </h3>
                            <p>
        Los esenciales deportivos correctos pueden marcar la diferencia entre un buen entrenamiento y un gran rendimiento. Descubre nuestra selección para el día a día durante los cálidos meses de verano.
    </p>
        <a href="#" class="btn btn-primary">Leer más</a>
                        </div>
                    </div>
                </div>
                </div>
        </div>
    </section><section class="s_key_images pt72 pb72 o_cc o_cc3" data-snippet="s_key_images" data-name="Imágenes clave">
        <div class="container">
            <div class="row s_nb_column_fixed">
                <div class="col-lg-12 pb32">
                    <h2>
        Descubre nuestra colección más reciente de ropa deportiva
    </h2>
                    <p class="lead">
        Explora las tendencias que marcan el ritmo en el deporte
    </p>
                </div>
                <div class="col-6 col-lg-3">
                    <p class="h1-fs">01</p>
                    <p><img src="/web_editor/image_shape/website.s_key_images_default_image_1/web_editor/geometric/geo_square_6.svg" class="img img-fluid rounded" alt="" style="width: 100% !important;" data-shape="html_builder/geometric/geo_square_6" data-original-mimetype="image/jpeg" data-file-name="s_key_images_default_image_1.svg" data-shape-colors=";;;;" loading="lazy"/></p>
                    <p>
        Comodidad y funcionalidad en cada prenda
    </p>
                </div>
                <div class="col-6 col-lg-3">
                    <p class="h1-fs">02</p>
                    <p><img src="/web/image/website.s_key_images_default_image_2" class="img img-fluid rounded" alt="" style="width: 100% !important;" loading="lazy"/></p>
                    <p>
        Outfits perfectos para cada actividad
    </p>
                </div>
                <div class="col-6 col-lg-3">
                    <p class="h1-fs">03</p>
                    <p><img src="/web/image/website.s_key_images_default_image_3" class="img img-fluid rounded" alt="" style="width: 100% !important;" loading="lazy"/></p>
                    <p>
        Calidad que se siente en cada movimiento
    </p>
                </div>
                <div class="col-6 col-lg-3">
                    <p class="h1-fs">04</p>
                    <p><img src="/web_editor/image_shape/website.s_key_images_default_image_4/web_editor/geometric/geo_square_5.svg" class="img img-fluid rounded" alt="" style="width: 100% !important;" data-shape="html_builder/geometric/geo_square_5" data-original-mimetype="image/jpeg" data-file-name="s_key_images_default_image_4.svg" data-shape-colors=";;;;" loading="lazy"/></p>
                    <p>
        Incluye nuestros últimos estilos en tu armario deportivo
    </p>
                </div>
            </div>
        </div>
    </section><section class="s_call_to_action o_cc pt120 pb104 o_cc4" data-oe-shape-data="{&quot;shape&quot;:&quot;web_editor/Floats/02&quot;,&quot;flip&quot;:[]}" data-snippet="s_call_to_action" data-name="Llamada a la acción">
        <div class="o_we_shape o_web_editor_Floats_02 o_footer_extra_shape_mapping"/>
        <div class="container">
            <div class="row">
                <div class="col-lg-12">
                    <h3 style="text-align: center;">
        Sé tú mismo, crea tu propio estilo deportivo
    </h3>
                    <p class="lead" style="text-align: center;">
        Descubre la nueva colección de ropa deportiva de verano.
    </p>
                </div>
                <div class="col-lg-12">
                    <p style="text-align: center;">
                        <a class="btn btn-primary btn-lg" href="/contactus">
        Descúbrelo
    </a>
                    </p>
                </div>
            </div>
        </div>
    </section></div>
    </t>
</t>
```
---

### Contact Us (/contactus)
- **Website:** Global
- **URL:** `/contactus`
- **View Name/ID:** Contact Us (ID: 3242)
- **View Key:** `website.contactus`
- **Type:** qweb
- **Last Updated:** 2025-11-08 22:45:50
- **Backup File:** [view_3242_contact_us.xml](./view_3242_contact_us.xml)

#### Architecture (QWeb/XML):

```xml
<t name="Contact Us" t-name="website.contactus">
        <t t-call="website.layout">
            <t t-set="logged_partner" t-value="request.env['website.visitor']._get_visitor_from_request().partner_id"/>
            <t t-set="contactus_form_values" t-value="{                 'email_to': res_company.email,                 'name': request.params.get('name', ''),                 'phone': request.params.get('phone', ''),                 'email_from': request.params.get('email_from', ''),                 'company': request.params.get('company', ''),                 'subject': request.params.get('subject', ''),             }"/>
            <span class="hidden" data-for="contactus_form" t-att-data-values="contactus_form_values"/>
            <div id="wrap" class="oe_structure oe_empty">
                <section class="s_title parallax s_parallax_is_fixed bg-black-50 pt24 pb24" data-vcss="001" data-snippet="s_title" data-scroll-background-ratio="1">
                    <span class="s_parallax_bg oe_img_bg" style="background-image: url('/web/image/website.s_parallax_default_image'); background-position: 50% 0;"/>
                    <div class="o_we_bg_filter bg-black-50"/>
                    <div class="container">
                        <h1>Contact us</h1>
                    </div>
                </section>
                <section class="s_text_block pt40 pb40 o_colored_level " data-snippet="s_text_block">
                    <div class="container s_allow_columns">
                        <div class="row">
                            <div class="col-lg-7 mt-4 mt-lg-0">
                                <p class="lead">
                                    Contact us about anything related to our company or services.<br/>
                                    We'll do our best to get back to you as soon as possible.
                                </p>
                                <section class="s_website_form" data-vcss="001" data-snippet="s_website_form">
                                    <div class="container">
                                        <form id="contactus_form" action="/website/form/" method="post" enctype="multipart/form-data" class="o_mark_required" data-mark="*" data-model_name="mail.mail" data-success-mode="redirect" data-success-page="/contactus-thank-you" data-pre-fill="true">
                                            <div class="s_website_form_rows row s_col_no_bgcolor">
                                                <div class="mb-3 col-lg-6 s_website_form_field s_website_form_custom s_website_form_required" data-type="char" data-name="Field">
                                                    <label class="s_website_form_label" style="width: 200px" for="contact1">
                                                        <span class="s_website_form_label_content">Name</span>
                                                        <span class="s_website_form_mark"> *</span>
                                                    </label>
                                                    <input id="contact1" type="text" class="form-control s_website_form_input" name="name" required="" data-fill-with="name"/>
                                                </div>
                                                <div class="mb-3 col-lg-6 s_website_form_field s_website_form_custom" data-type="char" data-name="Field">
                                                    <label class="s_website_form_label" style="width: 200px" for="contact2">
                                                        <span class="s_website_form_label_content">Phone Number</span>
                                                    </label>
                                                    <input id="contact2" type="tel" class="form-control s_website_form_input" name="phone" data-fill-with="phone"/>
                                                </div>
                                                <div class="mb-3 col-lg-6 s_website_form_field s_website_form_required s_website_form_model_required" data-type="email" data-name="Field">
                                                    <label class="s_website_form_label" style="width: 200px" for="contact3">
                                                        <span class="s_website_form_label_content">Email</span>
                                                        <span class="s_website_form_mark"> *</span>
                                                    </label>
                                                    <input id="contact3" type="email" class="form-control s_website_form_input" name="email_from" required="" data-fill-with="email"/>
                                                </div>
                                                <div class="mb-3 col-lg-6 s_website_form_field s_website_form_custom" data-type="char" data-name="Field">
                                                    <label class="s_website_form_label" style="width: 200px" for="contact4">
                                                        <span class="s_website_form_label_content">Company</span>
                                                    </label>
                                                    <input id="contact4" type="text" class="form-control s_website_form_input" name="company" data-fill-with="commercial_company_name"/>
                                                </div>
                                                <div class="mb-3 col-12 s_website_form_field s_website_form_required s_website_form_model_required" data-type="char" data-name="Field">
                                                    <label class="s_website_form_label" style="width: 200px" for="contact5">
                                                        <span class="s_website_form_label_content">Subject</span>
                                                        <span class="s_website_form_mark"> *</span>
                                                    </label>
                                                    <input id="contact5" type="text" class="form-control s_website_form_input" name="subject" required=""/>
                                                </div>
                                                <div class="mb-3 col-12 s_website_form_field s_website_form_custom s_website_form_required" data-type="text" data-name="Field">
                                                    <label class="s_website_form_label" style="width: 200px" for="contact6">
                                                        <span class="s_website_form_label_content">Question</span>
                                                        <span class="s_website_form_mark"> *</span>
                                                    </label>
                                                    <textarea id="contact6" class="form-control s_website_form_input" name="description" required="" rows="8"/>
                                                </div>
                                                <div class="mb-3 col-12 s_website_form_field s_website_form_dnone">
                                                    <div class="row s_col_no_resize s_col_no_bgcolor">
                                                        <label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="contact7">
                                                            <span class="s_website_form_label_content">Email To</span>
                                                        </label>
                                                        <div class="col-sm">
                                                            <input id="contact7" type="hidden" class="form-control s_website_form_input" name="email_to"/>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="mb-0 py-2 col-12 s_website_form_submit s_website_form_no_submit_label text-end" data-name="Submit Button">
                                                    <div style="width: 200px;" class="s_website_form_label"/>
                                                    <a href="#" role="button" class="btn btn-primary s_website_form_send">Submit</a>
                                                    <span id="s_website_form_result"/>
                                                </div>
                                            </div>
                                        </form>
                                    </div>
                                </section>
                            </div>
                            <div class="col-lg-4 offset-lg-1 mt-4 mt-lg-0">
                                <h5>My Company</h5>
                                <ul class="list-unstyled mb-0 ps-2">
                                    <li><i class="fa fa-map-marker fa-fw me-2"/><span class="o_force_ltr">3575 Fake Buena Vista Avenue</span></li>
                                    <li><i class="fa fa-phone fa-fw me-2"/><span class="o_force_ltr">+1 555-555-5556</span></li>
                                    <li><i class="fa fa-1x fa-fw fa-envelope me-2"/><span>info@yourcompany.example.com</span></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </t>
    </t>
```
---

### Thanks (Contact us) (/contactus-thank-you)
- **Website:** Global
- **URL:** `/contactus-thank-you`
- **View Name/ID:** Thanks (Contact us) (ID: 3243)
- **View Key:** `website.contactus_thanks`
- **Type:** qweb
- **Last Updated:** 2025-11-08 22:45:50
- **Backup File:** [view_3243_thanks_contact_us.xml](./view_3243_thanks_contact_us.xml)

#### Architecture (QWeb/XML):

```xml
<t name="Thanks (Contact us)" t-name="website.contactus_thanks">
                <t t-call="website.layout">
                    <div id="wrap" class="oe_structure oe_empty">
                        <section class="s_text_block pt40 pb40 o_colored_level " data-snippet="s_text_block">
                            <div class="container s_allow_columns">
                                <div class="row">
                                    <div class="col-lg-6 offset-lg-1 text-center">
                                        <div class="d-inline-block mx-auto p-4">
                                            <i class="fa fa-paper-plane fa-2x mb-3 rounded-circle text-bg-success" role="presentation"/>
                                            <h1 class="fw-bolder">Thank You!</h1>
                                            <p class="lead mb-0">Your message has been sent.</p>
                                            <p class="lead">We will get back to you shortly.</p>
                                            <a href="/">Go to Homepage</a>
                                        </div>
                                    </div>
                                    <div class="col-lg-4 offset-lg-1">
                                        <h5>My Company</h5>
                                        <ul class="list-unstyled mb-0 ps-2">
                                            <li><i class="fa fa-map-marker fa-fw me-2"/><span class="o_force_ltr">3575 Fake Buena Vista Avenue</span></li>
                                            <li><i class="fa fa-phone fa-fw me-2"/><span class="o_force_ltr">+1 555-555-5556</span></li>
                                            <li><i class="fa fa-1x fa-fw fa-envelope me-2"/><span>info@yourcompany.example.com</span></li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                    <input t-if="website.plausible_shared_key" type="hidden" class="js_plausible_push" data-event-name="Lead Generation" data-event-params="{&quot;CTA&quot;: &quot;Contact Us&quot;}"/>
                </t>
            </t>
```
---

### Task Submitted (/your-task-has-been-submitted)
- **Website:** Global
- **URL:** `/your-task-has-been-submitted`
- **View Name/ID:** Task Submitted (ID: 4038)
- **View Key:** `website_project.task_submitted`
- **Type:** qweb
- **Last Updated:** 2025-11-08 22:46:36
- **Backup File:** [view_4038_task_submitted.xml](./view_4038_task_submitted.xml)

#### Architecture (QWeb/XML):

```xml
<t name="Task Submitted" t-name="website_project.task_submitted">
        <t t-call="website.layout">
            <div class="oe_structure oe_empty h-100">
                <div class="container d-flex flex-column justify-content-center h-100">
                    <div class="d-flex flex-column align-items-center mb16 p-4 text-center">
                        <t t-if="request.session.get('form_builder_model_model', '') == 'project.task'">
                            <t t-set="task" t-value="request.website._website_form_last_record()"/>
                        </t>
                        <i class="fa fa-paper-plane fa-2x mb-3 rounded-circle text-bg-success" role="presentation"/>
                        <h1 class="fw-bolder">Thank you!</h1>
                        <t t-if="task">
                            <p class="lead mb-0">Your task has been sent.</p>
                            <p class="lead">Our team will get right on it.</p>
                            <a t-if="request.session.uid and task.sudo().project_id.id and task.project_privacy_visibility in ['employees', 'portal']" class="my-3 border rounded px-4 py-3 bg-100 fs-5 fw-bold shadow-sm text-decoration-none" t-attf-href="/my/task/#{task.id}" t-att-title="'Ticket #' + str(task.id)">
                                Task #<span t-field="task.id"/>
                            </a>
                            <span t-else="" class="my-3 border rounded px-4 py-3 fs-5 fw-bold shadow-sm">
                                Task #<span t-field="task.id"/>
                            </span>
                        </t>
                        <a href="/">Go to Homepage</a>
                    </div>
                </div>
            </div>
        </t>
    </t>
```
---

### Home (/)
- **Website:** Global
- **URL:** `/`
- **View Name/ID:** Home (ID: 3241)
- **View Key:** `website.homepage`
- **Type:** qweb
- **Last Updated:** 2025-11-08 22:45:50
- **Backup File:** [view_3241_home.xml](./view_3241_home.xml)

#### Architecture (QWeb/XML):

```xml
<t name="Home" t-name="website.homepage">
        <t t-call="website.layout" pageName.f="homepage">
            <div id="wrap" class="oe_structure oe_empty"/>
        </t>
    </t>
```
---
