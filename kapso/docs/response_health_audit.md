# Auditoría periódica — respuestas Kapso (carril cliente)

**Rubric completo (leer primero):** [wiki/life-kapso-response-audit](../../../wiki/concepts/life-kapso-response-audit.md)  
**Ancla repo:** [life_kapso_audit_rubric_v1.md](life_kapso_audit_rubric_v1.md)

Script: `kapso/scripts/audit_kapso_response_health.js`

---

## Qué mide hoy (T0)

Implementa un subconjunto del rubric wiki. IDs referenciados allí.

| Regla | Rubric | Severidad |
|-------|--------|-----------|
| `dual_advisor_numbers` | A-01 | fail |
| `voluntary_assistant_identity` | V-01 | fail |
| `order_followup_registered_notify` | RT-01 | fail |
| `no_outbound_after_real_inbound` | I-05 | fail — **excluir arquetipo A0 prefill** (pendiente) |
| `execution_failed` | I-01 | fail |
| `loop_or_failed` | I-02 | fail |
| `ensure_crm_handoff` | I-04 | fail |
| `end_quiet` | I-03 | info |
| `off_hours_copy_8am` | R-02 | warn |
| **`transparent_resume_meta_leak`** | **C-03** | fail — lint sobre texto **sin** metadata `Image attached … URL: app.kapso.ai` |
| **`transparent_resume_forced_recap`** | **C-04** | warn |
| **`transparent_resume_brand_reset`** | **C-02** | fail — mismo teléfono, 2+ hilos |

Doc retomo: [wiki/life-kapso-session-continuity](../../../wiki/concepts/life-kapso-session-continuity.md) · rubric [C-01–C-05](../../../wiki/concepts/life-kapso-response-audit.md).

No marca fail si el bot menciona “abono 50%” en FAQ de plazos (solo copy notify “pedido quedó registrado”).

---

## Uso

```bash
cd projects/lifedeportes
node kapso/scripts/audit_kapso_response_health.js --since-hours 24
node kapso/scripts/audit_kapso_response_health.js --since-iso 2026-08-30T13:53:00-04:00
node kapso/scripts/audit_kapso_response_health.js --since-hours 24 --json > scratch/kapso_health_latest.json
```

Exit: `0` ok · `1` fallos (`--fail-on fail|warn|any`) · `2` error API.

---

## LaunchAgent temporal (8:00 a.m., semana 31 ago – 6 sep 2026)

**Estado:** descargado **2026-09-03** tras corrida manual 36h (`uninstall_kapso_response_health_launchd.sh`). Reinstalar solo si hace falta otra semana de muestreo.

```bash
bash kapso/scripts/install_kapso_response_health_launchd.sh
# logs: ~/Library/Application Support/lifedeportes/kapso_health/YYYY-MM-DD.log
# json:  ~/Library/Application Support/lifedeportes/kapso_health/YYYY-MM-DD.json (siempre, aunque haya fail)
bash kapso/scripts/uninstall_kapso_response_health_launchd.sh
```

Cron escribe JSON con `--no-exit-on-findings`; el log humano puede salir exit 1 si hay fails (`pipefail` ya no corta antes del JSON).

---

## Complementos

| Tipo | Script / doc |
|------|----------------|
| Unit functions | `test_spam_burst_logic.js`, `test_lead_intent_classifier.js`, `run_agent_knowledge_tests.js`, `run_business_hours_tests.js` |
| E2E sintético | `run_wacli_customer_lane.js` |
| Infra WA | `kapso whatsapp numbers health --phone-number 3000000066` |
| Rubric completo | [life-kapso-response-audit](../../../wiki/concepts/life-kapso-response-audit.md) |

---

## Interpretación

- Poca muestra domingo: normal; usar `--since-iso` post-deploy.
- `end_quiet` info: Ads/spam deseado.
- Para auditar “todo el prompt”: rubric wiki capas 1–5; script T0 es la primera capa automatizada.
