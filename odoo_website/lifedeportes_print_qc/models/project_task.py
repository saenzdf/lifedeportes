# -*- coding: utf-8 -*-
"""Auditoría lista (Excel/JSON) vs PDF de impresión en tareas de proyecto.

Convenciones v1 (ver plan Life Deportes):
- Lista: .xlsx en la tarea (prioridad ``FORMATO PEDIDO LIFE``) o .json ``lines``;
  fallback a .xlsx del ``sale.order`` vinculado.
- Impresión: PDF (texto); .cdr no se dispara desde el hook (solo PDF).
- Etapa: por defecto solo en Fabricación (ids en ``ir.config_parameter``
  ``lifedeportes_print_qc.fabrication_stage_ids``); la acción manual ignora etapa.

Ejecución síncrona en ``create`` de adjuntos; PDFs muy pesados o escaneados
pueden requerir cola externa o Kapso en una fase posterior.
"""
import base64
import json
import logging
import re
import urllib.error
import urllib.request

from markupsafe import escape as markup_escape

from odoo import _, api, fields, models
from odoo.exceptions import UserError

from .print_qc_parser import (
    compare_row_multisets,
    extract_pdf_print_rows,
    format_qc_report_html,
    load_list_rows_from_json_bytes,
    load_list_rows_from_xlsx_bytes,
)

_logger = logging.getLogger(__name__)

LIST_XLSX_HINT = "FORMATO PEDIDO LIFE"
JSON_SUFFIX = ".json"


