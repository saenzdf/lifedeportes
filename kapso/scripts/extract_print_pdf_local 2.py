#!/usr/bin/env python3
"""
Descarga un PDF de impresión desde Odoo (por project.task o ir.attachment) y:
  - extrae capa de texto con PyMuPDF, y/o
  - rasteriza con PyMuPDF y pasa Tesseract (PDF “como viene”: sin texto seleccionable).

Uso:
  .venv-pdf/bin/python scripts/extract_print_pdf_local.py --task 1748 --mode auto
  .venv-pdf/bin/python scripts/extract_print_pdf_local.py --attachment 21893 --mode ocr

Dependencias (venv):
  pip install pymupdf pytesseract pillow

Sistema: Tesseract (brew install tesseract tesseract-lang). Opcional: TESSERACT_CMD.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip()
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        os.environ.setdefault(k, v)
    # Mirror .envrc used with MCP
    os.environ.setdefault("ODOO_URL", os.environ.get("ODOO_LIFEDEPORTES_URL", ""))
    os.environ.setdefault("ODOO_DB", os.environ.get("ODOO_LIFEDEPORTES_DB", ""))
    os.environ.setdefault("ODOO_USERNAME", os.environ.get("ODOO_LIFEDEPORTES_USERNAME", ""))
    os.environ.setdefault("ODOO_PASSWORD", os.environ.get("ODOO_LIFEDEPORTES_PASSWORD", ""))


def odoo_jsonrpc(base_url: str, service: str, method: str, args: list) -> object:
    url = base_url.rstrip("/") + "/jsonrpc"
    body = json.dumps(
        {
            "jsonrpc": "2.0",
            "method": "call",
            "params": {"service": service, "method": method, "args": args},
        }
    ).encode("utf-8")
    req = Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=120) as resp:
            j = json.loads(resp.read().decode("utf-8", errors="replace"))
    except (HTTPError, URLError) as e:
        raise SystemExit(f"RPC error: {e}") from e
    if j.get("error"):
        raise SystemExit(f"Odoo error: {j['error']}")
    return j["result"]


def pick_print_pdf(attachments: list) -> dict | None:
    """Misma idea que print_qc_webhook_odoo.resolvePrintPdfId: evita PDFs de muestra."""
    if not attachments:
        return None

    def skip(name: str) -> bool:
        low = name.lower()
        if "muestra" in low and "color" in low:
            return True
        if "adic" in low and "orden" not in low:
            return True
        return False

    candidates = [a for a in attachments if not skip(str(a.get("name") or ""))]
    if not candidates:
        candidates = attachments
    orden = [a for a in candidates if "orden de trabajo" in str(a.get("name") or "").lower()]
    if len(orden) == 1:
        return orden[0]
    if len(orden) > 1:
        orden.sort(key=lambda a: str(a.get("create_date") or ""), reverse=True)
        return orden[0]
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        return None
    candidates.sort(key=lambda a: str(a.get("create_date") or ""), reverse=True)
    return candidates[0]


def extract_text_fitz(pdf_bytes: bytes) -> tuple[str, dict]:
    import fitz  # PyMuPDF

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    meta = {"pages": doc.page_count}
    parts = []
    for i in range(doc.page_count):
        page = doc[i]
        t = page.get_text("text") or ""
        parts.append(t)
    full = "\n".join(parts)
    meta["chars"] = len(full.strip())
    meta["has_images"] = any(doc[i].get_images() for i in range(doc.page_count))
    doc.close()
    return full, meta


def _tesseract_lines_from_image(img, *, lang: str, config: str) -> str:
    """Reconstruye líneas desde image_to_data (mejor orden que image_to_string en carteles)."""
    import pytesseract
    from pytesseract import Output

    data = pytesseract.image_to_data(img, lang=lang, config=config, output_type=Output.DICT)
    n = len(data["text"])
    lines_out: list[str] = []
    buf: list[str] = []
    cur_key: tuple[int, int, int] | None = None
    for i in range(n):
        t = str(data["text"][i] or "").strip()
        try:
            conf = int(data["conf"][i])
        except (ValueError, KeyError):
            conf = -1
        key = (int(data["block_num"][i]), int(data["par_num"][i]), int(data["line_num"][i]))
        if cur_key is not None and key != cur_key:
            if buf:
                lines_out.append(" ".join(buf))
            buf = []
        cur_key = key
        if not t:
            continue
        if conf >= 0 and conf < 12:
            continue
        buf.append(t)
    if buf:
        lines_out.append(" ".join(buf))
    return "\n".join(lines_out)


def _default_tesseract_cmd() -> str:
    for path in (
        os.environ.get("TESSERACT_CMD", "").strip(),
        "/opt/homebrew/bin/tesseract",
        "/usr/local/bin/tesseract",
        "/usr/bin/tesseract",
    ):
        if path and Path(path).is_file():
            return path
    return "tesseract"


def extract_text_ocr(
    pdf_bytes: bytes,
    *,
    zoom: float = 3.0,
    lang: str = "spa+eng",
    tesseract_cmd: str | None = None,
    psm: int = 6,
    max_side: int = 4500,
    ocr_engine: str = "string",
    enhance: bool = False,
) -> tuple[str, dict]:
    """Rasteriza cada página y OCR con Tesseract (para imprimibles solo gráficos)."""
    import fitz  # PyMuPDF
    from PIL import Image
    import pytesseract

    cmd = tesseract_cmd or _default_tesseract_cmd()
    pytesseract.pytesseract.tesseract_cmd = cmd

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    meta: dict = {
        "pages": doc.page_count,
        "zoom": zoom,
        "lang": lang,
        "psm": psm,
        "tesseract": cmd,
        "max_side": max_side,
        "ocr_engine": ocr_engine,
        "enhance": enhance,
    }
    mat = fitz.Matrix(zoom, zoom)
    parts: list[str] = []
    for i in range(doc.page_count):
        page = doc[i]
        pix = page.get_pixmap(matrix=mat, alpha=False, colorspace=fitz.csRGB)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        w, h = img.size
        if max(w, h) > max_side:
            scale = max_side / max(w, h)
            nw = max(1, int(w * scale))
            nh = max(1, int(h * scale))
            img = img.resize((nw, nh), Image.Resampling.LANCZOS)
        if enhance:
            from PIL import ImageOps

            img = ImageOps.autocontrast(img.convert("RGB"))
        cfg = f"--oem 1 --psm {psm}"
        if ocr_engine == "lines":
            text = _tesseract_lines_from_image(img, lang=lang, config=cfg)
        else:
            text = pytesseract.image_to_string(img, lang=lang, config=cfg)
        parts.append(text)
    doc.close()
    full = "\n".join(parts)
    meta["chars"] = len(full.strip())
    return full, meta


def _clean_ocr_line(line: str) -> str:
    s = line.replace("|", " ").replace("•", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


# --- OCR v2: segmentación + ventana deslizante (ruido tipo COLOMBIA, maquetas) ---

_OCR_NOISE_TOKENS = frozenset(
    {
        "colombia",
        "dire",
        "tire",
        "www",
        "http",
        "https",
        "sal",
        "ele",
        "dd",
        "aaa",
        "asas",
        "po",
        "tale",
        "dub",
        "aer",
        "brea",
        "nm",
        "mo",
        "ren",
        "ros",
        "vay",
        "zi",
        "lea",
        "laa",
    }
)


def _strip_token_punct(t: str) -> str:
    return t.strip().rstrip(".,;:!·")


def _normalize_dorsal_token(t: str) -> str | None:
    s = _strip_token_punct(t)
    s = s.replace("O", "0").replace("o", "0")
    s = re.sub(r"^#", "", s)
    if not s.isdigit():
        return None
    n = int(s)
    if 1 <= n <= 99:
        return str(n)
    return None


def _is_talla_token(t: str) -> bool:
    u = _strip_token_punct(t).upper().replace("O", "0")
    if len(u) == 1 and u in "SM":
        return True
    if re.match(r"^(XXS|XS|XL|XXL|2XL|3XL|4XL)$", u):
        return True
    if u == "L" or u == "M":
        return True
    if re.match(r"^\d{1,2}$", u):
        v = int(u)
        return 4 <= v <= 62
    return False


def _row_from_suffix(parts: list[str]) -> tuple[str, str, str] | None:
    """Últimos tres tokens: … nombre?, talla, dorsal (si cuadran)."""
    if len(parts) < 3:
        return None
    if len(parts) > 12:
        return None
    num_s = _normalize_dorsal_token(parts[-1])
    if not num_s:
        return None
    talla_raw = parts[-2]
    if not _is_talla_token(talla_raw):
        return None
    for tok in parts[:-2]:
        if _strip_token_punct(tok).isdigit():
            return None

    nombre = " ".join(parts[:-2]).strip()
    nombre = re.sub(r"^[\d\W_]+", "", nombre).strip()
    nombre = re.sub(r"[\d\W_]+$", "", nombre).strip()
    if len(nombre) < 2:
        return None
    if not re.search(r"[A-Za-zÁÉÍÓÚáéíóúÑñ]", nombre):
        return None
    first_tok = nombre.split()[0].lower() if nombre.split() else ""
    if first_tok in _OCR_NOISE_TOKENS:
        return None
    tr = talla_raw.strip()
    if tr.isdigit():
        talla_out = str(int(tr))
    else:
        talla_out = tr.upper()
    return (nombre, talla_out, num_s)


_OCR_MAX_ROW_TOKENS = 7
_OCR_MAX_NOMBRE_TOKENS = 5


def _sliding_rows_one_line(parts: list[str]) -> list[tuple[str, str, str]]:
    """Extrae filas: primero una coincidencia para toda la línea; si no, ventana acotada."""
    if len(parts) < 3:
        return []
    whole = _row_from_suffix(parts)
    if whole:
        return [whole]

    out: list[tuple[str, str, str]] = []
    i = 0
    n = len(parts)
    while i <= n - 3:
        matched = False
        for j in range(i + 3, min(i + _OCR_MAX_ROW_TOKENS, n) + 1):
            chunk = parts[i:j]
            if len(chunk) > _OCR_MAX_ROW_TOKENS:
                continue
            nombre_tokens = len(chunk) - 3
            if nombre_tokens > _OCR_MAX_NOMBRE_TOKENS:
                continue
            row = _row_from_suffix(chunk)
            if row:
                out.append(row)
                i = j
                matched = True
                break
        if not matched:
            i += 1
    return out


def _segment_ocr_blob(text: str) -> list[str]:
    """Parte el blob en líneas candidatas (menos ruido repetido en maquetas)."""
    t = text
    t = re.sub(r"\bCOLOMBIA\b", "\n", t, flags=re.I)
    t = re.sub(r"\bWWW\.?\s*", "\n", t, flags=re.I)
    t = re.sub(r"[=]{3,}", "\n", t)
    t = re.sub(r"[─\-]{4,}", "\n", t)
    lines: list[str] = []
    for raw in t.splitlines():
        line = _clean_ocr_line(raw)
        if len(line) < 4:
            continue
        low = line.lower()
        if low in _OCR_NOISE_TOKENS:
            continue
        if len(line) <= 4 and line.isalpha() and line.lower() in _OCR_NOISE_TOKENS:
            continue
        lines.append(line)
    return lines


def _regex_rows_global(text: str) -> list[tuple[str, str, str]]:
    """Patrones sueltos en todo el texto (nombres pegados al patrón talla+dorsal)."""
    rows: list[tuple[str, str, str]] = []
    pat = re.compile(
        r"\b([A-ZÁÉÍÓÚÑ][A-Za-záéíóúÑñ.'\s]{2,38}?)\s+([A-Za-z0-9]{1,4})\s+(\d{1,2})\b",
        re.UNICODE,
    )
    for m in pat.finditer(text):
        nombre, talla_w, num_w = m.group(1), m.group(2), m.group(3)
        nombre = _clean_ocr_line(nombre)
        parts = nombre.split() + [talla_w, num_w]
        row = _row_from_suffix(parts)
        if row:
            rows.append(row)
    return rows


def parse_ocr_rows_v2(text: str) -> list[tuple[str, str, str]]:
    """Parser OCR v2: segmentos + ventana deslizante + regex global; deduplicado."""
    seen: set[tuple[str, str, str]] = set()
    ordered: list[tuple[str, str, str]] = []

    def add(row: tuple[str, str, str]) -> None:
        key = (row[0].strip().upper(), row[1].strip().upper(), row[2])
        if key in seen:
            return
        seen.add(key)
        ordered.append(row)

    for seg in _segment_ocr_blob(text):
        seg = re.sub(r"[,|;•]", " ", seg)
        seg = _clean_ocr_line(seg)
        parts = seg.split()
        if len(parts) >= 3:
            for row in _sliding_rows_one_line(parts):
                add(row)
    for row in _regex_rows_global(text):
        add(row)
    return ordered


def merge_row_lists(
    *lists: list[tuple[str, str, str]],
) -> list[tuple[str, str, str]]:
    seen: set[tuple[str, str, str]] = set()
    out: list[tuple[str, str, str]] = []
    for lst in lists:
        for nombre, talla, num in lst:
            num_n = str(int(num)) if str(num).isdigit() else str(num)
            key = (nombre.strip().upper(), talla.strip().upper(), num_n)
            if key in seen:
                continue
            seen.add(key)
            out.append((nombre, talla, num_n))
    return out


def parse_three_token_lines(text: str, *, ocr: bool = False) -> list[tuple[str, str, str]]:
    """Heurística alineada al Kapso parsePdfLines (nombre + talla + número al final)."""
    rows: list[tuple[str, str, str]] = []
    talla_re = re.compile(r"^[A-Za-z0-9./-]{1,14}$")
    for raw in text.splitlines():
        line = _clean_ocr_line(raw) if ocr else raw.strip()
        if len(line) < 5:
            continue
        low = line.lower()
        if "muestra" in low and "color" in low:
            continue
        parts = line.split()
        if len(parts) < 3:
            continue
        num_raw = parts[-1].replace("#", "").replace("O", "0").replace("o", "0")
        if not num_raw.isdigit():
            continue
        talla = parts[-2]
        if not talla_re.match(talla):
            continue
        nombre = " ".join(parts[:-2]).strip()
        if len(nombre) < 2:
            continue
        rows.append((nombre, talla.upper(), str(int(num_raw))))
    return rows


def main() -> None:
    root = Path(__file__).resolve().parents[2]  # lifedeportes/
    env_path = root / ".env"
    load_dotenv(env_path)

    parser = argparse.ArgumentParser(description="Extrae texto del PDF imprimible desde Odoo.")
    parser.add_argument("--task", type=int, help="project.task id")
    parser.add_argument("--attachment", type=int, help="ir.attachment id (PDF)")
    parser.add_argument(
        "--mode",
        choices=("auto", "text", "ocr"),
        default="auto",
        help="auto: capa texto y si vacío → Tesseract; text: solo capa; ocr: solo Tesseract",
    )
    parser.add_argument("--zoom", type=float, default=3.0, help="Escala al rasterizar para OCR (p.ej. 2–4)")
    parser.add_argument("--lang", default="spa+eng", help="Idiomas Tesseract (p.ej. spa+eng)")
    parser.add_argument("--psm", type=int, default=6, help="Tesseract --psm (6 bloque, 11 texto disperso, 4 una columna)")
    parser.add_argument(
        "--max-side",
        type=int,
        default=4500,
        help="Redimensionar imagen antes de OCR si el lado mayor supera esto (evita fallos en PDFs muy altos)",
    )
    parser.add_argument(
        "--ocr-engine",
        choices=("string", "lines"),
        default="string",
        help="string=image_to_string (suele ir mejor en maquetas); lines=reconstrucción desde image_to_data",
    )
    parser.add_argument(
        "--enhance",
        action="store_true",
        help="Autocontraste PIL antes de OCR (probar si el arte es muy plano)",
    )
    parser.add_argument("--tesseract", default="", help="Ruta al binario tesseract si no está en PATH")
    parser.add_argument("--max-text", type=int, default=8000, help="Caracteres máx. de muestra de texto")
    parser.add_argument(
        "--parse",
        choices=("merge", "v1", "v2"),
        default="merge",
        help="Filas: v1=tres tokens por línea; v2=segmentación+ventana+regex; merge=v1+v2 (recomendado con OCR)",
    )
    args = parser.parse_args()

    base = os.environ.get("ODOO_URL", "").strip()
    db = os.environ.get("ODOO_DB", "").strip()
    user = os.environ.get("ODOO_USERNAME", "").strip()
    pwd = os.environ.get("ODOO_PASSWORD", "").strip()
    if not all([base, db, user, pwd]):
        sys.exit("Faltan ODOO_URL / ODOO_DB / ODOO_USERNAME / ODOO_PASSWORD (o ODOO_LIFEDEPORTES_*) en .env")

    uid = odoo_jsonrpc(base, "common", "authenticate", [db, user, pwd, {}])
    if not uid:
        sys.exit("Odoo authenticate failed")

    att_id: int | None = args.attachment
    att_name = ""

    if args.task and not att_id:
        domain = [
            ["res_model", "=", "project.task"],
            ["res_id", "=", args.task],
            ["mimetype", "=", "application/pdf"],
        ]
        pdfs = odoo_jsonrpc(
            base,
            "object",
            "execute_kw",
            [
                db,
                uid,
                pwd,
                "ir.attachment",
                "search_read",
                [domain],
                {"fields": ["id", "name", "create_date"], "order": "create_date desc, id desc", "limit": 30},
            ],
        )
        picked = pick_print_pdf(list(pdfs or []))
        if not picked:
            sys.exit(f"No hay PDF en project.task {args.task}")
        att_id = picked["id"]
        att_name = picked.get("name") or ""

    if not att_id:
        sys.exit("Indica --task N o --attachment N")

    rows = odoo_jsonrpc(
        base,
        "object",
        "execute_kw",
        [db, uid, pwd, "ir.attachment", "read", [[att_id]], {"fields": ["name", "datas"]}],
    )
    att = rows[0] if rows else None
    if not att or not att.get("datas"):
        sys.exit(f"No se pudo leer adjunto {att_id}")
    att_name = att.get("name") or att_name
    raw = base64.standard_b64decode(att["datas"])

    text_layer, meta_text = extract_text_fitz(raw)
    source = "text_layer"
    meta_out = dict(meta_text)
    text = text_layer

    tess = args.tesseract.strip() or os.environ.get("TESSERACT_CMD", "").strip() or None

    if args.mode == "ocr":
        text, meta_ocr = extract_text_ocr(
            raw,
            zoom=args.zoom,
            lang=args.lang,
            tesseract_cmd=tess,
            psm=args.psm,
            max_side=args.max_side,
            ocr_engine=args.ocr_engine,
            enhance=args.enhance,
        )
        source = "tesseract"
        meta_out = meta_ocr
    elif args.mode == "text":
        pass
    else:
        # auto
        if not text_layer.strip():
            text, meta_ocr = extract_text_ocr(
                raw,
                zoom=args.zoom,
                lang=args.lang,
                tesseract_cmd=tess,
                psm=args.psm,
                max_side=args.max_side,
                ocr_engine=args.ocr_engine,
                enhance=args.enhance,
            )
            source = "tesseract"
            meta_out = meta_ocr

    use_ocr_parser = source == "tesseract"
    v1 = parse_three_token_lines(text, ocr=use_ocr_parser)
    if args.parse == "v1":
        parsed = v1
        parse_stats = {"v1": len(v1), "v2": 0, "merged": len(parsed)}
    elif args.parse == "v2":
        parsed = parse_ocr_rows_v2(text) if use_ocr_parser else []
        parse_stats = {"v1": 0, "v2": len(parsed), "merged": len(parsed)}
    else:
        if use_ocr_parser:
            v2 = parse_ocr_rows_v2(text)
            parsed = merge_row_lists(v1, v2)
            parse_stats = {"v1": len(v1), "v2": len(v2), "merged": len(parsed)}
        else:
            parsed = v1
            parse_stats = {"v1": len(v1), "v2": 0, "merged": len(parsed)}

    print(
        json.dumps(
            {
                "attachment_id": att_id,
                "name": att_name,
                "source": source,
                "text_layer_chars": meta_text.get("chars", 0),
                "meta": meta_out,
                "parse": args.parse,
                "parse_stats": parse_stats,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    print("--- texto (recorte) ---")
    sample = text.strip()
    if len(sample) > args.max_text:
        sample = sample[: args.max_text] + "\n…"
    print(sample if sample else "(vacío)")
    print("--- filas heurísticas (nombre|talla|#) ---")
    print(json.dumps(parsed[:120], indent=2, ensure_ascii=False))
    print(f"total_filas_heurísticas: {len(parsed)}")


if __name__ == "__main__":
    main()
