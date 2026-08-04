from odoo import api, models
from odoo.exceptions import ValidationError


class SaleOrder(models.Model):
    _inherit = "sale.order"

    @api.model
    def _ld_uniform_base_min_qty(self) -> int:
        value = (
            self.env["ir.config_parameter"]
            .sudo()
            .get_param("lifedeportes.uniform_base_min_qty", "6")
        )
        try:
            return max(1, int(value))
        except (TypeError, ValueError):
            return 6

    def _ld_role_for_line(self, line):
        role = line.product_id.product_tmpl_id.x_ld_commercial_role
        if role:
            return role
        return line.product_id.product_tmpl_id._ld_infer_commercial_role(line.product_id.display_name)

    def _ld_validate_commercial_minimum(self):
        min_qty = self._ld_uniform_base_min_qty()
        base_uniform_qty = 0.0
        extras_qty = 0.0
        camiseta_qty = 0.0

        for line in self.order_line:
            role = self._ld_role_for_line(line)
            if role == "design":
                continue
            qty = line.product_uom_qty
            if role == "base_uniform":
                base_uniform_qty += qty
                continue
            extras_qty += qty
            if "camiseta" in (line.product_id.display_name or "").lower():
                camiseta_qty += qty

        if base_uniform_qty == 0 and extras_qty == 0:
            raise ValidationError(
                self.env._(
                    "El pedido requiere mínimo %(min_qty)s uniformes completos como base.",
                    min_qty=min_qty,
                )
            )

        if base_uniform_qty == 0 and extras_qty > 0:
            if camiseta_qty > 0 and extras_qty == camiseta_qty:
                raise ValidationError(
                    self.env._(
                        "No se vende camiseta suelta. El pedido base es mínimo %(min_qty)s uniformes completos; "
                        "las camisetas van como adicional encima de esa base.",
                        min_qty=min_qty,
                    )
                )
            raise ValidationError(
                self.env._(
                    "Camisetas, banderas, medias y pantalonetas solo se venden como extra adicional "
                    "sobre un pedido base de mínimo %(min_qty)s uniformes completos.",
                    min_qty=min_qty,
                )
            )

        if 0 < base_uniform_qty < min_qty:
            raise ValidationError(
                self.env._(
                    "El pedido mínimo es %(min_qty)s uniformes completos por diseño. "
                    "Actualmente hay %(current)s uniformes en el pedido.",
                    min_qty=min_qty,
                    current=int(base_uniform_qty),
                )
            )

    @api.constrains("order_line")
    def _check_ld_commercial_minimum(self):
        for order in self:
            if not order.order_line:
                continue
            order._ld_validate_commercial_minimum()
