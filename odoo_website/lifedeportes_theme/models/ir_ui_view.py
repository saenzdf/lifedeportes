# -*- coding: utf-8 -*-
import logging

from odoo import api, models

_logger = logging.getLogger(__name__)


class IrUiView(models.Model):
    _inherit = "ir.ui.view"

    @api.model
    def lifedeportes_merge_gallery_templates(self):
        """Copia el marcado LD sobre la página /gallery existente.

        La vista puede tener cualquier ``key`` (p. ej. ``website.gallery`` o
        ``website.galeria-de-disenos``); resolvemos desde ``website.page`` con
        ``url='/gallery'`` y combinamos con un fallback legacy ``website.gallery``.
        """
        source = self.env.ref(
            "lifedeportes_theme.gallery_ld_page", raise_if_not_found=False
        )
        if not source:
            _logger.warning("lifedeportes_theme: gallery_ld_page template not found")
            return True

        inner = (source.arch_db or source.arch or "").strip()
        if not inner:
            return True

        # Odoo puede almacenar la plantilla sin el envoltorio t-call; una página públic
        # REQUIERE t-call layout o el sitio pierde cabecera, assets y tema.
        if 't-call="website.layout"' not in inner[:1200]:
            inner = f'<t t-call="website.layout">\n{inner}\n</t>'

        Page = self.env["website.page"]
        pages_gallery = Page.search([("url", "=", "/gallery")])
        target_views = pages_gallery.mapped("view_id")

        # Compatibilidad: plantilla por defecto de Odoo usaba website.gallery.
        fallback = self.search([("key", "=", "website.gallery")])
        targets = target_views | fallback

        if not targets:
            _logger.info(
                "lifedeportes_theme: no website.page /gallery ni vista website.gallery; skip merge"
            )
            return True

        seen = self.env["ir.ui.view"]
        for view in targets:
            if view in seen:
                continue
            seen |= view
            key = view.key or "website.gallery"
            arch = inner
            if f't-name="{key}"' not in arch:
                arch = f'<t t-name="{key}">{inner}</t>'
            view.write({"arch_db": arch})
        meta = {
            "name": "Galería de diseños",
            "website_meta_title": (
                "Diseños de Uniformes de Fútbol, Voleibol y Baloncesto | Galería — Life Deportes"
            ),
            "website_meta_description": (
                "Fabricantes de uniformes deportivos: galería de diseños de fútbol, voleibol, "
                "baloncesto y sudaderas con sublimación digital — Colombia."
            ),
            "website_meta_keywords": (
                "uniformes deportivos Colombia, uniformes personalizados, "
                "galería fútbol baloncesto voleibol"
            ),
        }
        if pages_gallery:
            pages_gallery.write(meta)

        return True

    @api.model
    def lifedeportes_merge_about_templates(self):
        """Copia el marcado LD sobre páginas «Sobre nosotros» existentes.

        Busca ``website.page`` con URL típica (p. ej. /about-us, /about, /nosotros).
        En producción Life suele usarse ``/about-us`` y ``/gallery``.
        Cree la página en Sitio web → Páginas si aún no existe; al actualizar el tema
        esta función rellena el ``arch`` de la vista enlazada.
        """
        source = self.env.ref(
            "lifedeportes_theme.about_ld_page", raise_if_not_found=False
        )
        if not source:
            _logger.warning("lifedeportes_theme: about_ld_page template not found")
            return True

        inner = (source.arch_db or source.arch or "").strip()
        if not inner:
            return True

        if 't-call="website.layout"' not in inner[:1200]:
            inner = f'<t t-call="website.layout">\n{inner}\n</t>'

        Page = self.env["website.page"]
        about_urls = ["/about-us", "/about", "/nosotros", "/sobre-nosotros"]
        pages = Page.search([("url", "in", about_urls)])
        target_views = pages.mapped("view_id")

        if not target_views:
            _logger.info(
                "lifedeportes_theme: ninguna website.page en %s; "
                "cree una página (p. ej. URL /about-us) y vuelva a actualizar el módulo",
                ", ".join(about_urls),
            )
            return True

        meta_pages = pages.filtered(lambda p: p.url == "/about-us")
        if not meta_pages:
            meta_pages = pages.filtered(lambda p: p.url == "/about")
        if not meta_pages:
            meta_pages = pages.filtered(lambda p: p.url == "/nosotros")
        if not meta_pages:
            meta_pages = pages[:1]
        meta = {
            "website_meta_title": (
                "Sobre Nosotros | Uniformes deportivos Life Deportes — Colombia"
            ),
            "website_meta_description": (
                "Fabricación de uniformes personalizados con sublimación digital: "
                "fútbol, baloncesto, voleibol y sudaderas. Más de 20 años — Life Deportes."
            ),
            "website_meta_keywords": (
                "Life Deportes, uniformes personalizados, fabricantes uniformes Colombia"
            ),
        }

        seen = self.env["ir.ui.view"]
        for view in target_views:
            if view in seen:
                continue
            seen |= view
            key = view.key or "website.about-us"
            arch = inner
            if f't-name="{key}"' not in arch:
                arch = f'<t t-name="{key}">{inner}</t>'
            view.write({"arch_db": arch})

        if meta_pages:
            meta_pages.write(meta)

        return True
