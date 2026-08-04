#!/usr/bin/env python3
"""Apply gallery team curation: max 2 photos per team/group.

Source of truth: assets/gallery_social/team_curation.json
Rejected files move to assets/gallery_social/_rejected/<category>/ (not deleted).

After apply, republish Odoo:
  scripts/update_odoo_gallery_from_social.py --from-assets --apply
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "gallery_social"
CURATION = ASSETS / "team_curation.json"
REJECTED = ASSETS / "_rejected"
CATEGORIES = ("futbol", "voleibol", "baloncesto", "sudaderas")


def load_curation() -> dict:
    if not CURATION.is_file():
        raise FileNotFoundError(CURATION)
    return json.loads(CURATION.read_text(encoding="utf-8"))


def disk_index() -> dict[str, Path]:
    out: dict[str, Path] = {}
    for cat in CATEGORIES:
        for p in (ASSETS / cat).glob("fb-*.jpg"):
            out[p.stem.removeprefix("fb-")] = p
    return out


def validate(curation: dict, on_disk: dict[str, Path]) -> tuple[list[str], list[str]]:
    kept: list[str] = []
    dropped: list[str] = []
    seen: set[str] = set()
    for team in curation["teams"]:
        photos = set(team["photos"])
        keep = team["keep"]
        drop = team["drop"]
        if len(keep) > 2:
            raise SystemExit(f"{team['team_key']}: keep has {len(keep)} > 2")
        if set(keep) | set(drop) != photos:
            raise SystemExit(f"{team['team_key']}: keep∪drop ≠ photos")
        for pid in photos:
            if pid in seen:
                raise SystemExit(f"photo {pid} in multiple teams")
            seen.add(pid)
        kept.extend(keep)
        dropped.extend(drop)

    missing = set(on_disk) - seen
    extra = seen - set(on_disk)
    if missing:
        raise SystemExit(f"on disk but not in curation: {sorted(missing)}")
    if extra:
        raise SystemExit(f"in curation but missing on disk: {sorted(extra)}")
    return kept, dropped


def apply(dropped: list[str], on_disk: dict[str, Path], dry_run: bool) -> None:
    REJECTED.mkdir(parents=True, exist_ok=True)
    for pid in dropped:
        src = on_disk[pid]
        dest = REJECTED / src.parent.name / src.name
        print(f"  REJECT {src.relative_to(ASSETS)} → _rejected/{src.parent.name}/{src.name}")
        if dry_run:
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dest))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    dry_run = not args.apply

    curation = load_curation()
    on_disk = disk_index()
    kept, dropped = validate(curation, on_disk)
    print(f"teams={len(curation['teams'])} keep={len(kept)} drop={len(dropped)}")
    apply(dropped, on_disk, dry_run)

    meta = {
        "rule": "max_2_photos_per_team",
        "teams": len(curation["teams"]),
        "kept": kept,
        "dropped": dropped,
        "curation_file": str(CURATION.relative_to(ROOT)),
    }
    meta_path = ASSETS / "curation_applied.json"
    if not dry_run:
        meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote {meta_path}")
    else:
        print("\nDry run. Re-run with --apply then:")
        print("  .venv/bin/python scripts/update_odoo_gallery_from_social.py --from-assets --apply")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
