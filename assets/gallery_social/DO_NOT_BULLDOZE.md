# DO NOT BULLDOZE — Galería trabajos reales

Estas fotos (`fb-*.jpg` activas) + `manifest.json` + **`team_curation.json`** son la fuente de la galería Odoo.

- Live: https://lifedeportes.odoo.com/gallery  
- **Regla:** máx. **2 fotos por equipo/grupo** (`team_curation.json` → `keep`).  
- Rechazadas: `_rejected/` — no volver a publicar sin editar la curación.  
- Apply: `scripts/curate_gallery_max_two_per_team.py --apply`  
- Publish: `scripts/update_odoo_gallery_from_social.py --from-assets --apply`  
- Wiki: `wiki/concepts/life-galeria-trabajos-reales.md`

**No** sobrescribir `/gallery` con `gallery_page.xml` (webps SEO).  
**No** `--remove-gallery` ni `--force-gallery-seed` sin decisión explícita.
