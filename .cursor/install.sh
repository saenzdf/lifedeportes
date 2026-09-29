#!/usr/bin/env bash
# Idempotent bootstrap for the Life Deportes toolkit (Python + Node).
set -euo pipefail

cd "$(dirname "$0")/.."

# --- System packages (Python venv support + Tesseract OCR with Spanish) ---
if ! command -v tesseract >/dev/null 2>&1 \
  || ! python3 -c 'import ensurepip' >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    python3-venv python3-pip \
    tesseract-ocr tesseract-ocr-spa
fi

# --- Python virtualenv + dependencies ---
python3 -m venv .venv
./.venv/bin/python -m pip install --quiet --upgrade pip wheel
./.venv/bin/pip install --quiet \
  python-dotenv \
  -r odoo_website/lifedeportes_print_qc/requirements.txt \
  -r kapso/scripts/requirements-print-pdf.txt

# --- Node dependencies (xlsx-based parsers and test suites) ---
npm install

echo "Life Deportes environment ready."
