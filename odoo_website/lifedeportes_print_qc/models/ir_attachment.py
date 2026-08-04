# -*- coding: utf-8 -*-
import logging

from odoo import api, models

_logger = logging.getLogger(__name__)


class IrAttachment(models.Model):
    _inherit = "ir.attachment"

    @api.model_create_multi
    def create(self, vals_list):
        attachments = super().create(vals_list)
        auto = (
            self.env["ir.config_parameter"]
            .sudo()
            .get_param("lifedeportes_print_qc.auto_qc_on_pdf_attach", "False")
        )
        if str(auto).lower() not in ("1", "true", "yes"):
            return attachments
        pdf_on_task = attachments.filtered(
            lambda a: a.res_model == "project.task"
            and a.res_id
            and a.mimetype == "application/pdf"
        )
        if pdf_on_task:
            try:
                self.env["project.task"].sudo()._lifedeportes_qc_from_attachments(pdf_on_task)
            except Exception:
                _logger.exception("lifedeportes_print_qc: hook on attachment create failed")
        return attachments
