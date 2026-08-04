---
name: odoo-mcp-multi-instance
description: Manage multiple Odoo company instances in this workspace using MCP and API publish flows. Use when modifying Odoo websites (QWeb, OWL, Python), mapping company-scoped env vars, or publishing pages via RPC.
disable-model-invocation: true
---

# Odoo MCP Multi-Instance

## Scope

Use this skill when working on Odoo websites in this workspace with company-scoped credentials, for example:
- `ODOO_LIFEDEPORTES_URL`, `ODOO_LIFEDEPORTES_DB`, `ODOO_LIFEDEPORTES_USERNAME`, `ODOO_LIFEDEPORTES_PASSWORD`
- another company like `PLASTINORTE` with the same naming pattern.

This skill standardizes how to:
- pick the correct company instance,
- map env vars to scripts expecting generic `ODOO_URL/DB/LOGIN/PASSWORD`,
- reinterpret external pages to native Odoo Website (`QWeb + snippets + OWL`),
- publish via API/RPC safely and verify the result.

## Required rule (workspace-aware company switch)

Always assume you are in this workspace first.  
When the target company changes (example: user asks for Plastinorte), do this before any publish call:

1. Inspect MCP-related JSON files in the current workspace (for example files named like `mcp*.json`).
2. Confirm the company-specific variable names defined there and/or in `.env`.
3. Use that exact company token in the variable names (`LIFEDEPORTES`, `PLASTINORTE`, etc.).
4. Export generic runtime vars expected by scripts:
   - `ODOO_URL="$ODOO_<COMPANY>_URL"`
   - `ODOO_DB="$ODOO_<COMPANY>_DB"`
   - `ODOO_LOGIN="$ODOO_<COMPANY>_USERNAME"`
   - `ODOO_PASSWORD="$ODOO_<COMPANY>_PASSWORD"`

Never assume company credentials; always discover them from workspace config first.

## Website implementation standard (Odoo native)

When recreating pages from internet references:

1. Keep base page in QWeb:
   - `views/*.xml` with `t-call="website.layout"`
   - sections built from native Website structure (`oe_structure`, `s_*` blocks where applicable).
2. Keep interactive behavior in OWL:
   - JS in `static/src/js/*.js`
   - templates in `static/src/xml/*.xml`
   - register assets in `__manifest__.py`.
3. Keep server-side merge/update logic in Python (`models/ir_ui_view.py`) for existing `website.page` views.
4. Preserve brand visuals (banner/sections) using client-provided assets and classes without breaking native layout.

## API publish workflow (RPC)

Use this sequence:

1. Dry-run first:
   - authenticate,
   - resolve target page/view,
   - render final arch preview.
2. Real publish second.
3. Verify by reading updated view key/id and confirming write success.

Recommended shell pattern:

```bash
set -a && source ".env" && set +a
export ODOO_URL="$ODOO_<COMPANY>_URL"
export ODOO_DB="$ODOO_<COMPANY>_DB"
export ODOO_LOGIN="$ODOO_<COMPANY>_USERNAME"
export ODOO_PASSWORD="$ODOO_<COMPANY>_PASSWORD"
python3 "odoo_website/tools/push_ld_pages_via_rpc.py" --gallery-only --dry-run
python3 "odoo_website/tools/push_ld_pages_via_rpc.py" --gallery-only
```

## Safety and reliability

- Never print secrets in responses.
- Prefer dry-run before write operations.
- If script expects generic env names, always map from company-scoped vars instead of editing credentials in code.
- If MCP/API auth fails, re-check company token and variable names from workspace JSON + `.env` before retrying.
