#!/usr/bin/env python3
"""Build GenerateImage prompts for camiseta 62 (dry-fit) and 685 (Dumonti) — 24 variants each."""

from __future__ import annotations

# Visual spec from Life Deportes catalog + lifedeportes.com gallery
MANGA = {
    "Corta": "short sleeves ending above elbow, standard soccer jersey cut",
    "Siza": "sleeveless tank top jersey, shoulders and arms bare, volleyball/athletics style",
    "China": "cap sleeve jersey with small fitted cap sleeves on shoulders, feminine athletic cut, NOT sleeveless",
    "Larga": "long sleeves extending to wrist with ribbed cuffs",
}
CUELLO = {
    "Cuello en V": "simple classic V-neck collar, clean edge",
    "Cuello Redondo": "round crew neck collar",
    "Cuello Personalizado o Sport": "V-neck with bold red white gray geometric diagonal stripe panels on shoulders and sides, sport cut",
}
BORDADO = {
    "Normal": "sublimation print only, no embroidery",
    "Con bordado": "plus a small raised embroidered team crest patch on left chest in white thread",
}
FABRIC = {
    62: "lightweight dry-fit polyester mesh texture, thin breathable sport fabric",
    685: "Dumonti fabric, slightly thicker structured polyester with premium smooth finish, more body than dry-fit",
}

BASE_STYLE = (
    "Professional e-commerce flat lay product photo on pure white background. "
    "Single sports jersey only (no shorts, no model). Navy blue base with red white gray geometric accents. "
    "Small white LIFE text logo on right chest. Photorealistic catalog quality, no watermarks."
)


def prompt(tid: int, manga: str, cuello: str, bordado: str) -> str:
    slug_m = manga.lower().replace(" ", "_")
    slug_c = "v" if "V" in cuello and "Sport" not in cuello else ("redondo" if "Redondo" in cuello else "sport")
    return (
        f"{BASE_STYLE} Fabric: {FABRIC[tid]}. "
        f"Neck: {CUELLO[cuello]}. Sleeves: {MANGA[manga]}. "
        f"Decoration: {BORDADO[bordado]}."
    ), f"camiseta-{tid}_{slug_m}_{slug_c}_{'bordado' if bordado != 'Normal' else 'normal'}.png"


def all_combos(tid: int) -> list[tuple[str, str, str, str]]:
    out = []
    for manga in ("Corta", "Siza", "China", "Larga"):
        for cuello in ("Cuello en V", "Cuello Redondo", "Cuello Personalizado o Sport"):
            for bordado in ("Normal", "Con bordado"):
                p, fn = prompt(tid, manga, cuello, bordado)
                out.append((p, fn, manga, cuello, bordado))
    return out


if __name__ == "__main__":
    import json
    for tid in (62, 685):
        items = [{"filename": fn, "prompt": p, "manga": m, "cuello": c, "bordado": b} for p, fn, m, c, b in all_combos(tid)]
        path = f"/tmp/camiseta_prompts_{tid}.json"
        open(path, "w").write(json.dumps(items, ensure_ascii=False, indent=2))
        print(f"Wrote {len(items)} prompts -> {path}")
