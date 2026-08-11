#!/usr/bin/env bash
set -euo pipefail

# Run Odoo MCP against the Life Deportes PRODUCTION instance (.env).
cd "$(dirname "$0")/.."

if [[ ! -f ".env" ]]; then
  echo "Missing .env file in project root" >&2
  exit 1
fi

if [[ ! -x ".venv/bin/python" ]]; then
  echo "Missing .venv/bin/python. Create venv first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

# Force prod target/prefix AFTER sourcing .env (which pins ODOO_TARGET=test).
export ODOO_TARGET="prod"
export ODOO_PREFIX="LIFEDEPORTES_PROD"
export ODOO_URL="${ODOO_LIFEDEPORTES_PROD_URL:?Set ODOO_LIFEDEPORTES_PROD_URL in .env}"
export ODOO_DB="${ODOO_LIFEDEPORTES_PROD_DB:?Set ODOO_LIFEDEPORTES_PROD_DB in .env}"
export ODOO_USERNAME="${ODOO_LIFEDEPORTES_PROD_USERNAME:?Set ODOO_LIFEDEPORTES_PROD_USERNAME in .env}"
export ODOO_PASSWORD="${ODOO_LIFEDEPORTES_PROD_PASSWORD:?Set ODOO_LIFEDEPORTES_PROD_PASSWORD in .env}"

if [[ -z "$ODOO_URL" || -z "$ODOO_DB" || -z "$ODOO_PASSWORD" ]]; then
  echo "Missing production Odoo credentials in .env." >&2
  echo "Set ODOO_LIFEDEPORTES_PROD_URL, ODOO_LIFEDEPORTES_PROD_DB, ODOO_LIFEDEPORTES_PROD_PASSWORD" >&2
  exit 1
fi

if [[ "$ODOO_URL" == *"-test-"* ]]; then
  echo "Refusing to start Odoo MCP (prod): URL looks like a test instance ($ODOO_URL)" >&2
  exit 1
fi

if [[ "$ODOO_TARGET" != "prod" ]]; then
  echo "Refusing to start Odoo MCP (prod): ODOO_TARGET must be 'prod' (got '$ODOO_TARGET')" >&2
  exit 1
fi

exec .venv/bin/python -m odoo_mcp
