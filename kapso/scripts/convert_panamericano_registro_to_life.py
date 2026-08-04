#!/usr/bin/env python3
"""
Convierte Excel «Registro» panamericano/ajedrez → pestaña formato life.

Reglas Life Deportes (panamericano) — columnas del Registro:
- Uniforme (col.) = color del pedido (Azul Oscuro / Azul Claro)
- Camiseta = talla camiseta
- Pantaloneta = talla short del uniforme deportivo
- Sudadera = pantalón de sudadera (NO es la parte superior)
- Chaqueta = parte superior del conjunto de sudadera
- Medias = medias del uniforme; si falta, se infiere desde pestaña Listas por talla

Productos:
- Uniforme = camiseta + pantaloneta + medias
- Camiseta sola = solo columna Camiseta (+ pant. sudadera suelto en comentario si aplica)
- Sudadera completa = Chaqueta + Sudadera (pantalón) en la misma fila
- Chaqueta sola = Chaqueta sin Sudadera (pantalón) y sin camiseta, o tallas numéricas distintas (cam 10 / cha 12)
"""

from __future__ import annotations

import argparse
import re
from collections import Counter
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

LIFE_HEADERS = [
    "No.",
    "NOMBRE EN UNIFORME",
    "TALLA",
    "NUMERO",
    "Larga/Corta",
    "MAS",
    "FEM",
    "Camiseta",
    "Uniforme",
    "ARQUERO",
    "COMENTARIO",
]

SECTION_UNIFORMES = "Uniformes:"
SECTION_CAMISETAS = "Camisetas:"
SECTION_SUDADERAS = "Sudaderas:"
SECTION_CHAQUETAS = "Chaquetas solas:"
SECTION_REVISION = "Revisar (incompleto para uniforme):"


def has_val(value) -> bool:
    if value is None:
        return False
    s = str(value).strip()
    return s != "" and s.lower() not in ("0", "na", "n/a", "-", "none")


