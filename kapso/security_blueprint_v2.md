# Security Blueprint v2 - MCP Firewall, Secrets, and Prompt Injection Defense

## Security goals
- Prevent unauthorized tool use and data exfiltration.
- Enforce least privilege by intent and tenant.
- Keep transactional actions verifiable and auditable.

## Layer 1: Input hardening
- Keep pattern-based sanitization from `mcp_firewall.py`.
- Add structured classifier to tag risky requests:
  - `prompt_override_attempt`
  - `secret_extraction_attempt`
  - `tool_abuse_attempt`
- When risk score is high, force `handoff_human` and skip tool calls.

## Layer 2: Tool firewall by intent
Define per-intent allowlist:

| Intent | Allowed tools/models | Blocked |
|---|---|---|
| `sales_assist` | `product.template.search_read`, `product.product.search_read` | any write/create |
| `create_order_text` | sales_assist set + `res.partner.create`, `sale.order.create`, `sale.order.line.create` | non-sales models |
| `create_order_audio` | same as `create_order_text` + audio transcription function | arbitrary execute_kw |
| `record_purchase_from_receipt` | receipt OCR function + restricted purchase registration endpoints | direct finance mutation outside flow |
| `handoff_human` | messaging + ticket/task write | transactional quote creation |

## Layer 3: Output hardening
- Keep dangerous code pattern checks already present.
- Add response schema validator:
  - customer text must not include tokens/secrets/internal instructions.
  - ops payload must match JSON schema.
- Redact high-risk entities (`api_key`, `token`, `secret`) before sending.

## Layer 4: Secrets management
- No secret values in prompts, logs, or workflow context.
- Secret naming standard:
  - `TENANT_<TENANT_ID>_ODOO_API_KEY`
  - `TENANT_<TENANT_ID>_KAPSO_API_KEY`
  - `TENANT_<TENANT_ID>_WEBHOOK_SECRET`
- Rotate quarterly or on incident.
- Distinct secret scopes:
  - environment: dev/staging/prod
  - tenant: isolated credentials per tenant

## Layer 5: Tenant and user authorization
- Resolve tenant at intake from phone_number_id, channel, or explicit marker.
- Resolve user role from allowlist table.
- Enforce operation gate:
  - only allowed users can run order/purchase workflows.
  - unprivileged users remain in advisory mode (`sales_assist`).

## Layer 6: Auditability
- Persist immutable audit fields for each run:
  - `trace_id`, `tenant_id`, `intent`, `tool_calls`, `blocked_calls`, `handoff_reason`.
- Keep denied action telemetry to tune firewall policies.

## Acceptance checklist
- [ ] Any attempt to override instructions is sanitized and logged.
- [ ] Intent/tool allowlist is enforced and tested.
- [ ] Secrets never appear in LLM input/output or chat logs.
- [ ] Unauthorized users cannot trigger transactional flows.
- [ ] Handoff path activates on high-risk ambiguity.
