# Seed CRM desde Kapso (conversaciones en espera)

Fecha: 2026-07-27  
Estado: **activo** — function `seed-crm-awaiting` + **`ensure-crm-from-quote`** en grafo cliente (lock ≥1413).

## Cadena as-they-come (2026-07-29)

1. Cliente escribe → debounce 30s → **`ensure-crm-from-quote`** (si `vars.quote` pasa gate → seed stage 6) → Agent Vendedor.
2. Interés claro en el turno → agente guarda `quote.*` + **`notificar_interes_ventas`** (también siembra).
3. Barrido gaps: `node kapso/scripts/morning_seed_kapso_gaps.js` (opcional `--dry-run`).

Function ensure: id `10c53577-1fd5-45b1-9353-1dd44da449ee` · deploy `kapso/scripts/deploy_ensure_crm_from_quote.js`.


## Contrato de oportunidad

| Campo Odoo | Fuente Kapso |
|------------|--------------|
| `name` | Nombre del equipo / contacto limpio (sin emoji) |
| `phone` + partner | Teléfono WA (**solo** este campo; **nunca** en description) |
| `description` | **Brief comercial** con fecha de conversación + producto/cotización/estado. Enlace **Abrir chat en Kapso** solo si el CRM viene del **carril ventas** (cliente); **no** si lo subió staff. Sin plazos genéricos (15 días). **Sin teléfono.** |
| `expected_revenue` | `quote.total_cop` (o unit × qty) |
| `date_deadline` | `quote.date_deadline` o +4 días |
| Adjuntos | `quote.media_refs[]` → `ir.attachment` en el lead (diseño) |
| Meta Kapso | Comentario HTML `<!-- kapso:conv=… fp=… -->` (oculto; sin phone) |

**No** poner teléfono ni conversation id en el cuerpo visible de la description.

## Lineal: description CRM → lista en presupuesto / tarea

Dos campos, dos roles. El Excel **nunca** borra la description de la oportunidad.

```
CRM description (brief)     queda fijo   [etapa Asistente Kapso → Ventas]
        │
        │  Proposition → crea SO
        ▼
sale.order.note  ←  provisional brief; luego lista si hay Excel
        │
        │  confirm SO → tarea (SA 1539 copia note → description SIEMPRE)
        ▼
project.task.description ← lista (fuente de verdad staff)
```

| Etapa | `crm.lead.description` | Lista |
|-------|------------------------|-------|
| Seed Kapso | Brief | — |
| Proposition | intacta | note provisional / lista |
| Excel / corrección | intacta | **tarea** + note SO |
| Staff edita tarea | intacta | Kapso lee tarea y coordina |

Seed aterriza en stage **Asistente Kapso** (id **6**). Ver `lista_staff_fuente_verdad.md`.

### Etapas desde Kapso

| Señal | Stage |
|-------|-------|
| Interés / seed default | **6** Asistente Kapso |
| `crm_stage` / status ganado · propuesta · `pedido_confirmado` | **3** Proposition (dispara SO) |
| perdida / lost / cancel | **5** Perdida |

Pago real: al confirmar SO (`state=sale`) la auto **27** pasa la opp a **Pasa a diseño** (id **4**).


## Function Kapso

| Campo | Valor |
|-------|--------|
| Nombre | `seed-crm-awaiting` |
| id | `a9b1d8c3-f87f-4b69-8c82-1b6688fb8818` |
| Auth | Invoke con `X-API-Key` (no public) |
| Secrets | `ODOO_*` prod, `LIFE_CRM_SEED_ENABLED=true` |

```bash
node kapso/scripts/deploy_seed_crm_awaiting.js
node kapso/scripts/deploy_seed_crm_awaiting.js --invoke scratch/seed_crm_emily_payload.json
```

Payload mínimo: ver `scratch/seed_crm_emily_payload.json`.

## Cadena de fotos (sin duplicar)

1. **CRM** — adjunto en `crm.lead` (seed Kapso o staff).
2. **Proposition** — SA **1549** **mueve** adjuntos lead → `sale.order`.
3. **Confirmación SO → tarea** — SA **1539** **mueve** adjuntos SO → `project.task`.

En cada paso hay una sola ubicación del archivo (move, no copy).

## As-they-come (vendedor)

`notificar_interes_ventas` reusa el mismo `seedCrmOpportunityFromQuote` (rebundle: `node kapso/scripts/bundle_notify_crm_seed.js`). Gate: `crm_interest_gate.js` (no CRM si “voy a consultar”).

## Ejemplos prod 2026-07-27

| Lead | Origen | Equipo | Revenue | Notas |
|------|--------|--------|---------|-------|
| **3584** | seed + fix fecha | Así Es La Vida | 500000 | Conv 2026-07-18 |
| **3585** | Kapso seed | Emily Zuluaga | 690000 | Conv 2026-07-26 |
| **3586–3591** | barrido semana | Jan…Victor.E | varía | Esperando pagar/cerrar; Asistente Kapso |
