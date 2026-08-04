# Multi-Tenant Contract v1 (Single Agent, Isolated Data)

## Strategy
- One conversational agent runtime.
- Tenant-aware context resolution at intake.
- Strict isolation of data, policies, and secrets per tenant.

## Tenant boundary model
- Isolation keys:
  - `tenant_id`
  - `phone_number_id`
  - `user_role`
- Any read/write operation must include tenant-scoped filters.

## Runtime contract
At conversation start, context resolver must set:
```json
{
  "tenant_id": "life_main",
  "policy_set": "sales_default_v1",
  "secret_prefix": "TENANT_LIFE_MAIN"
}
```

## Data isolation requirements
- Conversation memory partitioned by `(tenant_id, wa_id)`.
- Operational logs partitioned by `tenant_id`.
- Odoo operations restricted by tenant-bound credentials and domain filters.

## Policy isolation requirements
- Firewall policy may be shared baseline but enforce per-intent and per-tenant overrides.
- Unauthorized tenant crossing must be denied and escalated.

## Secret isolation requirements
- Separate credentials per tenant for:
  - Kapso API
  - Odoo API
  - Webhook signing secrets
- Secret lookup must use tenant prefix:
  - `TENANT_<TENANT_ID>_*`

## Minimal onboarding checklist for second tenant
- [ ] Register tenant in `tenant_registry.json`.
- [ ] Configure dedicated phone_number_id mapping.
- [ ] Create tenant-specific secrets.
- [ ] Validate transactional permissions for allowed users.
- [ ] Run tenant-isolation E2E tests before go-live.