def compact(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def infer_gender(name: str) -> tuple[str, str]:
    """Heurística simple → (MAS, FEM) como X o vacío."""
    n = compact(name).lower()
    fem_hints = (
        "maria",
        "ana ",
        "ana",
        "sofia",
        "sara",
        "salome",
        "juanita",
        "rebeca",
        "valentina",
        "valery",
        "mama",
        "mamá",
        "papá",
    )
    if any(h in n for h in fem_hints) or n.endswith("a") and "jose" not in n and "jaime" not in n:
        # nombres masculinos en -a: Joshua, etc. — conservador: solo patrones claros
        if any(
            x in n
            for x in (
                "daniela",
                "juanita",
                "sofia",
                "sara",
                "salome",
                "rebeca",
                "valentina",
                "valery",
                "mama",
                "mamá",
            )
        ):
            return ("", "X")
    return ("X", "")


def is_numeric_size(value) -> bool:
    return compact(value).isdigit()


def is_chaqueta_sola(cam, cha, sud) -> bool:
    """
    Chaqueta suelta solo si no hay pantalón de sudadera en la fila y:
    - no hay camiseta, o
    - camiseta y chaqueta son tallas numéricas distintas (ej. cam 10 / cha 12).
    Si hay camiseta con la misma talla alfabérica (M/M, XS/S), la chaqueta no cuenta aparte.
    """
    if not has_val(cha) or has_val(sud):
        return False
    if not has_val(cam):
        return True
    if compact(cam) == compact(cha):
        return False
    return is_numeric_size(cam) and is_numeric_size(cha)


def read_medias_lookup(path: Path) -> dict[str, str]:
    """Pestaña Listas: talla numérica → rango medias."""
    wb = openpyxl.load_workbook(path, data_only=True)
    if "Listas" not in wb.sheetnames:
        return {}
    ws = wb["Listas"]
    lookup: dict[str, str] = {}
    for r in range(2, ws.max_row + 1):
        talla = ws.cell(r, 2).value
        medias = ws.cell(r, 3).value
        if talla is not None and medias is not None:
            lookup[compact(talla).upper()] = compact(medias)
    return lookup


def infer_medias(
    pantaloneta,
    camiseta,
    medias_lookup: dict[str, str],
) -> str | None:
    """Infiera medias por talla de pantaloneta o camiseta (Listas)."""
    for size in (pantaloneta, camiseta):
        if not has_val(size):
            continue
        key = compact(size).upper()
        if key in medias_lookup:
            return medias_lookup[key]
    return None


def read_registro(path: Path) -> tuple[list[dict], dict[str, str]]:
    wb = openpyxl.load_workbook(path, data_only=True)
    medias_lookup = read_medias_lookup(path)
    if "Registro" not in wb.sheetnames:
        raise SystemExit(f"No hay pestaña Registro en {path}")
    ws = wb["Registro"]
    headers = {
        c: ws.cell(1, c).value for c in range(1, ws.max_column + 1) if ws.cell(1, c).value
    }
    rows = []
    for r in range(2, ws.max_row + 1):
        rec = {headers[c]: ws.cell(r, c).value for c in headers}
        if not compact(rec.get("Nombre")):
            continue
        rec["_source_row"] = r
        rows.append(rec)
    return rows, medias_lookup


def build_life_rows(
    source_rows: list[dict],
    medias_lookup: dict[str, str] | None = None,
) -> tuple[list[dict], list[str], Counter]:
    buckets: dict[str, list[dict]] = {
        SECTION_UNIFORMES: [],
        SECTION_CAMISETAS: [],
        SECTION_SUDADERAS: [],
        SECTION_CHAQUETAS: [],
        SECTION_REVISION: [],
    }
    warnings: list[str] = []
    counts: Counter = Counter()

    def add(section: str, row: dict) -> None:
        buckets[section].append(row)
        key = section.rstrip(":").lower()
        if key.startswith("revisar"):
            counts["revisar"] += 1
        else:
            counts[key] += 1

    medias_lookup = medias_lookup or {}

    for rec in source_rows:
        nombre = compact(rec.get("Nombre"))
        color = compact(rec.get("Uniforme"))
        cam = rec.get("Camiseta")
        pan = rec.get("Pantaloneta")
        med = rec.get("Medias")
        sud = rec.get("Sudadera")  # pantalón de sudadera
        cha = rec.get("Chaqueta")  # parte superior sudadera / chaqueta
        obs = compact(rec.get("Observaciones"))
        src = rec.get("_source_row")
        mas, fem = infer_gender(nombre)

        base_comment = color
        if obs:
            base_comment = f"{base_comment} · {obs}" if base_comment else obs

        medias_efectivas = compact(med) if has_val(med) else ""
        medias_inferida = False
        if not medias_efectivas and has_val(cam) and has_val(pan):
            inferred = infer_medias(pan, cam, medias_lookup)
            if inferred:
                medias_efectivas = inferred
                medias_inferida = True
                warnings.append(
                    f"Fila Registro {src} ({nombre}): medias inferidas {inferred} desde Listas (talla {compact(pan) or compact(cam)})"
                )

        is_uniform = has_val(cam) and has_val(pan) and bool(medias_efectivas)
        cam_pan_no_med = has_val(cam) and has_val(pan) and not bool(medias_efectivas)

        if is_uniform:
            comment = base_comment
            parts = [f"Pant. {compact(pan)}", f"Medias {medias_efectivas}"]
            if medias_inferida:
                parts[-1] = f"Medias {medias_efectivas} (inferida Listas)"
            if compact(cam) != compact(pan):
                parts.insert(0, f"Cam {compact(cam)}")
            comment = f"{comment} · {' · '.join(parts)}" if comment else " · ".join(parts)
            add(
                SECTION_UNIFORMES,
                {
                    "nombre": nombre,
                    "talla": compact(cam),
                    "numero": "",
                    "manga": "Corta",
                    "mas": mas,
                    "fem": fem,
                    "camiseta": "",
                    "uniforme": "X",
                    "arquero": "",
                    "comentario": comment,
                    "_source_row": src,
                },
            )
        elif has_val(cam):
            comment = base_comment
            extras: list[str] = []
            # Sudadera (col.) = pantalón suelto, sin chaqueta superior en la misma fila
            if has_val(sud) and not has_val(cha):
                extras.append(f"Pant. sudadera {compact(sud)}")
            if cam_pan_no_med:
                extras.append(f"Pant. {compact(pan)} · sin medias en Listas para inferir")
                warnings.append(
                    f"Fila Registro {src} ({nombre}): camiseta+pantaloneta sin medias inferibles → camiseta sola"
                )
                add(
                    SECTION_REVISION,
                    {
                        "nombre": nombre,
                        "talla": compact(cam),
                        "numero": "",
                        "manga": "Corta",
                        "mas": mas,
                        "fem": fem,
                        "camiseta": "X",
                        "uniforme": "",
                        "arquero": "",
                        "comentario": " · ".join([comment] + extras) if comment or extras else "",
                        "_source_row": src,
                    },
                )
                extras = []  # ya registrado en revisar
            if extras:
                comment = f"{comment} · {' · '.join(extras)}" if comment else " · ".join(extras)
            if not cam_pan_no_med:
                add(
                    SECTION_CAMISETAS,
                    {
                        "nombre": nombre,
                        "talla": compact(cam),
                        "numero": "",
                        "manga": "Corta",
                        "mas": mas,
                        "fem": fem,
                        "camiseta": "X",
                        "uniforme": "",
                        "arquero": "",
                        "comentario": comment,
                        "_source_row": src,
                    },
                )
        elif cam_pan_no_med:
            warnings.append(f"Fila Registro {src} ({nombre}): pantaloneta sin camiseta — omitida")

        # Sudadera completa = chaqueta (superior) + sudadera (pantalón)
        if has_val(cha) and has_val(sud):
            comment = base_comment
            parts = ["Sudadera completa"]
            if compact(cha) != compact(sud):
                parts.append(f"Chaq. {compact(cha)} · Pant. sudadera {compact(sud)}")
            comment = f"{comment} · {' · '.join(parts)}" if comment else " · ".join(parts)
            add(
                SECTION_SUDADERAS,
                {
                    "nombre": nombre,
                    "talla": compact(cha),
                    "numero": "",
                    "manga": "",
                    "mas": "",
                    "fem": "",
                    "camiseta": "",
                    "uniforme": "",
                    "arquero": "",
                    "comentario": comment,
                    "_source_row": src,
                },
            )
        elif is_chaqueta_sola(cam, cha, sud):
            comment = f"{base_comment} · Chaqueta sola" if base_comment else "Chaqueta sola"
            add(
                SECTION_CHAQUETAS,
                {
                    "nombre": nombre,
                    "talla": compact(cha),
                    "numero": "",
                    "manga": "",
                    "mas": "",
                    "fem": "",
                    "camiseta": "",
                    "uniforme": "",
                    "arquero": "",
                    "comentario": comment,
                    "_source_row": src,
                },
            )
        elif has_val(sud) and not has_val(cam):
            comment = (
                f"{base_comment} · Pant. sudadera {compact(sud)} (sin chaqueta ni camiseta)"
                if base_comment
                else f"Pant. sudadera {compact(sud)} (sin chaqueta ni camiseta)"
            )
            warnings.append(
                f"Fila Registro {src} ({nombre}): solo pantalón de sudadera sin camiseta — revisar"
            )
            add(
                SECTION_REVISION,
                {
                    "nombre": nombre,
                    "talla": compact(sud),
                    "numero": "",
                    "manga": "",
                    "mas": "",
                    "fem": "",
                    "camiseta": "",
                    "uniforme": "",
                    "arquero": "",
                    "comentario": comment,
                    "_source_row": src,
                },
            )

        if (
            not has_val(cam)
            and not has_val(pan)
            and not has_val(med)
            and not has_val(sud)
            and not has_val(cha)
        ):
            warnings.append(f"Fila Registro {src} ({nombre}): sin prendas reconocidas")

    out: list[dict] = []
    for section in (
        SECTION_UNIFORMES,
        SECTION_CAMISETAS,
        SECTION_SUDADERAS,
        SECTION_CHAQUETAS,
        SECTION_REVISION,
    ):
        for row in buckets[section]:
            row["_section"] = section
            out.append(row)

    return out, warnings, counts


def write_life_workbook(
    life_rows: list[dict],
    warnings: list[str],
    counts: Counter,
    source_path: Path,
    out_path: Path,
) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "formato life"

    header_fill = PatternFill("solid", fgColor="1F4E79")
    header_font = Font(color="FFFFFF", bold=True)
    section_fill = PatternFill("solid", fgColor="D9E1F2")
    section_font = Font(bold=True)

    meta = [
        ("Pedido", "Panamericano Ajedrez — convertido desde Registro"),
        ("Origen", str(source_path.name)),
        ("Regla uniforme", "Camiseta + pantaloneta + medias (medias inferidas desde Listas si faltan)"),
        ("Columna Sudadera", "Pantalón de sudadera — no es la parte superior"),
        ("Columna Chaqueta", "Parte superior; con Sudadera = sudadera completa"),
        ("Uniformes", counts.get("uniformes", 0)),
        ("Camisetas", counts.get("camisetas", 0)),
        ("Sudaderas", counts.get("sudaderas", 0)),
        ("Chaquetas solas", counts.get("chaquetas solas", 0)),
        ("Regla chaqueta sola", "Solo sin pant. sudadera; si hay camiseta, solo si tallas numéricas distintas"),
        ("Revisar", counts.get("revisar", 0)),
    ]
    for i, (k, v) in enumerate(meta, start=1):
        ws.cell(i, 1, k)
        ws.cell(i, 2, v)

    start = len(meta) + 2
    for col, h in enumerate(LIFE_HEADERS, start=1):
        cell = ws.cell(start, col, h)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", wrap_text=True)

    row_idx = start + 1
    seq = 0
    current_section = None
    for item in life_rows:
        section = item["_section"]
        if section != current_section:
            current_section = section
            ws.cell(row_idx, 2, section)
            ws.cell(row_idx, 2).fill = section_fill
            ws.cell(row_idx, 2).font = section_font
            row_idx += 1

        seq += 1
        values = [
            seq,
            item["nombre"],
            item["talla"],
            item["numero"],
            item["manga"],
            item["mas"],
            item["fem"],
            item["camiseta"],
            item["uniforme"],
            item["arquero"],
            item["comentario"],
        ]
        for col, val in enumerate(values, start=1):
            ws.cell(row_idx, col, val)
        row_idx += 1

    for col in range(1, len(LIFE_HEADERS) + 1):
        ws.column_dimensions[get_column_letter(col)].width = 16 if col != 2 else 28
    ws.column_dimensions["K"].width = 42

    ws2 = wb.create_sheet("conversion_log")
    ws2.append(["tipo", "mensaje"])
    ws2.append(["resumen", f"uniformes={counts.get('uniformes',0)} camisetas={counts.get('camisetas',0)} sudaderas={counts.get('sudaderas',0)} chaquetas_solas={counts.get('chaquetas solas',0)} revisar={counts.get('revisar',0)}"])
    for w in warnings:
        ws2.append(["warning", w])

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "input",
        nargs="?",
        default="../../scratch/javier_panamericano/pedidos_panamericano_ajedrez.xlsx",
        help="Excel origen (pestaña Registro)",
    )
    parser.add_argument(
        "-o",
        "--output",
        default="../../scratch/javier_panamericano/FORMATO_LIFE_panamericano_ajedrez.xlsx",
        help="Excel destino formato life",
    )
    args = parser.parse_args()
    script_dir = Path(__file__).resolve().parent
    source = (script_dir / args.input).resolve()
    output = (script_dir / args.output).resolve()

    source_rows, medias_lookup = read_registro(source)
    life_rows, warnings, counts = build_life_rows(source_rows, medias_lookup)
    write_life_workbook(life_rows, warnings, counts, source, output)

    print(f"Origen: {source} ({len(source_rows)} filas Registro)")
    print(f"Salida: {output}")
    print(
        "Filas Life:",
        dict(counts),
        f"| total {sum(counts.values())} | warnings {len(warnings)}",
    )


if __name__ == "__main__":
    main()
