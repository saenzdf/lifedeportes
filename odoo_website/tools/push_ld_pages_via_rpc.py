#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Publica las plantillas tipo lifedeportes_theme sobre website.page mediante XML-RPC.

Ejemplo Odoo SaaS / Online:
    export ODOO_URL=https://life-soluciones.odoo.com
    export ODOO_DB=life-soluciones
    export ODOO_LOGIN=tu_email
    export ODOO_PASSWORD=tu_clave_o_api_key
    python push_ld_pages_via_rpc.py [--dry-run] [--about-only]
    python push_ld_pages_via_rpc.py --force-gallery-seed   # DANGER: overwrites FB gallery with webps

Gallery walls with Facebook trabajos reales live in Odoo view 5323 / assets/gallery_social/.
Do NOT push gallery_page.xml unless you intentionally want SEO webps from lifedeportes.com.
Restore: scripts/update_odoo_gallery_from_social.py --from-assets --apply

Python 3 + xmlrpc (stdlib). Credenciales opcionales en .env junto al script.

Las rutas /lifedeportes_theme/static/… se sustituyen por HTTPS en lifedeportes.com
(LIFEDEPORTES_MEDIA_BASE). El CSS/JS se inyectan inline porque no hay tema instalado.
"""

from __future__ import annotations

import argparse
import os
import re
import ssl
import sys
from pathlib import Path
import xmlrpc.client

try:
    _ENV = Path(__file__).resolve().parent / ".env"
    if _ENV.is_file():
        for raw in _ENV.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v
except OSError:
    pass


def _media_base() -> str:
    return os.environ.get("LIFEDEPORTES_MEDIA_BASE", "https://lifedeportes.com").rstrip("/")


def _media_map() -> dict[str, str]:
    b = _media_base()
    return {
        "/lifedeportes_theme/static/src/img/about-banner.webp": f"{b}/img/hero-futbol.webp",
        "/lifedeportes_theme/static/src/img/hero-futbol.webp": f"{b}/img/hero-futbol.webp",
        "/lifedeportes_theme/static/src/img/process-1.webp": f"{b}/img/process-1.webp",
        "/lifedeportes_theme/static/src/img/process-2.webp": f"{b}/img/process-2.webp",
        "/lifedeportes_theme/static/src/img/process-3.webp": f"{b}/img/process-3.webp",
        "/lifedeportes_theme/static/src/img/process-4.webp": f"{b}/img/process-4.webp",
    }


def build_saas_inline_css() -> str:
    b = _media_base()
    # noqa line length — stylesheet inline para SaaS
    return rf"""
