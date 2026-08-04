# -*- coding: utf-8 -*-
"""Parse FORMATO PEDIDO LIFE Excel, optional JSON lines, and PDF text for print QC."""
import io
import json
import logging
import re
from collections import Counter

import openpyxl
import pdfplumber

_logger = logging.getLogger(__name__)

def normalize_token(value):
    if value is None:
        return ""
    s = str(value).strip().upper()
    s = re.sub(r"\s+", " ", s)
    s = s.replace("Á", "A").replace("É", "E").replace("Í", "I").replace("Ó", "O").replace("Ú", "U").replace("Ñ", "N")
    return s


def normalize_numero(value):
    if value is None:
        return ""
    s = str(value).strip().lstrip("#")
    if s.isdigit():
        return str(int(s))
    return normalize_token(s)


def row_key(nombre, talla, numero):
    return (normalize_token(nombre), normalize_token(talla), normalize_numero(numero))


def load_list_rows_from_json_bytes(data: bytes):
    """Future / LLM: JSON array or object with ``lines``; same canonical keys as Excel."""
    if not data:
        return []
    try:
        payload = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as err:
        _logger.warning("print_qc: JSON decode error: %s", err)
        return []
    if isinstance(payload, list):
        lines = payload
    elif isinstance(payload, dict) and "lines" in payload:
        lines = payload["lines"]
    else:
        return []
    out = []
    for line in lines:
        if not isinstance(line, dict):
            continue
        nombre = (
            line.get("nombre_uniforme")
            or line.get("nombre")
            or line.get("name")
            or line.get("NOMBRE EN UNIFORME")
        )
        talla = line.get("talla") or line.get("TALLA")
        numero = line.get("numero") or line.get("NUMERO") or line.get("numero_uniforme")
        if not nombre:
            continue
        out.append(
            {
                "nombre_uniforme": str(nombre).strip(),
                "talla": str(talla).strip() if talla else "",
                "numero": str(numero).strip() if numero else "",
            }
        )
    return out


def _sheet_candidates(wb):
    preferred = []
    for name in wb.sheetnames:
        low = name.lower()
        if "formato" in low and "life" in low:
            preferred.append(name)
    return preferred or list(wb.sheetnames)


def _scan_header_for_columns(ws, max_row=40, max_col=15):
    """Return (data_start_row_1based, col_nombre, col_talla, col_numero) or None."""
    for r in range(1, max_row + 1):
        for c in range(1, max_col + 1):
            val = ws.cell(row=r, column=c).value
            if val is None:
                continue
            text = str(val).upper()
            if "NOMBRE" in text and "UNIFORME" in text:
                col_nombre = c
                col_talla = c + 1
                col_num = c + 2
                return r + 1, col_nombre, col_talla, col_num
            if text.strip() in ("NOMBRE EN UNIFORME", "NOMBRE"):
                col_nombre = c
                col_talla = c + 1
                col_num = c + 2
                return r + 1, col_nombre, col_talla, col_num
    return None


def load_list_rows_from_xlsx_bytes(data: bytes):
    """Read lista from FORMATO PEDIDO LIFE or compatible xlsx (header scan + B5 path)."""
    if not data:
        return []
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=False, data_only=True)
    except Exception as err:
        _logger.warning("print_qc: openpyxl error: %s", err)
        return []
    out = []
    try:
        for sheet_name in _sheet_candidates(wb):
            ws = wb[sheet_name]
            sheet_rows = []
            header = _scan_header_for_columns(ws)
            if header:
                start_row, cn, ct, cnum = header
            else:
                start_row, cn, ct, cnum = 5, 2, 3, 4
            for r in range(start_row, start_row + 2000):
                nombre = ws.cell(row=r, column=cn).value
                if nombre is None or str(nombre).strip() == "":
                    continue
                talla = ws.cell(row=r, column=ct).value
                numero = ws.cell(row=r, column=cnum).value
                if str(nombre).strip().upper() in ("NOMBRE EN UNIFORME", "NOMBRE", "TOTAL", "SUBTOTAL"):
                    continue
                sheet_rows.append(
                    {
                        "nombre_uniforme": str(nombre).strip(),
                        "talla": str(talla).strip() if talla is not None else "",
                        "numero": str(numero).strip() if numero is not None else "",
                    }
                )
            if sheet_rows:
                out = sheet_rows
                break
    finally:
        wb.close()
    return out


