#!/usr/bin/env python3
"""Download Fredy Bram media via Kapso mirrored media_url."""
from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
for line in (ROOT / ".env").read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, _, v = line.partition("=")
    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

PHONE = "1095603153637786"
CONV = "d2af64e3-d7df-4ed0-8ca2-8c2ed0785d38"
OUT = ROOT / "scratch" / "fredy_bram_2026-07-27"
OUT.mkdir(parents=True, exist_ok=True)
key = os.environ["KAPSO_API_KEY"]

url = (
    f"https://api.kapso.ai/meta/whatsapp/v24.0/{PHONE}/messages"
    f"?conversation_id={CONV}&limit=50&fields=kapso(media_url)"
)
req = urllib.request.Request(
    url, headers={"X-API-Key": key, "User-Agent": "Mozilla/5.0"}
)
with urllib.request.urlopen(req, timeout=60) as resp:
    data = json.loads(resp.read().decode())

(OUT / "messages_with_media.json").write_text(
    json.dumps(data, indent=2, ensure_ascii=False)
)

for m in data.get("data") or []:
    typ = m.get("type")
    if typ not in ("document", "image"):
        continue
    obj = m.get(typ) or {}
    media_url = (m.get("kapso") or {}).get("media_url")
    mid = obj.get("id")
    if typ == "document":
        name = obj.get("filename") or f"doc_{mid}.bin"
    else:
        name = f"img_{mid}.jpg"
    print(typ, name, bool(media_url))
    if not media_url:
        continue
    req2 = urllib.request.Request(
        media_url, headers={"X-API-Key": key, "User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req2, timeout=120) as resp2:
        body = resp2.read()
    path = OUT / name
    path.write_bytes(body)
    print(" saved", path, len(body))
