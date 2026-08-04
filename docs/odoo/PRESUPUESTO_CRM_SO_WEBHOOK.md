# CRM pipeline Life + Proposition → SO + webhook Kapso

Fecha: 2026-07-27  
Estado: **activo en prod** (`lifedeportes.odoo.com`)

## Pipeline CRM (prod)

| Seq | Stage | id | Visible |
|-----|-------|----|---------|
| 0 | **Asistente Kapso** | **6** | sí (seed Kapso) |
| 1 | **Canal Ventas** | **1** | sí |
| 2 | **Proposition** | **3** | sí (trigger SO) |
| 3 | Pasa a diseño | 4 | sí (`is_won`) |
| 4 | Perdida | 5 | fold |

## Objetivo (Proposition)

Cuando staff mueve la oportunidad a etapa **Proposition**:

1. Odoo crea (o reusa) `sale.order` **draft** con **Plantilla venta** + línea Diseño $0.
2. Copia brief CRM → `sale.order.note` si hay description (provisional; **sin teléfono**).
3. Copia nombre opp → `sale.order.x_studio_nombre_del_pedido`.
4. **Mueve** adjuntos CRM → SO.
5. POST Kapso `on-odoo-presupuesto` (header `X-Life-Webhook-Secret`).
6. **Kapso** (webhook):
   - Si el SO tiene Excel/Word/**PDF FORMATO LIFE** de lista → **organiza los datos** → `sale.order.note` (no en `crm.lead.description`). Layout PDF: `formato_life_pdf_v1`. PDF solo-imagen → staff `ask_about_file` (visión).
   - Crea/actualiza **líneas comerciales** del SO desde filas del Excel (o, si la lista no rinde qty, desde estimado del brief CRM / note: `LIFE_DOSSIER`, «Uniforme × N»). No toca la línea Diseño $0.

### Description CRM vs lista

- CRM `description` = brief (queda; sin teléfono).
- Lista organizada → **`sale.order.note`** (webhook o staff) + **tarea** al confirmar (SA **1539**).
- Staff edita la description de la **tarea** = fuente de verdad; Kapso la lee y coordina. Ver `kapso/docs/lista_staff_fuente_verdad.md`.

## Seed CRM desde Kapso

Oportunidad en **Asistente Kapso** (id 6) — no Proposition (no dispara SO aún).

| Campo CRM | Fuente |
|-----------|--------|
| `name` | Nombre del equipo |
| `phone` / partner | Teléfono WhatsApp (**solo** este campo) |
| `description` | Brief comercial (sin plazos genéricos; **sin teléfono**) |
| `expected_revenue` / `date_deadline` | Cotización / cierre previsto |
| Adjuntos diseño | Fotos de referencia |

### Cadena foto (move, sin duplicar)

CRM adjunto → SA **1549** (Proposition) mueve a SO → SA **1539** (crear tarea) mueve a tarea.

## Automatizaciones Odoo (prod)

### 1) Ganado comercial → Proposition → SO

| Campo | Valor |
|-------|--------|
| Nombre | `CRM Proposition → SO + webhook Kapso` |
| `base.automation` | **26** |
| Trigger | `on_stage_set` |
| Dominio | `[('stage_id', '=', 3)]` |
| Acción | SA **1549** |

Params: `life.kapso.presupuesto_stage_id=3`, webhook URL/secret.

Staff o Kapso (`crm_stage=proposition` / status ganado) mueven la opp a **Proposition**; Odoo crea el SO draft + webhook.

### 2) Pago / SO confirmado → Pasa a diseño · cancel → Perdida

| Nombre | Auto | Trigger | Dominio | SA |
|--------|------|---------|---------|-----|
| `SO confirmado → oportunidad Pasa a diseño` | **27** | `on_state_set` | `state=sale` | **1550** |
| `SO cancelado → oportunidad Perdida` | **28** | `on_state_set` | `state=cancel` | **1551** |

```bash
python scripts/setup_crm_stage_from_so.py prod
```

## Barrido opps 2026-07-27

- **2260** ganadas (SO confirmado `sale`/`done` → etapa Pasa a diseño).
- **21** perdidas (sin SO confirmado; razón «Sin presupuesto confirmado…»).
- Conservadas en Asistente Kapso: **3584** Así Es La Vida, **3585** Emily Zuluaga.

## Scripts

```bash
node kapso/scripts/deploy_on_odoo_presupuesto.js
node kapso/scripts/deploy_seed_crm_awaiting.js
python scripts/setup_crm_presupuesto_so_webhook.py prod --webhook-url URL --secret SECRET
```
