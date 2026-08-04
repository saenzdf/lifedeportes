{
    "name": "Life Deportes — Tema y Home",
    "summary": "Replica la home de lifedeportes.com sobre Odoo Website (QWeb + OWL).",
    "description": """
Tema y página de inicio para Life Deportes sobre Odoo Website.

Incluye:
* Plantilla QWeb que replica las secciones de https://lifedeportes.com/
* Estilos SCSS con la paleta de marca
* JS vanilla para hero carousel, flip cards y contadores
* Componente OWL "ContactQuoteForm" como ejemplo de pieza interactiva
""",
    "version": "1.2.4",
    "license": "LGPL-3",
    "author": "Life Deportes / Diego",
    "website": "https://lifedeportes.com",
    "category": "Website/Theme",
    "depends": [
        "website",
        "website_crm",
    ],
    "data": [
        "views/header.xml",
        "views/footer.xml",
        "views/homepage.xml",
        "views/shop_landing_homepage.xml",
        "views/gallery_page.xml",
        "views/about_page.xml",
        "views/terms_page.xml",
        "data/gallery_merge.xml",
        "data/about_merge.xml",
    ],
    "assets": {
        "web.assets_frontend": [
            "lifedeportes_theme/static/src/scss/lifedeportes.scss",
            "lifedeportes_theme/static/src/js/homepage.js",
            "lifedeportes_theme/static/src/js/gallery_page.js",
            "lifedeportes_theme/static/src/js/contact_form_owl.js",
            "lifedeportes_theme/static/src/xml/contact_form.xml",
            "lifedeportes_theme/static/src/xml/gallery_page.xml",
        ],
    },
    "installable": True,
    "application": False,
}
