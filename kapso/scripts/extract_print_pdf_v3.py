#!/usr/bin/env python3
"""
extract_print_pdf_v3 — solo lectura / interpretación del PDF imprimible Life Deportes.

Enfoques (ver también docstring ampliado abajo):

  **Local (default)** — OCR v3 “espalda”:
    - Rasteriza el PDF (PyMuPDF).
    - Recorta varias regiones heurísticas (banda central, mitad inferior, franjas horizontales,
      columnas) donde suelen ir nombre + dorsal en rejillas de camisetas en planilla.
    - Pasa cada recorte por Tesseract y concatena; luego reutiliza parsers v1+v2 del proyecto.

  **Visión (opcional)** — API multimodal:
    - **Gemini (por defecto en `--vision-provider`):** `GEMINI_API_KEY` o `GOOGLE_API_KEY`,
      `--gemini-model` / `PRINT_QC_GEMINI_MODEL` (ej. `gemini-2.5-flash`). PNG en base64 en el JSON
      (`inline_data`), respuesta `application/json` con `{"rows":[...]}`.
    - **OpenAI-compatible:** `--vision-provider openai`, `OPENAI_API_KEY`, etc.

No realiza comparación con Excel; solo extrae filas candidatas del PDF.

Investigación / proyectos útiles (referencias para evolución):
  - Modelos visión open-weight: Qwen2.5-VL / Qwen3-VL (Apache-2, DocVQA, bounding boxes) — self-host con vLLM/Ollama si hay GPU.
  - PaddleOCR PP-Structure / layout analysis — lectura ordenada en documentos; pesado de deps (paddle).
  - Servicios: OpenAI / Google Gemini / Anthropic con imagen — buenos en layouts irregulares si hay presupuesto.

Uso:
  cd lifedeportes/kapso && . .venv-pdf/bin/activate
  python scripts/extract_print_pdf_v3.py --task 1748 --engine local
  python scripts/extract_print_pdf_v3.py --pdf /ruta/al.pdf --engine vision
"""

from __future__ import annotations

import argparse
import base64
import importlib.util
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

# --- Carga parsers / OCR base desde extract_print_pdf_local ---
_EP = Path(__file__).resolve().parent / "extract_print_pdf_local.py"
_spec = importlib.util.spec_from_file_location("extract_print_pdf_local", _EP)
_epdf = importlib.util.module_from_spec(_spec)
assert _spec.loader
_spec.loader.exec_module(_epdf)

load_dotenv = _epdf.load_dotenv
odoo_jsonrpc = _epdf.odoo_jsonrpc
pick_print_pdf = _epdf.pick_print_pdf
extract_text_fitz = _epdf.extract_text_fitz
extract_text_ocr = _epdf.extract_text_ocr
parse_three_token_lines = _epdf.parse_three_token_lines
parse_ocr_rows_v2 = _epdf.parse_ocr_rows_v2
merge_row_lists = _epdf.merge_row_lists
_default_tesseract_cmd = _epdf._default_tesseract_cmd  # noqa: SLF001


