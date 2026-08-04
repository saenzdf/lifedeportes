#!/usr/bin/env python3
"""Dump staff Fredy Bram conversation messages."""
import json
import os
import urllib.request
from datetime import datetime, timezone
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
url = f"https://api.kapso.ai/meta/whatsapp/v24.0/{PHONE}/messages?conversation_id={CONV}&limit=50"
req = urllib.request.Request(
    url,
    headers={"X-API-Key": os.environ["KAPSO_API_KEY"], "User-Agent": "Mozilla/5.0"},
)
with urllib.request.urlopen(req, timeout=60) as resp:
    data = json.loads(resp.read().decode())

out = ROOT / "scratch" / "fredy_bram_staff_msgs.json"
out.write_text(json.dumps(data, indent=2, ensure_ascii=False))
msgs = data.get("data") or []


def ts(m):
    try:
        return int(m.get("timestamp") or 0)
    except Exception:
        return 0


for m in sorted(msgs, key=ts):
    direction = (m.get("kapso") or {}).get("direction") or "?"
    typ = m.get("type")
    if typ == "text":
        body = (m.get("text") or {}).get("body") or ""
    elif typ == "document":
        doc = m.get("document") or {}
        body = f"[DOC {doc.get('filename')}] mid={doc.get('id')}"
    elif typ == "image":
        img = m.get("image") or {}
        body = f"[IMG] caption={img.get('caption')} mid={img.get('id')}"
    else:
        body = str((m.get("kapso") or {}).get("content") or typ)[:200]
    when = datetime.fromtimestamp(ts(m), tz=timezone.utc).isoformat() if ts(m) else "?"
    print(f"{when} | {direction:8} | {typ:8} | {body[:240]}")

print("saved", out, "n=", len(msgs))
