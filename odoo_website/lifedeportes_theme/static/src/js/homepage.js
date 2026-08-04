/** @odoo-module **/

/*
 *  Life Deportes — interacciones del home (vanilla JS)
 *  ---------------------------------------------------
 *  Se registra como widget público de Odoo (publicWidget) para
 *  que se inicialice automáticamente al renderizar la home, y
 *  se desmonte al cambiar de página.
 *
 *  Cubre:
 *   - Hero carousel (imágenes y dots)
 *   - Flip cards de productos (toque en mobile)
 *   - Contadores animados en sección "why-us"
 */

import publicWidget from "@web/legacy/js/public/public_widget";

const LifeDeportesHomepage = publicWidget.Widget.extend({
    selector: ".ld-home",

    start() {
        this._setupHero();
        this._setupCounters();
        this._setupFlipCardsMobile();
        return this._super(...arguments);
    },

    // ----- HERO CAROUSEL -----
    _setupHero() {
        const slider = this.el.querySelector("[data-ld-hero-slider]");
        if (!slider) return;
        const slides = Array.from(slider.querySelectorAll(".ld-hero-slide"));
        const dots = Array.from(this.el.querySelectorAll(".ld-hero-dot"));
        let active = 0;

        // Lazy-load: pasa data-src a src cuando entran al DOM
        slides.forEach((img) => {
            const lazy = img.getAttribute("data-src");
            if (lazy && !img.getAttribute("src")) {
                img.setAttribute("src", lazy);
            }
        });

        const go = (idx) => {
            active = (idx + slides.length) % slides.length;
            slides.forEach((s, i) => s.classList.toggle("active", i === active));
            dots.forEach((d, i) => d.classList.toggle("active", i === active));
        };

        dots.forEach((d, i) => d.addEventListener("click", () => go(i)));
        this._heroInterval = setInterval(() => go(active + 1), 5000);
    },

    // ----- CONTADORES -----
    _setupCounters() {
        const stats = this.el.querySelectorAll(".ld-why-stat strong[data-target]");
        if (!stats.length) return;
        const animate = (el) => {
            const target = parseInt(el.dataset.target, 10) || 0;
            const prefix = el.dataset.prefix || "";
            const suffix = el.dataset.suffix || "";
            const dur = 1400;
            const t0 = performance.now();
            const tick = (now) => {
                const p = Math.min(1, (now - t0) / dur);
                const eased = 1 - Math.pow(1 - p, 3);
                el.textContent = prefix + Math.floor(target * eased) + suffix;
                if (p < 1) requestAnimationFrame(tick);
                else el.textContent = prefix + target + suffix;
            };
            requestAnimationFrame(tick);
        };
        const obs = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    animate(e.target);
                    obs.unobserve(e.target);
                }
            });
        }, { threshold: 0.4 });
        stats.forEach((s) => obs.observe(s));
    },

    // ----- FLIP EN MOBILE (touch) -----
    _setupFlipCardsMobile() {
        if (window.matchMedia("(hover:hover)").matches) return;
        this.el.querySelectorAll(".ld-flip-container").forEach((c) => {
            c.addEventListener("click", () => c.classList.toggle("ld-flipped"));
        });
        const style = document.createElement("style");
        style.textContent = `.ld-flip-container.ld-flipped .ld-flip-inner { transform: rotateY(180deg); }`;
        document.head.appendChild(style);
    },

    destroy() {
        if (this._heroInterval) clearInterval(this._heroInterval);
        this._super(...arguments);
    },
});

publicWidget.registry.LifeDeportesHomepage = LifeDeportesHomepage;
export default LifeDeportesHomepage;