def load_pdf_bytes_task(task_id: int) -> tuple[bytes, str, int]:
    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env")
    base = os.environ.get("ODOO_URL", "").strip()
    db = os.environ.get("ODOO_DB", "").strip()
    user = os.environ.get("ODOO_USERNAME", "").strip()
    pwd = os.environ.get("ODOO_PASSWORD", "").strip()
    if not all([base, db, user, pwd]):
        sys.exit("Faltan credenciales Odoo en .env")
    uid = odoo_jsonrpc(base, "common", "authenticate", [db, user, pwd, {}])
    if not uid:
        sys.exit("authenticate failed")
    domain = [
        ["res_model", "=", "project.task"],
        ["res_id", "=", task_id],
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
        sys.exit(f"No hay PDF en task {task_id}")
    att_id = picked["id"]
    rows = odoo_jsonrpc(
        base,
        "object",
        "execute_kw",
        [db, uid, pwd, "ir.attachment", "read", [[att_id]], {"fields": ["name", "datas"]}],
    )
    att = rows[0]
    raw = base64.standard_b64decode(att["datas"])
    return raw, str(att.get("name") or ""), att_id


def pil_regions_for_jersey_sheet(img, *, strips: int = 8) -> list[tuple[str, Any]]:
    """Recortes heurísticos tipo ‘espalda / rejilla’ sobre planillas muy altas."""
    from PIL import Image

    regions: list[tuple[str, Image.Image]] = []
    w, h = img.size
    regions.append(("full", img))

    # Banda vertical central (muchas plantillas ponen columnas de camisetas)
    x0, x1 = int(w * 0.08), int(w * 0.92)
    regions.append(("center_vertical", img.crop((x0, int(h * 0.12), x1, int(h * 0.88)))))

    # Franja central en altura (nombres entre logos arriba y patrocinio abajo)
    regions.append(("middle_band", img.crop((0, int(h * 0.28), w, int(h * 0.72)))))

    # Mitad inferior (números grandes de dorsal a veces dominan abajo en cada celda)
    regions.append(("lower_half", img.crop((0, int(h * 0.48), w, h))))

    # Tiras horizontales — cada una se OCRiza aparte (reduce ‘mezcla’ vertical en carteles largos)
    for i in range(strips):
        y0 = i * h // strips
        y1 = (i + 1) * h // strips
        regions.append((f"strip_{i+1}_of_{strips}", img.crop((0, y0, w, y1))))

    # Izquierda / derecha (dos columnas de camisetas)
    regions.append(("left_half", img.crop((0, 0, w // 2, h))))
    regions.append(("right_half", img.crop((w // 2, 0, w, h))))

    return regions


def resize_cap(img, max_side: int):
    from PIL import Image

    w, h = img.size
    if max(w, h) <= max_side:
        return img
    sc = max_side / max(w, h)
    return img.resize((max(1, int(w * sc)), max(1, int(h * sc))), Image.Resampling.LANCZOS)


def ocr_image_to_text(image, *, lang: str, psm: int, tesseract_cmd: str | None) -> str:
    import pytesseract
    from PIL import ImageOps

    cmd = tesseract_cmd or _default_tesseract_cmd()
    pytesseract.pytesseract.tesseract_cmd = cmd
    if image.mode != "RGB":
        image = image.convert("RGB")
    cfg = f"--oem 1 --psm {psm}"
    return pytesseract.image_to_string(image, lang=lang, config=cfg)


def pipeline_local_multiregion(
    pdf_bytes: bytes,
    *,
    zoom: float,
    max_side: int,
    lang: str,
    psm: int,
    strips: int,
    tesseract_cmd: str | None,
    enhance: bool,
) -> tuple[str, dict]:
    import fitz  # PyMuPDF
    from PIL import Image, ImageOps

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    meta: dict = {"pages": doc.page_count, "regions": [], "engine": "local_v3_regions"}
    texts: list[str] = []

    mat = fitz.Matrix(zoom, zoom)
    for pidx in range(doc.page_count):
        page = doc[pidx]
        pix = page.get_pixmap(matrix=mat, alpha=False, colorspace=fitz.csRGB)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        img = resize_cap(img, max_side)
        if enhance:
            img = ImageOps.autocontrast(img)

        for label, reg in pil_regions_for_jersey_sheet(img, strips=strips):
            reg_r = resize_cap(reg, min(max_side, 4200))
            if enhance:
                reg_r = ImageOps.autocontrast(reg_r.convert("RGB"))
            txt = ocr_image_to_text(reg_r, lang=lang, psm=psm, tesseract_cmd=tesseract_cmd)
            chunk = f"\n### REGION {pidx+1}:{label} ###\n{txt}"
            texts.append(chunk)
            meta["regions"].append({"page": pidx + 1, "label": label, "chars": len(txt.strip())})
    doc.close()
    full_text = "\n".join(texts)
    meta["total_chars"] = len(full_text.strip())
    return full_text, meta


def tuples_to_json_rows(rows: list[tuple[str, str, str]]) -> list[dict[str, str]]:
    return [{"nombre_uniforme": a, "talla": b, "numero": c} for a, b, c in rows]


def parse_rows_from_model_text(assistant_text: str) -> tuple[list[dict[str, str]], dict]:
    """Extrae JSON `{"rows":[...]}` de la respuesta del modelo (markdown opcional)."""
    meta: dict = {"raw_chars": len(assistant_text)}
    m = re.search(r"\{[\s\S]*\}", assistant_text)
    if not m:
        return [], {**meta, "error": "no_json"}
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return [], {**meta, "error": "json_parse"}
    rows_in = data.get("rows") if isinstance(data, dict) else None
    if not isinstance(rows_in, list):
        return [], meta
    out: list[dict[str, str]] = []
    for r in rows_in:
        if not isinstance(r, dict):
            continue
        n = str(r.get("nombre_uniforme") or r.get("nombre") or "").strip()
        if not n:
            continue
        out.append(
            {
                "nombre_uniforme": n,
                "talla": str(r.get("talla") or "").strip(),
                "numero": str(r.get("numero") or "").strip(),
            }
        )
    return out, meta


def parse_merged(text: str, *, ocr: bool) -> list[tuple[str, str, str]]:
    v1 = parse_three_token_lines(text, ocr=ocr)
    if ocr:
        return merge_row_lists(v1, parse_ocr_rows_v2(text))
    return v1


VISION_PROMPT_ES = """
Imagen: Planilla de impresión textil (sublimación) con piezas de ropa despiezadas (mangas, dorsales, frontales, cuellos, pantalones/pantalonetas).
Pautas críticas de interpretación para la auditoría:
1. Orden de tallas: Las piezas suelen estar agrupadas por talla, generalmente de la más grande (Adulto XL/L/M...) a la más pequeña (Niño 14/12/10...).
2. Ubicación de la Talla: Busca la etiqueta de talla FUERA del área teñida o principal de impresión (cerca de los bordes de la pieza, el cuello o la pretina). Es un identificador externo crítico.
3. Identificación de Jugador: 
   - En CAMISETAS: El nombre y número dorsal están centrados en la pieza 'Dorsal' (espalda).
   - En PANTALONES/PANTALONETAS: El nombre o número puede estar en un lateral o cerca del ruedo.
4. Extracción de datos: Para cada conjunto de piezas de un jugador, extrae el Nombre exacto, la Talla identificada y el Número. 
5. Ignora: Países, patrocinios repetidos, logos decorativos sin datos de jugador y piezas sin personalización (como cuellos lisos).

Responde SOLO un JSON válido (sin markdown):
{"rows":[{"nombre_uniforme":"string","talla":"string","numero":"string"}]}
Usa talla vacía "" solo si en esa espalda no se ve ninguna talla; si no hay datos claros: {"rows":[]}"""


def vision_gemini_extract(
    png_bytes: bytes,
    *,
    api_key: str,
    model: str,
) -> tuple[list[dict[str, str]], dict]:
    """Google Gemini generateContent: PNG en base64 dentro del JSON (inline_data)."""
    from urllib.error import HTTPError
    from urllib.parse import urlencode
    from urllib.request import Request, urlopen

    b64 = base64.standard_b64encode(png_bytes).decode("ascii")
    endpoint = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    )
    url = f"{endpoint}?{urlencode({'key': api_key})}"
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": VISION_PROMPT_ES},
                    {"inline_data": {"mime_type": "image/png", "data": b64}},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.15,
            "responseMimeType": "application/json",
        },
    }
    req = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=180) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:1200]
        return [], {
            "provider": "gemini",
            "model": model,
            "error": "http",
            "status": e.code,
            "body": err_body,
        }

    meta: dict = {"provider": "gemini", "model": model}
    if raw.get("promptFeedback", {}).get("blockReason"):
        return [], {**meta, "error": "blocked", "feedback": raw["promptFeedback"]}
    cands = raw.get("candidates") or []
    if not cands:
        return [], {**meta, "error": "no_candidates", "raw_keys": list(raw.keys())}
    parts = (cands[0].get("content") or {}).get("parts") or []
    assistant = "".join(str(p.get("text") or "") for p in parts)
    meta["raw_chars"] = len(assistant)
    rows, pmeta = parse_rows_from_model_text(assistant)
    meta.update(pmeta)
    return rows, meta


def vision_openai_extract(
    png_bytes: bytes,
    *,
    api_key: str,
    model: str,
    base_url: str,
) -> tuple[list[dict[str, str]], dict]:
    """OpenAI-compatible chat completions con una imagen PNG."""
    from urllib.request import Request, urlopen

    b64 = base64.standard_b64encode(png_bytes).decode("ascii")
    url = base_url.rstrip("/") + "/chat/completions"
    body = {
        "model": model,
        "temperature": 0.1,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": VISION_PROMPT_ES},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{b64}"},
                    },
                ],
            }
        ],
    }
    req = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urlopen(req, timeout=180) as resp:
        raw = json.loads(resp.read().decode("utf-8"))
    assistant = raw["choices"][0]["message"]["content"]
    meta = {"provider": "openai", "model": model}
    rows, pmeta = parse_rows_from_model_text(assistant)
    meta.update(pmeta)
    return rows, meta


