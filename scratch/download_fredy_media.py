#!/usr/bin/env python3
"""Download Fredy Bram staff media from Kapso message dump."""
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

SRC = ROOT / "scratch" / "fredy_bram_staff_msgs.json"
OUT = ROOT / "scratch" / "fredy_bram_2026-07-27"
OUT.mkdir(parents=True, exist_ok=True)
key = os.environ["KAPSO_API_KEY"]
data = json.loads(SRC.read_text())


def fetch(url: str, headers: dict) -> bytes:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


for m in data.get("data") or []:
    typ = m.get("type")
    if typ not in ("document", "image"):
        continue
    obj = m.get(typ) or {}
    mid = obj.get("id")
    url = obj.get("url")
    if typ == "document":
        name = obj.get("filename") or f"doc_{mid}.bin"
    else:
        name = f"img_{mid}.jpg"
    print("media", name, mid)

    body = None
    # 1) lookaside URL with Bearer / X-API-Key
    if url:
        for hdr in (
            {"Authorization": f"Bearer {key}", "User-Agent": "Mozilla/5.0"},
            {"X-API-Key": key, "User-Agent": "Mozilla/5.0"},
        ):
            try:
                body = fetch(url, hdr)
                print("  via lookaside", len(body))
                break
            except Exception as e:
                print("  lookaside fail", e)

    # 2) Kapso media metadata → url
    if body is None and mid:
        meta_url = f"https://api.kapso.ai/meta/whatsapp/v24.0/{mid}"
        try:
            meta = json.loads(
                fetch(meta_url, {"X-API-Key": key, "User-Agent": "Mozilla/5.0"}).decode()
            )
            print("  meta", {k: meta.get(k) for k in ("url", "mime_type", "file_size", "id")})
            murl = meta.get("url")
            if murl:
                body = fetch(
                    murl,
                    {
                        "Authorization": f"Bearer {key}",
                        "X-API-Key": key,
                        "User-Agent": "Mozilla/5.0",
                    },
                )
                print("  via meta url", len(body))
        except Exception as e:
            print("  meta fail", e)

    if body:
        path = OUT / name
        path.write_bytes(body)
        print("  saved", path)
    else:
        print("  MISSING")
