/** @odoo-module **/

import {Component, mount, onMounted, onWillUnmount, useState} from "@odoo/owl";
import {templates} from "@web/core/templates";

const CATEGORIES = [
    {id: "all", label: "Todo"},
    {id: "futbol", label: "Fútbol"},
    {id: "baloncesto", label: "Baloncesto"},
    {id: "voleibol", label: "Voleibol"},
    {id: "sudaderas", label: "Sudaderas"},
];

class LifeDeportesGallery extends Component {
    static template = "lifedeportes_theme.GalleryPageWidget";

    setup() {
        this.state = useState({
            activeFilter: "all",
            lightboxOpen: false,
            lightboxSrc: "",
            lightboxAlt: "",
            imageIndex: 0,
        });
        this.categories = CATEGORIES;
        this._touchX = 0;
        this._root = null;
        this._keyHandler = null;
        this._clickHandler = null;

        onMounted(() => {
            this._root = this.el.closest(".ld-gallery-page");
            if (!this._root) {
                return;
            }
            this._setFilterFromHash();
            this._applyFilter(this.state.activeFilter);
            this._bindGalleryEvents();
        });

        onWillUnmount(() => {
            if (this._keyHandler) {
                document.removeEventListener("keydown", this._keyHandler);
            }
            if (this._clickHandler && this._root) {
                this._root.removeEventListener("click", this._clickHandler);
            }
            document.body.style.overflow = "";
        });
    }

    onFilterClick(filterId) {
        this.state.activeFilter = filterId;
        this._applyFilter(filterId);
        this._scrollActiveFilterIntoView(filterId);
    }

    onCloseLightbox() {
        this.state.lightboxOpen = false;
        this.state.lightboxSrc = "";
        this.state.lightboxAlt = "";
        document.body.style.overflow = "";
    }

    onPrevImage(ev) {
        if (ev) {
            ev.stopPropagation();
        }
        this._moveLightbox(-1);
    }

    onNextImage(ev) {
        if (ev) {
            ev.stopPropagation();
        }
        this._moveLightbox(1);
    }

    onLightboxTouchStart(ev) {
        this._touchX = ev.touches?.[0]?.clientX || 0;
    }

    onLightboxTouchEnd(ev) {
        const endX = ev.changedTouches?.[0]?.clientX || this._touchX;
        const delta = endX - this._touchX;
        if (Math.abs(delta) > 50) {
            this._moveLightbox(delta < 0 ? 1 : -1);
        }
    }

    _setFilterFromHash() {
        const hash = (window.location.hash || "").replace("#", "");
        const allowed = CATEGORIES.map((c) => c.id).filter((id) => id !== "all");
        if (hash && allowed.includes(hash)) {
            this.state.activeFilter = hash;
        }
    }

    _applyFilter(category) {
        if (!this._root) {
            return;
        }
        const match = (wallCat) => category === "all" || wallCat === category;
        this._root.querySelectorAll(".ld-gallery-wall").forEach((wall) => {
            const wallCat = wall.dataset.wallCat || wall.getAttribute("data-wall-cat");
            const visible = match(wallCat);
            wall.style.display = visible ? "" : "none";
            wall.style.animation = visible ? "ld-gallery-filterFadeIn 0.38s ease both" : "";
        });
        this._root.querySelectorAll(".gallery-section-title").forEach((title) => {
            const titleCat = title.dataset.cat;
            title.style.display = match(titleCat) ? "" : "none";
        });
    }

    _scrollActiveFilterIntoView(filterId) {
        const bar = this.el.querySelector(".gallery-filters");
        const button = this.el.querySelector(`.filter-btn[data-filter="${filterId}"]`);
        if (!bar || !button) {
            return;
        }
        const offset =
            button.offsetLeft - bar.offsetLeft - bar.clientWidth / 2 + button.offsetWidth / 2;
        bar.scrollTo({left: offset, behavior: "smooth"});
    }

    _bindGalleryEvents() {
        this._clickHandler = (ev) => {
            const item = ev.target.closest(".gallery-item");
            if (!item || !this._root.contains(item)) {
                return;
            }
            const img = item.querySelector("img");
            if (!img || !this._isImageVisible(img)) {
                return;
            }
            this._openLightbox(img);
        };
        this._root.addEventListener("click", this._clickHandler);

        this._keyHandler = (ev) => {
            if (!this.state.lightboxOpen) {
                return;
            }
            if (ev.key === "Escape") {
                this.onCloseLightbox();
            } else if (ev.key === "ArrowLeft") {
                this._moveLightbox(-1);
            } else if (ev.key === "ArrowRight") {
                this._moveLightbox(1);
            }
        };
        document.addEventListener("keydown", this._keyHandler);
    }

    _isImageVisible(img) {
        const wall = img.closest(".ld-gallery-wall");
        return !wall || wall.style.display !== "none";
    }

    _visibleImages() {
        if (!this._root) {
            return [];
        }
        return Array.from(this._root.querySelectorAll(".ld-gallery-wall .gallery-item img")).filter((img) =>
            this._isImageVisible(img),
        );
    }

    _openLightbox(img) {
        const images = this._visibleImages();
        this.state.imageIndex = Math.max(0, images.indexOf(img));
        this.state.lightboxSrc = img.src;
        this.state.lightboxAlt = img.alt || "";
        this.state.lightboxOpen = true;
        document.body.style.overflow = "hidden";
    }

    _moveLightbox(delta) {
        const images = this._visibleImages();
        if (!images.length) {
            return;
        }
        this.state.imageIndex = (this.state.imageIndex + delta + images.length) % images.length;
        const current = images[this.state.imageIndex];
        this.state.lightboxSrc = current.src;
        this.state.lightboxAlt = current.alt || "";
    }
}

function mountGalleryWidget() {
    const targets = document.querySelectorAll("[data-ld-gallery-app='1']");
    targets.forEach((target) => {
        if (target.dataset.mounted === "1") {
            return;
        }
        target.dataset.mounted = "1";
        mount(LifeDeportesGallery, target, {
            templates,
            dev: false,
        });
    });
}

if (document.readyState !== "loading") {
    mountGalleryWidget();
} else {
    document.addEventListener("DOMContentLoaded", mountGalleryWidget);
}

export default LifeDeportesGallery;
