from odoo import api, fields, models


class ProductTemplate(models.Model):
    _inherit = "product.template"

    x_ld_commercial_role = fields.Selection(
        selection=[
            ("base_uniform", "Uniforme base"),
            ("extra", "Extra / adicional"),
            ("design", "Diseño (interno)"),
        ],
        string="Rol comercial Life",
        help="Define cómo cuenta este producto en las reglas de pedido mínimo.",
    )

    @api.model
    def _ld_infer_commercial_role(self, name: str) -> str:
        lowered = (name or "").lower()
        if "diseño" in lowered or "diseno" in lowered:
            return "design"
        if "uniforme" in lowered:
            return "base_uniform"
        return "extra"
