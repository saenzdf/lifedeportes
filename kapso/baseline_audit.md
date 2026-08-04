# Baseline Audit - Life Deportes (Kapso + n8n)

## Scope
- Current Kapso artifacts in `kapso/` and runtime orchestration in `agent_orchestrator.py`.
- Historical n8n exports from `Documents/Sync/workflows/n8n`.
- Commercial source of truth from `kapso/sales_playbook.md`.

## Current Kapso Baseline (As-Is)

### Runtime and policy
- `agent_orchestrator.py` already enforces:
  - Playbook injection into system prompt.
  - Odoo catalog retrieval before quoting.
  - Material disambiguation (Dry Fit vs Falcao).
  - Quote activation handoff to Odoo skills.
- `mcp_firewall.py` + `firewall_policy.json` already implement:
  - Odoo model/method allowlist.
  - execute_kw restrictions.
  - input/output pattern filtering.
  - per-session MCP call limit.

### Kapso workflow assets currently defined
- `workflow_lifedeportes_sales_inbound_v1.json`
  - Covers inbound routing, disambiguation, Odoo search, reply, and quote trigger.
- `workflow_lifedeportes_quote_activation_v1.json`
  - Covers payload validation, lead creation, sale order creation, and customer confirmation.

### Observed gaps vs commercial objective
- No explicit workflow for:
  - order capture from audio.
  - purchase intake from receipt photo.
  - strict user eligibility for transactional operations.
  - tenant-aware routing and isolation contracts.
  - explicit human handoff with context package.

## n8n Baseline (Historical)

### Main workflow pattern found
- `Life-deportes-workflow-principal.json` provides:
  - intent classifier node.
  - explicit workflow router (`ventas`, `detalles`, `soporte`, `registro`).
  - per-intent subworkflow dispatch.
  - session update after each interaction.

### Valuable behavior to preserve
- Router-first architecture with domain subflows.
- Explicit confidence/intent payload forwarding.
- Human-support branch as first-class route.
- Operational state persistence between turns.

## Mapping Matrix (n8n -> Kapso target)

| Capability | n8n state | Current Kapso state | Target action |
|---|---|---|---|
| Intent classification + routing | Present | Partial | Consolidate in v2 router contract |
| Sales quote flow | Present | Present | Keep, align to playbook strictness |
| Order details capture | Present | Partial | Split into text vs audio workflows |
| Human support handoff | Present | Partial | Add dedicated flow + context handoff payload |
| Internal purchase intake | Present (`registro`) | Missing | Add receipt-photo workflow |
| Session continuity | Present | Present (memory) | Add tenant-aware session partition |
| Security guardrails | Partial | Present | Upgrade to policy-by-intent and tenant |

## Priority gaps to implement first
1. Canonical router contract for `sales_assist`, `create_order_text`, `create_order_audio`, `record_purchase_from_receipt`, `handoff_human`.
2. Tenant context resolver (`tenant_id`, `user_role`, `permissions`).
3. Audio and receipt specialized workflows.
4. Human handoff workflow with escalation rules and preserved context.
