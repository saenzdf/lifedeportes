# Continuidad cliente — checklist (solo revisión)

Fecha: 2026-07-16 · Sin prueba WhatsApp cliente.

| # | Check | Resultado |
|---|-------|-----------|
| 1 | Vendedor cierra con `enter_waiting`; sin edge duro a `handoff_general` | OK — 0 edges salientes desde `agent_orquestador` a handoff en grafo local |
| 2 | Secrets `KAPSO_*` en `classify-contact-odoo` | OK — `KAPSO_API_BASE_URL`, `KAPSO_API_KEY`, `KAPSO_WORKFLOW_ID` + Odoo (sync `--target test`) |
| 3 | Gaps prod | Ventana Meta 24h → solo plantillas; no reintroducir edge vendedor→handoff |
| 4 | Doc flujo 3 estados | OK — `kapso/docs/session_and_handoff.md` § Flujo sencillo + wiki `lifedeportes.md` |

Parte A (staff PASTO) aparte: **S02662** draft test · Formulario sheet 81 · ver `REPORT.md`.