def render_full_page_png(pdf_bytes: bytes, zoom: float, max_side: int) -> bytes:
    import fitz  # PyMuPDF
    from PIL import Image  # noqa: F401  # used after fitz
    from io import BytesIO

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False, colorspace=fitz.csRGB)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    doc.close()
    w, h = img.size
    if max(w, h) > max_side:
        sc = max_side / max(w, h)
        img = img.resize((max(1, int(w * sc)), max(1, int(h * sc))), Image.Resampling.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def main() -> None:
    _vp_env = os.environ.get("PRINT_QC_VISION_PROVIDER", "").strip().lower()
    _default_vp = _vp_env if _vp_env in ("gemini", "openai") else "gemini"

    parser = argparse.ArgumentParser(description="PDF imprimible → filas (v3 local regiones + opción visión API).")
    parser.add_argument("--task", type=int, help="project.task id (descarga PDF desde Odoo)")
    parser.add_argument("--pdf", type=Path, help="PDF local en disco")
    parser.add_argument(
        "--engine",
        choices=("local", "vision", "hybrid"),
        default="local",
        help="local=OCR por regiones; vision=API multimodal; hybrid=local + visión (Gemini u OpenAI)",
    )
    parser.add_argument("--zoom", type=float, default=2.0)
    parser.add_argument("--max-side", type=int, default=4500)
    parser.add_argument("--lang", default="spa+eng")
    parser.add_argument("--psm", type=int, default=6)
    parser.add_argument("--strips", type=int, default=8, help="Franjas horizontales para OCR segmentado")
    parser.add_argument("--enhance", action="store_true")
    parser.add_argument("--tesseract", default="", help="Ruta al binario tesseract")
    parser.add_argument(
        "--vision-provider",
        choices=("gemini", "openai"),
        default=_default_vp,
        help="API de visión: gemini (por defecto) u openai",
    )
    parser.add_argument(
        "--gemini-model",
        default=os.environ.get("PRINT_QC_GEMINI_MODEL", "gemini-2.5-flash"),
        help="Modelo Gemini (REST v1beta models/…); gemini-2.0-flash puede dar 404 en cuentas nuevas",
    )
    parser.add_argument("--vision-model", default=os.environ.get("PRINT_QC_VISION_MODEL", "gpt-4o-mini"))
    parser.add_argument(
        "--vision-base-url",
        default=os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1"),
    )
    args = parser.parse_args()

    if args.pdf:
        pdf_bytes = args.pdf.read_bytes()
        pdf_name = args.pdf.name
        att_id = None
    elif args.task:
        pdf_bytes, pdf_name, att_id = load_pdf_bytes_task(args.task)
    else:
        sys.exit("Indica --task ID o --pdf ruta/archivo.pdf")

    tess = args.tesseract.strip() or os.environ.get("TESSERACT_CMD", "").strip() or None
    gemini_key = (
        os.environ.get("GEMINI_API_KEY", "").strip()
        or os.environ.get("GOOGLE_API_KEY", "").strip()
    )
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()

    text_layer, tl_meta = extract_text_fitz(pdf_bytes)

    result: dict[str, Any] = {
        "pdf_name": pdf_name,
        "attachment_id": att_id,
        "text_layer_chars": tl_meta.get("chars", 0),
    }

    rows_out: list[dict[str, str]] = []
    vision_meta: dict | None = None

    if args.engine == "vision":
        png = render_full_page_png(pdf_bytes, args.zoom, args.max_side)
        if args.vision_provider == "gemini":
            if not gemini_key:
                sys.exit("GEMINI_API_KEY o GOOGLE_API_KEY requerido para --vision-provider gemini")
            rows_out, vision_meta = vision_gemini_extract(
                png, api_key=gemini_key, model=args.gemini_model.strip()
            )
            result["mode"] = "vision_gemini"
        else:
            if not openai_key:
                sys.exit("OPENAI_API_KEY requerido para --vision-provider openai")
            rows_out, vision_meta = vision_openai_extract(
                png,
                api_key=openai_key,
                model=args.vision_model,
                base_url=args.vision_base_url,
            )
            result["mode"] = "vision_openai"
        result["vision"] = vision_meta
        result["vision_provider"] = args.vision_provider
        result["parse_stats"] = {"rows": len(rows_out)}
    else:
        # local | hybrid
        if (text_layer or "").strip():
            merged = parse_merged(text_layer, ocr=False)
            rows_out = tuples_to_json_rows(merged)
            result["mode"] = "text_layer_only"
            result["parse_stats"] = {"source": "fitz_text", "rows": len(rows_out)}
        else:
            ocr_text, local_meta = pipeline_local_multiregion(
                pdf_bytes,
                zoom=args.zoom,
                max_side=args.max_side,
                lang=args.lang,
                psm=args.psm,
                strips=args.strips,
                tesseract_cmd=tess,
                enhance=args.enhance,
            )
            merged = parse_merged(ocr_text, ocr=True)
            rows_out = tuples_to_json_rows(merged)
            result["mode"] = "local_v3_regions+tesseract"
            result["local_pipeline"] = local_meta
            result["parse_stats"] = {
                "rows": len(rows_out),
                "ocr_regions": len(local_meta.get("regions", [])),
            }

        if args.engine == "hybrid":
            use_gemini = args.vision_provider == "gemini" and gemini_key
            use_openai = args.vision_provider == "openai" and openai_key
            if use_gemini or use_openai:
                png = render_full_page_png(pdf_bytes, args.zoom, args.max_side)
                if use_gemini:
                    v_rows, vision_meta = vision_gemini_extract(
                        png, api_key=gemini_key, model=args.gemini_model.strip()
                    )
                    result["vision_provider"] = "gemini"
                else:
                    v_rows, vision_meta = vision_openai_extract(
                        png,
                        api_key=openai_key,
                        model=args.vision_model,
                        base_url=args.vision_base_url,
                    )
                    result["vision_provider"] = "openai"
                seen = {(r["nombre_uniforme"].upper(), r["talla"], r["numero"]) for r in rows_out}
                for r in v_rows:
                    k = (r["nombre_uniforme"].upper(), r["talla"], r["numero"])
                    if k not in seen:
                        seen.add(k)
                        rows_out.append(r)
                result["mode"] = str(result.get("mode")) + "+vision_merge"
                result["vision"] = vision_meta
                result["parse_stats"]["rows_after_merge"] = len(rows_out)
            else:
                need = (
                    "GEMINI_API_KEY o GOOGLE_API_KEY (--vision-provider gemini)"
                    if args.vision_provider == "gemini"
                    else "OPENAI_API_KEY (--vision-provider openai)"
                )
                result["vision_skipped"] = f"sin credencial: {need}"

    print(json.dumps({"ok": True, **result, "rows": rows_out}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