@import url("https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=DM+Sans:wght@400;500;700&display=swap");
.ld-home{{font-family:'DM Sans',system-ui,sans-serif;color:#1a1a2e;-webkit-font-smoothing:antialiased}}
.ld-home .text-accent{{color:#5B9BD5!important}}
.ld-home .ld-hero {{
  position:relative;isolation:isolate;background:linear-gradient(135deg,#051B36 0%,#0a3060 50%,#051B36 100%);
  min-height:560px;color:#fff;overflow:hidden;padding:80px 0 52px}}
.ld-home.ld-gallery-page .ld-gallery-page-hero.ld-hero {{
  overflow:hidden!important;min-height:clamp(420px,52vh,560px)!important;padding-bottom:clamp(40px,6vw,64px)!important}}
.ld-home.ld-gallery-page .ld-gallery-page-hero.ld-hero > .ld-gallery-hero-photo {{
  position:absolute;inset:0;z-index:0;background-position:center;background-size:cover;background-repeat:no-repeat}}
.ld-home.ld-gallery-page .ld-gallery-page-hero.ld-hero > .ld-hero-overlay {{
  z-index:1;background:linear-gradient(160deg,rgba(0,31,63,.88) 0%,rgba(5,27,54,.82) 45%,rgba(0,20,45,.92) 100%)!important}}
.ld-home.ld-gallery-page .ld-gallery-page-hero.ld-hero > .ld-gallery-hero-pattern {{
  position:absolute;inset:0;z-index:2;pointer-events:none;opacity:.14;
  background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cpath fill='none' stroke='%23ffffff' stroke-width='0.35' d='M0 40c20-8 40 8 60 0s40-8 60 0M0 80c22 10 38-6 60 0s38 6 60 0M20 0c-6 22 6 38 0 60s-6 38 0 60M80 0c8 18-8 42 0 60s-8 42 0 60'/%3E%3C/svg%3E\");
  background-size:280px 280px}}
.ld-home.ld-about-page .ld-about-page-hero.ld-hero {{
  overflow:visible!important;min-height:clamp(460px,56vh,620px);padding-bottom:64px}}
.ld-home .ld-hero > .ld-hero-bg-video {{
  position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none}}
.ld-home .ld-hero > .ld-hero-overlay {{
  position:absolute;inset:0;z-index:1;background:linear-gradient(135deg,rgba(5,27,54,.88) 0%,rgba(15,56,95,.78) 50%,rgba(5,27,54,.92) 100%);
  pointer-events:none}}
.ld-home .ld-hero .ld-hero-inner {{
  position:relative;z-index:2;display:flex;align-items:center;gap:40px;flex-wrap:wrap;max-width:1200px;margin:0 auto;padding:0 24px}}
.ld-home.ld-gallery-page .ld-gallery-page-hero .ld-hero-inner,
.ld-home.ld-about-page .ld-about-page-hero .ld-hero-inner{{
  flex-direction:column;text-align:center;justify-content:center;align-items:center;min-height:min(44vh,440px);position:relative;z-index:3}}
.ld-home.ld-about-page .ld-about-page-hero .ld-hero-sub{{max-width:760px!important;margin:0 auto 28px!important}}
.ld-home.ld-about-page .ld-hero-actions{{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-bottom:12px!important}}
.ld-home.ld-gallery-page .ld-gallery-page-hero .ld-hero-sub{{max-width:720px!important;margin:0 auto 0!important;opacity:.95!important;font-size:.96rem!important;color:rgba(255,255,255,.93)!important}}
.ld-home.ld-gallery-page .ld-gallery-page-hero .ld-hero-title,
.ld-home .ld-gallery-page-hero .ld-hero-title{{font-size:clamp(2.05rem,4.9vw,3.7rem)!important;font-weight:800!important;text-transform:uppercase!important;line-height:1.05!important;color:#fff!important}}
.ld-home.ld-about-page .ld-about-page-hero .ld-hero-title{{font-size:clamp(2rem,5.5vw,3.85rem)!important;font-weight:800!important;color:#fff!important}}
.ld-home .ld-about-page-hero .ld-hero-badge{{
  font-size:.78rem!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.15em!important;
  padding:6px 16px!important;border-radius:50px;background:rgba(255,255,255,.1)!important;border:1px solid rgba(255,255,255,.22)!important}}
.ld-home .ld-gallery-filter-strip{{background:#f8f9fa;border-top:1px solid rgba(5,27,54,.06);border-bottom:1px solid rgba(5,27,54,.06);
  padding:clamp(18px,3vw,26px) 0}}
.ld-home .ld-gallery-filter-shell{{background:transparent!important;border:none!important;border-radius:0!important;padding:0!important;
  box-shadow:none!important}}
.ld-home .ld-gallery-filters{{display:flex;flex-wrap:nowrap;justify-content:center;gap:12px;margin:0!important;
 overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px}}
.ld-home .filter-btn{{appearance:none;border:1px solid #dee2e6;background:#fff;color:#1a2a3d;font-weight:700;
  font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;padding:11px 20px;border-radius:999px;cursor:pointer;transition:.2s;
  box-shadow:0 2px 8px rgba(5,27,54,.06)}}
.ld-home .filter-btn.active{{border-color:#001f3f;background:#001f3f;color:#fff;
  box-shadow:0 4px 16px rgba(0,31,63,.28)}}
.ld-home .filter-btn:hover:not(.active){{border-color:rgba(0,31,63,.35);box-shadow:0 3px 12px rgba(5,27,54,.1)}}
.ld-home .ld-gallery{{padding:clamp(48px,7vw,88px) 0;background:#f8f9fa}}
.ld-home .gallery-section-title{{padding:clamp(28px,4vw,44px) 0 12px;max-width:900px}}
.ld-home .gallery-section-title h2{{font-family:'Barlow Condensed',sans-serif;font-size:clamp(1.95rem,4vw,2.65rem)!important;
  font-weight:800!important;text-transform:uppercase;letter-spacing:.035em;color:#051B36!important;line-height:1.12;margin:0 0 14px!important}}
.ld-home .gallery-section-title h2::after{{content:'';display:block;width:56px;height:3px;margin-top:14px;background:#0F385F;border-radius:2px}}
.ld-home .gallery-section-title p{{color:#5a6677;font-size:.98rem;margin:0;max-width:880px;line-height:1.6}}
.ld-home .ld-gallery-thumb{{background:#12151c;border-radius:18px;padding:12px;box-shadow:0 8px 26px rgba(5,27,54,.14)}}
.ld-home .ld-gallery-thumb img{{border-radius:12px;display:block;width:100%;height:auto;object-fit:contain}}
.ld-home .ld-banner-cta{{background:#051B36 url('{b}/img/hero-futbol.webp') center/cover no-repeat;position:relative;min-height:280px;display:flex}}
.ld-home .ld-banner-cta .ld-banner-overlay{{background:rgba(5,27,54,.76);flex:1;display:flex;align-items:center;padding:48px 0}}
.ld-home .ld-banner-inner{{text-align:center;margin:0 auto;color:#fff}}
.ld-home .ld-banner-label{{font-size:.75rem;text-transform:uppercase;letter-spacing:.2em;opacity:.75;display:block;margin-bottom:8px}}
.ld-home .ld-banner-inner h2{{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;font-size:clamp(1.5rem,3.5vw,2.35rem)}}
.ld-home .ld-gallery-cta-title{{color:#fff!important;text-align:center;text-transform:none!important;font-weight:800!important;margin-bottom:.5rem!important}}
.ld-home .ld-gallery-cta-phone{{text-align:center;margin-bottom:28px!important}}
.ld-home .ld-gallery-cta-tel{{color:rgba(255,255,255,.94)!important;font-weight:700;font-size:1.05rem;text-decoration:none!important;display:inline-flex;gap:8px;align-items:center}}
.ld-home .ld-gallery-cta-tel:hover{{color:#fff!important}}
.ld-home .ld-gallery-cta-buttons{{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;margin-top:8px}}
.ld-home .btn.btn-ld-primary{{background:#0F385F!important;color:#fff!important;border:none!important;padding:.85rem 1.6rem!important;
  border-radius:999px!important;text-transform:uppercase!important;font-weight:700!important;letter-spacing:.04em!important}}
.ld-home .btn.btn-ld-primary:hover{{background:#051B36!important;color:#fff!important}}
.ld-home .btn.btn-ld-outline{{background:transparent!important;color:#fff!important;border:2px solid rgba(255,255,255,.65)!important;
  padding:.75rem 1.35rem!important;border-radius:999px!important;text-transform:uppercase!important;font-weight:700!important;letter-spacing:.04em!important}}
.ld-home .btn.btn-ld-outline:hover{{background:#fff!important;color:#0F385F!important;border-color:#fff!important}}
.ld-home .btn.btn-ld-white{{background:#fff!important;color:#0F385F!important;border:none!important;padding:.85rem 1.75rem!important;
  border-radius:999px!important;text-transform:uppercase!important;font-weight:700!important;letter-spacing:.04em!important}}
.ld-home .btn.btn-ld-white:hover{{background:#051B36!important;color:#fff!important}}
.ld-home .ld-btn{{padding:14px 28px!important;border-radius:10px!important;font-weight:700!important;text-decoration:none!important;
  display:inline-block!important;text-align:center}}
.ld-home .ld-btn-white{{background:#fff!important;color:#0F385F!important}}
.ld-home .ld-btn-outline-light{{background:transparent!important;color:#fff!important;border:2px solid rgba(255,255,255,.58)!important;
  border-radius:50px!important}}
.ld-home .ld-about{{padding:80px 0;background:#f7f8fa}}
.ld-home .ld-about-inner{{display:flex;align-items:center;gap:60px;max-width:1200px;margin:0 auto;padding:0 24px;flex-wrap:wrap}}
@media(max-width:1024px){{.ld-home .ld-about-inner{{flex-direction:column}}}}
.ld-home .ld-about-content{{flex:1;min-width:280px}}
.ld-home .ld-about-content h2{{font-family:'Barlow Condensed',sans-serif;font-size:2.35rem!important;font-weight:700!important;
  text-transform:uppercase;color:#051B36!important;margin-bottom:16px!important}}
.ld-home .ld-section-label{{font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#5B9BD5!important;margin-bottom:8px;display:inline-block}}
.ld-home .ld-about-content p{{color:#555;margin-bottom:14px!important;font-size:.95rem;line-height:1.65}}
.ld-home .ld-about-image img{{width:100%;border-radius:12px;display:block}}
.ld-home .ld-process{{padding:100px 0;background:#fff}}
.ld-home .ld-section-title{{font-family:'Barlow Condensed',sans-serif;font-size:clamp(2rem,5vw,3.05rem)!important;font-weight:700!important;
  text-transform:uppercase;text-align:center;margin-bottom:8px;color:#051B36!important}}
.ld-home .ld-section-sub{{text-align:center;color:#5a6677;margin-bottom:40px;margin-left:auto;margin-right:auto;max-width:520px;font-size:1rem}}
.ld-home .ld-process-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:32px;max-width:1060px;margin:0 auto;padding:0 24px}}
@media(max-width:1024px){{.ld-home .ld-process-grid{{grid-template-columns:repeat(2,1fr)}}}}
@media(max-width:576px){{.ld-home .ld-process-grid{{grid-template-columns:1fr}}}}
.ld-home .ld-process-step{{text-align:center}}
.ld-home .ld-process-img-wrap{{position:relative;width:200px;height:200px;margin:0 auto 20px;border-radius:18px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.08)}}
.ld-home .ld-process-img-wrap img{{width:100%;height:100%;object-fit:cover;display:block}}
.ld-home .ld-process-num{{position:absolute;bottom:10px;left:10px;font-family:'Barlow Condensed',sans-serif;font-weight:800;color:#fff;
  font-size:1.75rem;text-shadow:0 2px 8px rgba(0,0,0,.55)}}
.ld-home .ld-process-step h3{{font-family:'Barlow Condensed',sans-serif;font-size:1.2rem;font-weight:700;text-transform:uppercase;color:#051B36!important}}
.ld-home .ld-process-step p{{font-size:.88rem;color:#888;max-width:220px;margin:0 auto;line-height:1.55}}
.ld-home .ld-why-us{{padding:72px 0;background:linear-gradient(135deg,#0F385F 0%,#051B36 100%);color:#fff}}
.ld-home .ld-why-stats{{display:flex;flex-wrap:wrap;justify-content:center;gap:32px;text-align:center}}
.ld-home .ld-why-stat strong{{display:block;font-family:'Barlow Condensed',sans-serif;font-size:clamp(2.2rem,4vw,3.2rem);font-weight:800;line-height:1;color:#fff}}
.ld-home .ld-why-us span{{font-size:.85rem;opacity:.9;text-transform:uppercase;letter-spacing:.06em;display:block;margin-top:6px;line-height:1.35;color:#fff!important}}
.ld-home .lightbox.ld-lightbox{{position:fixed;inset:0;z-index:100050;display:none;align-items:center;justify-content:center;
  background:rgba(5,27,54,.92)}}
.ld-home .lightbox.ld-lightbox.open{{display:flex!important}}
.ld-home #lightboxClose{{position:absolute;top:16px;right:20px;width:44px;height:44px;border:none;border-radius:50%;
  background:rgba(255,255,255,.12);color:#fff;font-size:1.65rem;line-height:1;cursor:pointer}}
.ld-home #lightboxClose:hover{{background:rgba(255,255,255,.22);}}
.ld-home .lightbox-nav.lightbox-prev{{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:46px;height:46px;
  border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:1.35rem;cursor:pointer}}
.ld-home .lightbox-nav.lightbox-next{{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;
  border:none;background:rgba(255,255,255,.15);color:#fff;font-size:1.35rem;cursor:pointer}}
.ld-home .lightbox-figure{{margin:0;max-width:min(94vw,1100px)}}
.ld-home #lightboxImg{{max-width:100%;max-height:82vh;border-radius:6px;transition:opacity .12s ease}}
@keyframes ld-gallery-filterFadeIn{{from{{opacity:0;transform:translateY(6px)}}to{{opacity:1;transform:none}}}}
"""


SAAS_JS_GALLERY = r"""
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
  if(['futbol','voleibol','baloncesto','sudaderas'].indexOf(h)>=0){
   var tb=root.querySelector('.filter-btn[data-filter="'+h+'"]');if(tb)tb.click();}
  var lb=root.querySelector('#lightbox'),img=root.querySelector('#lightboxImg'),x=root.querySelector('#lightboxClose'),
   pr=root.querySelector('#lightboxPrev'),nx=root.querySelector('#lightboxNext');
  if(!lb||!img||!x)return;
  function vis(im){var w=im.closest('.ld-gallery-wall');if(!w)return true;return w.style.display!=='none';}
  function list(){return[].filter.call(root.querySelectorAll('.ld-gallery-wall .gallery-item img'),vis);}
  var idx=0;
  function open(im){var a=list();idx=Math.max(0,a.indexOf(im));img.src=im.dataset.fullSrc||im.src;img.alt=im.alt||'';lb.classList.add('open');
   document.body.style.overflow='hidden';}
  function close(){lb.classList.remove('open');document.body.style.overflow='';window.setTimeout(function(){img.src='';},280);}
  function hop(d){var a=list();if(!a.length)return;idx=(idx+d+a.length)%a.length;img.style.opacity='0';window.setTimeout(function(){
   var target=a[idx];img.src=target.dataset.fullSrc||target.src;img.alt=target.alt||'';img.style.opacity='1';},115);}
  img.style.transition='opacity 0.12s ease';
  root.querySelectorAll('.gallery-item').forEach(function(el){
   el.style.cursor='zoom-in';el.addEventListener('click',function(){var ig=el.querySelector('img');if(ig&&vis(ig))open(ig);});});
  x.addEventListener('click',close);
  if(pr)pr.addEventListener('click',function(e){e.stopPropagation();hop(-1);});
  if(nx)nx.addEventListener('click',function(e){e.stopPropagation();hop(1);});
  document.addEventListener('keydown',function(e){if(!lb.classList.contains('open'))return;if(e.key==='Escape')close();
   if(e.key==='ArrowLeft')hop(-1);if(e.key==='ArrowRight')hop(1);});
  lb.addEventListener('click',function(e){if(e.target===lb)close();});
});
"""

SAAS_JS_STATS = r"""
document.addEventListener('DOMContentLoaded', function(){
  var rows=document.querySelectorAll('.ld-about-page.ld-home .ld-why-stat strong[data-target]');
  if(!rows.length)return;
  function go(el){
    var t=parseInt(el.dataset.target||'0',10)||0,p=(el.dataset.prefix||''),s=(el.dataset.suffix||'');
    var dur=1400,st=performance.now(),fn=function(now){
      var p_=Math.min(1,(now-st)/dur),e_=1-Math.pow(1-p_,3);
      el.textContent=p+Math.floor(t*e_)+s;if(p_<1)requestAnimationFrame(fn);else el.textContent=p+t+s;
    };requestAnimationFrame(fn);
  }
  rows.forEach(function(el){
    new IntersectionObserver(function(ent,o){
      ent.forEach(function(e){if(e.isIntersecting){go(e.target);o.unobserve(e.target);}});
    },{threshold:0.35}).observe(el);
  });
});
"""


SAAS_GALLERY_WIDGET_HTML = """
<div class="ld-gallery-filter-shell">
  <div class="gallery-filters ld-gallery-filters" role="tablist">
    <button type="button" class="filter-btn active" data-filter="all" aria-selected="true">Todo</button>
    <button type="button" class="filter-btn" data-filter="futbol" aria-selected="false">Fútbol</button>
    <button type="button" class="filter-btn" data-filter="baloncesto" aria-selected="false">Baloncesto</button>
    <button type="button" class="filter-btn" data-filter="voleibol" aria-selected="false">Voleibol</button>
    <button type="button" class="filter-btn" data-filter="sudaderas" aria-selected="false">Sudaderas</button>
  </div>
</div>
<div class="ld-lightbox lightbox" id="lightbox" aria-modal="true" role="dialog" aria-label="Ampliación de imagen">
  <button type="button" class="lightbox-close" id="lightboxClose" aria-label="Cerrar">&times;</button>
  <button type="button" class="lightbox-nav lightbox-prev" id="lightboxPrev" aria-label="Imagen anterior">&#8249;</button>
  <div class="lightbox-figure">
    <img src="" alt="" id="lightboxImg"/>
  </div>
  <button type="button" class="lightbox-nav lightbox-next" id="lightboxNext" aria-label="Imagen siguiente">&#8250;</button>
</div>
""".strip()


def xmlrpc_clients(url: str):
    url = url.rstrip("/")
    ctx = ssl.create_default_context()
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", context=ctx, allow_none=True)
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", context=ctx, allow_none=True)
    return common, models


def extract_template_fragment(xml_file: str, template_id: str) -> str:
    """Contenido de ``<template id="...">`` (no usamos ET: QWeb trae ``&times;`` y similares)."""

    text = Path(xml_file).read_text(encoding="utf-8")
    m = re.search(
        rf"<template\b[^>]*\bid=['\"]{re.escape(template_id)}['\"][^>]*>(.*?)</template>",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if not m:
        raise RuntimeError(f"No existe template id={template_id!r} en {xml_file}")
    return m.group(1).strip()


def absolutize_theme_paths(fragment: str) -> str:
    out = fragment
    for local, remote in sorted(_media_map().items(), key=lambda x: -len(x[0])):
        out = out.replace(local, remote)
    # Sin archivo en SaaS para el vídeo hero: ocultamos data-video-src (el poster vale).
    out = re.sub(r'\sdata-video-src="[^"]*"', "", out)
    return out


def inject_saas_assets(fragment: str, *, gallery: bool) -> str:
    wrap_m = re.search(r"<div\s+[^>]*\bid\s*=\s*['\"]wrap['\"]", fragment)
    if not wrap_m:
        raise RuntimeError("No se encontró <div id='wrap'>")

    css = '<style type="text/css">\n' + build_saas_inline_css().strip() + "\n</style>\n"

    gt = fragment.find(">", wrap_m.start())
    with_style = fragment[: gt + 1] + "\n" + css + fragment[gt + 1 :]

    if gallery:
        with_style = with_style.replace('<div data-ld-gallery-app="1"/>', SAAS_GALLERY_WIDGET_HTML)
        js = '<script type="text/javascript">\n' + SAAS_JS_GALLERY.strip() + "\n</script>\n"
    else:
        js = '<script type="text/javascript">\n' + SAAS_JS_STATS.strip() + "\n</script>\n"

    if gallery:
        insert_before = '<div class="ld-lightbox'
        pos = with_style.find(insert_before)
        if pos != -1:
            return with_style[:pos] + js + with_style[pos:]
        return with_style + "\n" + js

    # About: antes del cierre final </div></t> … insertar después del último </section>
    last_sec = with_style.rfind("</section>")
    if last_sec == -1:
        return with_style + js
    insert_at = last_sec + len("</section>")
    return with_style[:insert_at] + "\n" + js + "\n" + with_style[insert_at:]


def finalize_arch(inner: str, view_key: str) -> str:
    inner = inner.strip()
    if not (inner.startswith("<t ") and "t-call=" in inner[:120]):
        inner = f'<t t-call="website.layout">\n{inner}\n</t>'
    if f't-name="{view_key}"' in inner[:300]:
        return inner
    return f'<t t-name="{view_key}">\n{inner}\n</t>'


def push_pages(
    models,
    uid: int,
    password: str,
    db: str,
    urls: list[str],
    builder,
    *,
    dry_run: bool,
) -> None:
    recs = models.execute_kw(
        db,
        uid,
        password,
        "website.page",
        "search_read",
        [[["url", "in", urls]]],
        {"fields": ["url", "name", "view_id"], "limit": 20},
    )
    if not recs:
        print(f"AVISO: ninguna página con urls {urls!r}")
        return

    seen: set[int] = set()
    for pg in recs:
        vid = pg["view_id"][0]
        if vid in seen:
            continue
        seen.add(vid)

        vw = models.execute_kw(
            db,
            uid,
            password,
            "ir.ui.view",
            "read",
            [[vid]],
            {"fields": ["key", "name"]},
        )[0]
        key = vw.get("key") or f"website.page_{vid}"
        print(f"* {pg['url']!r} → ir.ui.view[{vid}] key={key!r}")

        arch = finalize_arch(builder(), key)

        if dry_run:
            print(f"  dry-run arch_db length={len(arch)} primeras líneas:")
            lines = arch.split("\n")[:8]
            for ln in lines:
                print(f"    {ln[:120]}")
            continue

        models.execute_kw(
            db,
            uid,
            password,
            "ir.ui.view",
            "write",
            [[vid], {"arch_db": arch}],
        )
        print("  escrito.")


def main() -> int:
    ap = argparse.ArgumentParser(description="Push QWeb Lifedeportes vía Odoo RPC")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--gallery-only",
        action="store_true",
        help="Requires --force-gallery-seed (legacy SEO webp seed).",
    )
    ap.add_argument("--about-only", action="store_true")
    ap.add_argument(
        "--force-gallery-seed",
        action="store_true",
        help=(
            "DESTRUCTIVE: push gallery_page.xml (lifedeportes.com SEO webps) over Odoo /gallery. "
            "Wipes Facebook trabajos reales. Prefer update_odoo_gallery_from_social.py --from-assets."
        ),
    )

    ns = ap.parse_args()
    base_url = os.environ.get("ODOO_URL", "").rstrip("/")
    db = os.environ.get("ODOO_DB", "")
    login = os.environ.get("ODOO_LOGIN", "")
    pwd = os.environ.get("ODOO_PASSWORD", "") or os.environ.get("ODOO_API_KEY", "")

    if not base_url or not db or not login or not pwd:
        print("Defina ODOO_URL ODOO_DB ODOO_LOGIN ODOO_PASSWORD (o ODOO_API_KEY).", file=sys.stderr)
        return 1

    theme_views = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "lifedeportes_theme", "views"))
    gallery_xml = os.path.join(theme_views, "gallery_page.xml")
    about_xml = os.path.join(theme_views, "about_page.xml")
    terms_xml = os.path.join(theme_views, "terms_page.xml")

    common, models = xmlrpc_clients(base_url)
    uid = common.authenticate(db, login, pwd, {})
    if not uid:
        print("authenticate() falló.", file=sys.stderr)
        return 1

    # Default: NEVER push gallery seed (webps). Only with explicit --force-gallery-seed.
    do_g = bool(ns.force_gallery_seed) and (ns.gallery_only or not ns.about_only)
    do_a = not ns.gallery_only

    if ns.gallery_only and not ns.force_gallery_seed:
        print(
            "Refusing --gallery-only without --force-gallery-seed "
            "(would overwrite Facebook trabajos reales).",
            file=sys.stderr,
        )
        return 2

    if do_g:

        def b_g():
            return inject_saas_assets(
                absolutize_theme_paths(extract_template_fragment(gallery_xml, "gallery_ld_page")),
                gallery=True,
            )

        print("WARNING: pushing gallery_page.xml SEO webps over /gallery")
        push_pages(models, uid, pwd, db, ["/gallery"], b_g, dry_run=ns.dry_run)
    else:
        print("Skipping /gallery push (keeps Facebook trabajos reales).")

    if do_a:
        about_urls = [
            x.strip().rstrip("/") or ""
            for x in os.environ.get("LIFEDEPORTES_ABOUT_URLS", "/about-us,/about,/nosotros").split(",")
            if x.strip()
        ]

        def b_a():
            return inject_saas_assets(
                absolutize_theme_paths(extract_template_fragment(about_xml, "about_ld_page")),
                gallery=False,
            )

        push_pages(models, uid, pwd, db, about_urls, b_a, dry_run=ns.dry_run)

    # Publicar términos de uso
    def b_t():
        return inject_saas_assets(
            absolutize_theme_paths(extract_template_fragment(terms_xml, "terms_ld_page")),
            gallery=False,
        )
    push_pages(models, uid, pwd, db, ["/terms-of-use"], b_t, dry_run=ns.dry_run)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
