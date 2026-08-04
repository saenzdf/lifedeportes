# Smoke CRM-first (2026-07-16)

## validate-staff-write `opportunity_only`
- Result: `opportunity_ready` / `write_mode=opportunity_only`

## odoo-create-lead-and-so `opportunity_only`
- Lead **3511** `SMOKE CRM PASTO`
- URL: https://testlifesoluciones.odoo.com/odoo/crm/3511
- **Sin** `sale.order` (`has_order: false`)
- Message: Oportunidad CRM creada/actualizada (sin presupuesto SO).

## Deploy
- Functions: odoo-create-lead-and-so, validate-staff-write, route-staff-lane-resume → deployed
- Graph lock **1203** (prompt staff CRM→presupuesto embebido)
