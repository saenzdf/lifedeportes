# Rubric auditoría Kapso vendedor (v1)

**Fuente de verdad durable:** [life-kapso-response-audit](../../../wiki/concepts/life-kapso-response-audit.md) (wiki Sync).

Este archivo es el ancla en repo; el rubric completo (arquetipos, capas, IDs V/R/RT/S/P/T/A/I, roadmap T0–T4) vive en wiki para lectura y acuerdo de parámetros.

## Script operativo

```bash
node kapso/scripts/audit_kapso_response_health.js --since-hours 24
```

Ver también: [response_health_audit.md](response_health_audit.md)

## Estado implementación

| Capa | Cobertura script actual |
|------|-------------------------|
| T0 regex + exec | ~12 reglas (identidad, dual número, follow-up notify, infra) |
| T1 arquetipos + tools | Diseñado en wiki — pendiente |
| T2 E2E wacli | `run_wacli_customer_lane.js` |
| T4 unit | KB, hours, spam, intent |

**Ajuste acordado:** prefill Ads (A0) = pass/info, no `no_outbound_after_real_inbound`.
