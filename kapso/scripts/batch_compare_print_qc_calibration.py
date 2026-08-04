#!/usr/bin/env python3
"""
Batch: comparar varios pares lista+PDF (calibración fabricación humana).
Lee un manifest JSON y ejecuta compare_list_pdf_local con visión + modo dorsal.

Salida: un JSON por par y report.md con heuristic_dorsal_diff_labels.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

_KAPSO = Path(__file__).resolve().parents[1]
_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from compare_list_pdf_local import (  # noqa: E402
    heuristic_dorsal_diff_labels,
    name_normalize_enabled_from_env,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Batch QC calibración fabricación")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=_SCRIPTS / "calibration_manifest.sample.json",
        help="JSON con lista pairs: id, list_file, print_pdf (rutas relativas al directorio kapso)",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Directorio para *.json y report.md (por defecto memory/fabrication_calibration/out)",
    )
    parser.add_argument("--zoom", type=float, default=2.0)
    parser.add_argument("--max-side", type=int, default=4000)
    parser.add_argument(
        "--pdf-source",
        choices=("ocr", "vision"),
        default="vision",
        help="Por defecto vision (Gemini); ocr para pruebas rápidas sin API",
    )
    args = parser.parse_args()

    out_dir = args.out_dir
    if out_dir is None:
        out_dir = _KAPSO.parent / "memory" / "fabrication_calibration" / "out"
    out_dir = out_dir.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    data = json.loads(args.manifest.read_text(encoding="utf-8"))
    pairs = data.get("pairs")
    if not isinstance(pairs, list) or not pairs:
        sys.exit("manifest sin pairs[]")

    cmp_py = _SCRIPTS / "compare_list_pdf_local.py"
    results: list[dict] = []
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for pair in pairs:
        pid = str(pair.get("id") or "unnamed")
        lf = pair.get("list_file")
        pf = pair.get("print_pdf") or pair.get("pdf_file")
        if not lf or not pf:
            sys.exit(f"pair {pid}: faltan list_file / print_pdf")

        list_path = (Path(lf) if Path(lf).is_absolute() else _KAPSO / lf).resolve()
        pdf_path = (Path(pf) if Path(pf).is_absolute() else _KAPSO / pf).resolve()
        if not list_path.is_file():
            sys.exit(f"{pid}: no existe lista {list_path}")
        if not pdf_path.is_file():
            sys.exit(f"{pid}: no existe PDF {pdf_path}")

        cmd = [
            sys.executable,
            str(cmp_py),
            "--list-file",
            str(list_path),
            "--print-pdf",
            str(pdf_path),
            "--pdf-source",
            args.pdf_source,
            "--compare-mode",
            "dorsal",
            "--zoom",
            str(args.zoom),
            "--max-side",
            str(args.max_side),
        ]
        proc = subprocess.run(cmd, cwd=str(_KAPSO), capture_output=True, text=True)
        raw_out = proc.stdout.strip()
        if proc.returncode != 0:
            err = {
                "pair_id": pid,
                "error": "compare_failed",
                "stderr": proc.stderr,
                "stdout_tail": raw_out[-500:],
            }
            results.append(err)
            (out_dir / f"{pid}_error.json").write_text(
                json.dumps(err, indent=2, ensure_ascii=False), encoding="utf-8"
            )
            continue

        try:
            parsed = json.loads(raw_out)
        except json.JSONDecodeError:
            err = {"pair_id": pid, "error": "invalid_json_stdout", "stdout_tail": raw_out[-800:]}
            results.append(err)
            continue

        cmp_block = parsed.get("compare") or {}
        heur = heuristic_dorsal_diff_labels(
            cmp_block,
            name_normalize=name_normalize_enabled_from_env(),
        )
        row = {
            "pair_id": pid,
            "list_file": str(list_path),
            "print_pdf": str(pdf_path),
            "qc": parsed.get("qc"),
            "counts": parsed.get("counts"),
            "compare": cmp_block,
            "heuristic_labels": heur,
            "talla_mismatches": parsed.get("talla_mismatches"),
            "name_qc": parsed.get("name_qc"),
        }
        results.append(row)
        (out_dir / f"{pid}.json").write_text(
            json.dumps(row, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    # report.md
    lines = [
        f"# Calibración print QC ({ts})",
        "",
        f"- Manifest: `{args.manifest}`",
        f"- pdf_source: `{args.pdf_source}`",
        "",
    ]
    for r in results:
        pid = r.get("pair_id", "?")
        lines.append(f"## {pid}")
        if r.get("error"):
            lines.append(f"- **error:** `{r['error']}`")
            lines.append("")
            continue
        lines.append(f"- **qc:** `{r.get('qc')}`")
        counts = r.get("counts") or {}
        lines.append(
            f"- **counts:** excel={counts.get('excel_rows')} pdf={counts.get('pdf_rows')}"
        )
        heur = r.get("heuristic_labels") or {}
        md = heur.get("missing_details") or []
        if md:
            lines.append("- **heuristic (missing):**")
            for item in md:
                lines.append(f"  - `{item.get('label')}` missing={item.get('row')} paired={item.get('paired_extra')}")
        exd = heur.get("extra_details") or []
        if exd:
            lines.append("- **heuristic (extra):**")
            for item in exd:
                lines.append(f"  - `{item.get('label')}` extra={item.get('row')} paired={item.get('paired_missing')}")
        lines.append("")

    report_path = out_dir / "report.md"
    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"ok": True, "out_dir": str(out_dir), "pairs": len(results)}, indent=2))


if __name__ == "__main__":
    main()
