#!/usr/bin/env bash
set -euo pipefail

# Run Odoo MCP against the Life Deportes TEST instance (.env).
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

export ODOO_TARGET="${ODOO_TARGET:-test}"
export ODOO_PREFIX="${ODOO_PREFIX:-LIFEDEPORTES}"
export ODOO_URL="${ODOO_LIFEDEPORTES_URL:-$ODOO_URL}"
export ODOO_DB="${ODOO_LIFEDEPORTES_DB:-$ODOO_DB}"
export ODOO_USERNAME="${ODOO_LIFEDEPORTES_USERNAME:-$ODOO_USERNAME}"
export ODOO_PASSWORD="${ODOO_LIFEDEPORTES_PASSWORD:-$ODOO_PASSWORD}"

# Accept legacy *-test-* hosts and current testlifesoluciones.odoo.com
is_test_url=0
case "$ODOO_URL" in
  *-test-*|*"testlifesoluciones"*|*"test-life"*|*"lifedeportes-test"*) is_test_url=1 ;;
esac
if [[ "$is_test_url" -ne 1 && "$ODOO_TARGET" == "test" ]]; then
  echo "Refusing to start Odoo MCP: ODOO_URL does not look like a test instance ($ODOO_URL)" >&2
  exit 1
fi

exec .venv/bin/python -m odoo_mcp