def _parse_line_three_tokens(line):
    """Heuristic: last token numero, prev talla, rest nombre."""
    parts = line.strip().split()
    if len(parts) < 3:
        return None
    num_raw = parts[-1].lstrip("#")
    if not num_raw.isdigit():
        return None
    talla = parts[-2]
    if len(talla) > 10 or not re.match(r"^[A-Za-z0-9./\-]{1,10}$", talla):
        return None
    nombre = " ".join(parts[:-2]).strip()
    if len(nombre) < 2:
        return None
    return {
        "nombre_uniforme": nombre,
        "talla": talla.upper(),
        "numero": str(int(num_raw)),
    }


def extract_pdf_print_rows(data: bytes):
    """Extract (nombre, talla, numero) rows from PDF using pdfplumber text + line split."""
    if not data:
        return []
    rows = []
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                for raw_line in text.splitlines():
                    line = raw_line.strip()
                    if len(line) < 5:
                        continue
                    low = line.lower()
                    if "muestra" in low and "color" in low:
                        continue
                    parsed = _parse_line_three_tokens(line)
                    if parsed:
                        rows.append(parsed)
    except Exception as err:
        _logger.warning("print_qc: pdfplumber error: %s", err)
        return []
    return rows


def compare_row_multisets(excel_rows, pdf_rows):
    """Return dict: ok bool, counts, missing, extra, samples."""
    ex = [row_key(r["nombre_uniforme"], r["talla"], r["numero"]) for r in excel_rows if r.get("nombre_uniforme")]
    pr = [row_key(r["nombre_uniforme"], r["talla"], r["numero"]) for r in pdf_rows if r.get("nombre_uniforme")]
    c_ex = Counter(ex)
    c_pr = Counter(pr)
    missing = []
    extra = []
    for k, n in c_ex.items():
        diff = n - c_pr.get(k, 0)
        if diff > 0:
            missing.extend([k] * diff)
    for k, n in c_pr.items():
        diff = n - c_ex.get(k, 0)
        if diff > 0:
            extra.extend([k] * diff)
    ok = not missing and not extra
    return {
        "ok": ok,
        "excel_count": len(ex),
        "pdf_count": len(pr),
        "missing": missing,
        "extra": extra,
        "pdf_text_empty": len(pr) == 0 and len(ex) > 0,
    }


def format_qc_report_html(title, result, list_name, pdf_name):
    parts = [f"<p><b>{title}</b></p>"]
    parts.append(f"<p>Lista: {list_name or '—'}<br/>PDF: {pdf_name or '—'}</p>")
    if result.get("error"):
        parts.append(f"<p style='color:#a00'><b>Error:</b> {result['error']}</p>")
        return "".join(parts)
    st = result.get("compare") or {}
    if st.get("pdf_text_empty"):
        parts.append(
            "<p style='color:#a00'>No se extrajeron filas del PDF (¿escaneado o solo imagen?). "
            "Fase 2: OCR/IA o Kapso.</p>"
        )
    if st.get("ok"):
        parts.append("<p style='color:#080'><b>QC: OK</b> — Lista y PDF coinciden (multiconjunto).</p>")
    else:
        parts.append("<p style='color:#a00'><b>QC: CON DIFERENCIAS</b></p>")
        if st.get("missing"):
            parts.append("<p><b>Faltan en PDF (vs Excel):</b></p><ul>")
            for k in st["missing"][:50]:
                parts.append(f"<li>{k[0]} | Talla {k[1]} | #{k[2]}</li>")
            if len(st["missing"]) > 50:
                parts.append(f"<li>… y {len(st['missing']) - 50} más</li>")
            parts.append("</ul>")
        if st.get("extra"):
            parts.append("<p><b>Sobran en PDF (no están en Excel):</b></p><ul>")
            for k in st["extra"][:50]:
                parts.append(f"<li>{k[0]} | Talla {k[1]} | #{k[2]}</li>")
            if len(st["extra"]) > 50:
                parts.append(f"<li>… y {len(st['extra']) - 50} más</li>")
            parts.append("</ul>")
    parts.append(
        f"<p><small>Filas lista: {st.get('excel_count', 0)} · Filas PDF: {st.get('pdf_count', 0)}</small></p>"
    )
    return "".join(parts)
