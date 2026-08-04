# Release Roadmap v1 - Life Deportes Kapso Ecosystem

## Release 1 - Foundation and controlled go-live
### Scope
- Router v2 contract.
- Sales assist flow (`sales_assist`).
- Security baseline (input/output guards + tool allowlist).
- Human handoff workflow.

### Acceptance criteria
- Intent routing accuracy >= 90% on validation set.
- No unauthorized transactional tool call in tests.
- Human handoff creates context packet and ticket.

## Release 2 - Transactional order by text
### Scope
- `create_order_text` workflow.
- User eligibility gate for transactional operations.
- Odoo quote creation with playbook constraints.

### Acceptance criteria
- Orders created only for allowed users.
- Missing-field validation blocks incomplete quote generation.
- 100% of created orders include tenant trace fields.

## Release 3 - Audio order processing
### Scope
- `create_order_audio` workflow.
- Transcription + confidence routing.
- Low-confidence fallback to human handoff.

### Acceptance criteria
- High-confidence audios processed end-to-end.
- Low-confidence audios always route to handoff.

## Release 4 - Purchase intake from receipt image
### Scope
- `record_purchase_from_receipt` workflow.
- OCR extraction and validation logic.
- Internal-role access controls.

### Acceptance criteria
- Invalid receipt quality handled with retry prompt.
- Valid receipt creates purchase trace with tenant isolation.

## Release 5 - Multi-tenant hardening and operations
### Scope
- Dual-tenant production readiness.
- Tenant registry and secret isolation audits.
- Incident/runbook operationalization.

### Acceptance criteria
- Cross-tenant leakage tests pass.
- Secrets policy and rotation checklist completed.
- On-call runbooks validated in simulation.