class ProjectTask(models.Model):
    _inherit = "project.task"

    ld_qc_list_attachment_id = fields.Many2one(
        "ir.attachment",
        string="Lista QC (Excel/JSON)",
        domain="[('res_model', '=', 'project.task'), ('res_id', '=', id)]",
        help="Opcional: fija el adjunto de lista. Si está vacío, se elige por nombre (FORMATO PEDIDO LIFE) o el .xlsx más reciente.",
    )
    ld_qc_print_attachment_id = fields.Many2one(
        "ir.attachment",
        string="Impresión QC (PDF)",
        domain="[('res_model', '=', 'project.task'), ('res_id', '=', id)]",
        help="Opcional: fija el PDF a auditar. Si está vacío, se usa el adjunto disparador o el PDF más reciente tipo ORDEN DE TRABAJO.",
    )

    def _ld_fabrication_stage_ids(self):
        param = (
            self.env["ir.config_parameter"]
            .sudo()
            .get_param("lifedeportes_print_qc.fabrication_stage_ids", default="36,32")
        )
        out = []
        for part in (param or "").split(","):
            part = part.strip()
            if part.isdigit():
                out.append(int(part))
        return out

    def _ld_skip_pdf_name(self, name):
        low = (name or "").lower()
        if "muestra" in low and "color" in low:
            return True
        if "adic" in low and "orden" not in low:
            return True
        return False

    def _ld_non_jersey_pdf_name(self, name):
        """PDF de pantalón / bermuda / etc.: no usar como arte de camiseta para QC."""
        low = (name or "").lower()
        if "pantal" in low or "bermuda" in low:
            return True
        if re.search(r"\bpant\b|pant\.\.|_pant| pant\.|\bpant\.|\(pant", low):
            return True
        if re.search(r"\bshorts?\b", low):
            return True
        return False

    def _ld_is_print_pdf_candidate(self, attachment):
        if attachment.mimetype != "application/pdf":
            return False
        if self._ld_skip_pdf_name(attachment.name):
            return False
        if self._ld_non_jersey_pdf_name(attachment.name):
            return False
        low = (attachment.name or "").lower()
        if "orden de trabajo" in low or "ordenes" in low:
            return True
        # Nombres tipo "CLIENTE 1820.pdf" (sin ORDEN en el nombre)
        return True

    def _ld_list_attachments_domain(self):
        self.ensure_one()
        return [
            ("res_model", "=", "project.task"),
            ("res_id", "=", self.id),
            "|",
            ("name", "ilike", ".xlsx"),
            ("name", "ilike", JSON_SUFFIX),
        ]

    def _ld_resolve_list_attachment(self):
        self.ensure_one()
        if self.ld_qc_list_attachment_id:
            return self.ld_qc_list_attachment_id
        Attachment = self.env["ir.attachment"].sudo()
        domain = self._ld_list_attachments_domain()
        atts = Attachment.search(domain, order="create_date desc, id desc")
        json_atts = [a for a in atts if (a.name or "").lower().endswith(JSON_SUFFIX)]
        if json_atts:
            return json_atts[0]
        xlsx = [a for a in atts if (a.name or "").lower().endswith(".xlsx")]
        preferred = [a for a in xlsx if LIST_XLSX_HINT.lower() in (a.name or "").lower()]
        if preferred:
            preferred.sort(key=lambda a: a.create_date or "", reverse=True)
            return preferred[0]
        if xlsx:
            xlsx.sort(key=lambda a: a.create_date or "", reverse=True)
            return xlsx[0]
        if self.sale_order_id:
            sod = [
                ("res_model", "=", "sale.order"),
                ("res_id", "=", self.sale_order_id.id),
                ("name", "ilike", ".xlsx"),
            ]
            so_xlsx = Attachment.search(sod, order="create_date desc, id desc", limit=5)
            preferred_so = [a for a in so_xlsx if LIST_XLSX_HINT.lower() in (a.name or "").lower()]
            if preferred_so:
                return preferred_so[0]
            if so_xlsx:
                return so_xlsx[0]
        return Attachment.browse()

    def _ld_pick_print_pdf_from_candidates(self, candidates, trigger_attachment=None):
        """Alineado con Kapso ``resolvePrintPdfId`` / ``pickFromPdfList``."""
        if not candidates:
            return None
        tid = trigger_attachment.id if trigger_attachment else None
        low_name = lambda a: (a.name or "").lower()
        if tid:
            tr = next((a for a in candidates if a.id == tid), None)
            if tr:
                return tr
        orden = [a for a in candidates if "orden de trabajo" in low_name(a)]
        if len(orden) == 1:
            return orden[0]
        if len(orden) > 1:
            orden.sort(key=lambda a: a.create_date or "", reverse=True)
            return orden[0]
        cam_hint = [
            a
            for a in candidates
            if re.search(r"\bcam\b", low_name(a))
            or "camiseta" in low_name(a)
            or "uniforme" in low_name(a)
            or "espalda" in low_name(a)
        ]
        if cam_hint:
            cam_hint.sort(key=lambda a: a.create_date or "", reverse=True)
            return cam_hint[0]
        if len(candidates) == 1:
            return candidates[0]
        sorted_c = sorted(candidates, key=lambda a: a.create_date or "", reverse=True)
        return sorted_c[0]

    def _ld_resolve_print_pdf(self, trigger_attachment=None):
        self.ensure_one()
        if self.ld_qc_print_attachment_id:
            return self.ld_qc_print_attachment_id
        Attachment = self.env["ir.attachment"].sudo()
        domain = [
            ("res_model", "=", "project.task"),
            ("res_id", "=", self.id),
            ("mimetype", "=", "application/pdf"),
        ]
        pdfs = Attachment.search(domain, order="create_date desc, id desc")
        candidates = [a for a in pdfs if self._ld_is_print_pdf_candidate(a)]
        picked = self._ld_pick_print_pdf_from_candidates(candidates, trigger_attachment)
        if picked:
            return picked
        if self.sale_order_id:
            sod = [
                ("res_model", "=", "sale.order"),
                ("res_id", "=", self.sale_order_id.id),
                ("mimetype", "=", "application/pdf"),
            ]
            sopdfs = Attachment.search(sod, order="create_date desc, id desc", limit=12)
            so_candidates = [a for a in sopdfs if self._ld_is_print_pdf_candidate(a)]
            picked_so = self._ld_pick_print_pdf_from_candidates(so_candidates, None)
            if picked_so:
                return picked_so
        return Attachment.browse()

    def _ld_attachment_bytes(self, att):
        if not att:
            return b""
        att = att.with_context(bin_size=False)
        if att.datas:
            return base64.b64decode(att.datas)
        return b""

    def _ld_load_list_rows(self, list_att):
        if not list_att:
            return [], "missing"
        name = (list_att.name or "").lower()
        raw = self._ld_attachment_bytes(list_att)
        if not raw:
            return [], "empty"
        if name.endswith(JSON_SUFFIX):
            return load_list_rows_from_json_bytes(raw), "json"
        if name.endswith(".xlsx"):
            return load_list_rows_from_xlsx_bytes(raw), "xlsx"
        return [], "unsupported"

    def _ld_run_print_qc(self, trigger_attachment=None, bypass_stage_check=False):
        self.ensure_one()
        stage_ids = self._ld_fabrication_stage_ids()
        if (
            not bypass_stage_check
            and stage_ids
            and self.stage_id.id not in stage_ids
        ):
            _logger.info(
                "print_qc skip task %s: stage %s not in %s",
                self.id,
                self.stage_id.id,
                stage_ids,
            )
            return
        list_att = self._ld_resolve_list_attachment()
        pdf_att = self._ld_resolve_print_pdf(trigger_attachment=trigger_attachment)
        result = {}
        if not list_att:
            result["error"] = "No hay Excel ni JSON de lista en la tarea (ni .xlsx en el pedido vinculado)."
        elif not pdf_att:
            result["error"] = "No hay PDF de impresión candidato en la tarea."
        else:
            rows, kind = self._ld_load_list_rows(list_att)
            if not rows:
                result["error"] = (
                    "No se pudieron leer filas desde el adjunto de lista "
                    f"({list_att.name!r}, tipo {kind})."
                )
            else:
                pdf_rows = extract_pdf_print_rows(self._ld_attachment_bytes(pdf_att))
                result["compare"] = compare_row_multisets(rows, pdf_rows)
        body = format_qc_report_html(
            "Auditoría lista vs impresión",
            result,
            list_att.name if list_att else None,
            pdf_att.name if pdf_att else None,
        )
        self.message_post(
            body=body,
            message_type="comment",
            subtype_xmlid="mail.mt_note",
        )

    @api.model
    def _lifedeportes_qc_from_attachments(self, attachments):
        """Called from automated action on ir.attachment (PDF on project.task)."""
        for att in attachments:
            if att.res_model != "project.task" or not att.res_id:
                continue
            if att.mimetype != "application/pdf":
                continue
            task = self.sudo().browse(att.res_id)
            if not task.exists():
                continue
            if task._ld_skip_pdf_name(att.name):
                continue
            if task._ld_non_jersey_pdf_name(att.name):
                continue
            try:
                task._ld_run_print_qc(trigger_attachment=att)
            except Exception:
                _logger.exception("print_qc failed task=%s att=%s", task.id, att.id)
                task.message_post(
                    body="<p><b>QC:</b> error interno al auditar; revisar logs.</p>",
                    message_type="comment",
                    subtype_xmlid="mail.mt_note",
                )

    def action_ld_print_qc_manual(self):
        for task in self:
            task._ld_run_print_qc(trigger_attachment=None, bypass_stage_check=True)
        return True

    def action_ld_print_qc_kapso(self):
        icp = self.env["ir.config_parameter"].sudo()
        for task in self:
            url = (icp.get_param("lifedeportes_print_qc.kapso_webhook_url") or "").strip()
            secret = (icp.get_param("lifedeportes_print_qc.kapso_webhook_secret") or "").strip()
            if not url or not secret:
                raise UserError(
                    _(
                        "Configure system parameters lifedeportes_print_qc.kapso_webhook_url "
                        "and lifedeportes_print_qc.kapso_webhook_secret "
                        "(Settings → Technical → Parameters)."
                    )
                )
            payload = json.dumps({"task_id": task.id, "event": "manual_odoo"}).encode("utf-8")
            req = urllib.request.Request(url, data=payload, method="POST")
            req.add_header("Content-Type", "application/json")
            req.add_header("X-LD-QC-Signature", secret)
            try:
                with urllib.request.urlopen(req, timeout=180) as resp:
                    status = resp.getcode()
                    raw = resp.read().decode("utf-8", errors="replace")
            except urllib.error.HTTPError as err:
                err_txt = ""
                if err.fp:
                    err_txt = err.read().decode("utf-8", errors="replace")
                task.message_post(
                    body=_(
                        "<p><b>QC Kapso:</b> HTTP %s — %s</p>"
                    )
                    % (err.code, markup_escape(err_txt[:2000])),
                    message_type="comment",
                    subtype_xmlid="mail.mt_note",
                )
                continue
            except urllib.error.URLError as err:
                task.message_post(
                    body=_("<p><b>QC Kapso:</b> error de conexión — %s</p>")
                    % (markup_escape(str(err.reason)),),
                    message_type="comment",
                    subtype_xmlid="mail.mt_note",
                )
                continue
            snippet = raw[:2000] + ("…" if len(raw) > 2000 else "")
            task.message_post(
                body=_("<p><b>QC Kapso:</b> HTTP %s</p><pre>%s</pre>")
                % (status, markup_escape(snippet)),
                message_type="comment",
                subtype_xmlid="mail.mt_note",
            )
        return True
