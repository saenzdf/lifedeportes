# E2E wacli→Kapso 07170051 — PASTO

Staff `573172575981` → Life `573222252942` · **OK manual post-timeout**

| # | Label | OK | SO | Partner | Formulario |
|---|-------|----|----|---------|------------|
| 1 | PASTO | ✓ | S02662 | E2E Test 1 — PASTO | 36 nombres (sheet 81) |

## Notas

- Runner `run_wacli_kapso_reingreso.js --only 1` salió `NO_SO_IN_ODOO` por **timeout de polls** (CONFIRMO enviado; write aún en `compile-staff-order-draft`).
- ~15s después el bot confirmó: `S02662 borrador · PASTO · Formulario Life 36 nombres` → test URL.
- Smoke hola → carril staff OK (`agent_1780762885818`).
- Secrets sync `--target test` antes de la prueba; Kapso **queda en test**.
- SO `draft`, total $1.689.800; líneas Diseño + 17 uniforme + 19 camiseta.
- Nota Odoo marcó “BORRADOR PARCIAL — faltan cliente” pese a partner PASTO (ruido lifecycle; no bloqueó Formulario).

## Continuidad cliente (solo revisión)

Contrato en `kapso/docs/session_and_handoff.md`: `waiting` reanuda; `ended` → nueva ejecución + hydrate `quote` por teléfono; handoff solo si piden humano. Sin prueba WA cliente en esta sesión.
