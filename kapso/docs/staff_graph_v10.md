# Grafo staff v10 — Agent Staff unificado

Archivo: `workflow_lifedeportes_sales_inbound_v10.json`  
Prompt: `kapso/prompts/agent_staff_upload_v9_slim.md`  
Deploy: `bash kapso/scripts/deploy_unified_staff.sh`

## Un agente, tres dominios

Nodo Jump: **`agent_1780762885818`**. Pedido + nómina + compra por **tools** + (pedido) cadena de write. Sin agentes aparte.

```
Start → policy → allowlist → route-user-entry [staff]
  → Wait staff burst (~10s silencio; cada mensaje reinicia)
  → Agent Staff
       → Decision: staff domain guard
            staff_pedido_write → compile → validate → Odoo CRM/SO (+ Formulario + adjuntos) → wait
            staff_domain_skip_pedido → wait  (nómina/compra ya vía tools)
```

## División de responsabilidad (simplificar mentalmente)

| En el **agente** | En el **grafo** (tras `complete_task` pedido) | En **tools** del agente (sin grafo write) |
|------------------|-----------------------------------------------|-------------------------------------------|
| Interpretar dominio, WA short replies | `compile` → `validate` → `build-quote` → `odoo-create-lead-and-so` | Nómina: parse + confirmar |
| Orquestar lista: clasificar → parse → fusionar → registrar (staging) | Partner/CRM u SO draft, Formulario, **upload Chatter** | Compra: `crear_compra_odoo` |
| `staff.write_mode` + `complete_task` (solo pedido) | Domain guard bloquea nómina/compra en compile | Corrección SO: `buscar` / `sincronizar` / `corregir` |
| `enter_waiting` | Send Text fijo (S0… / bloqueo CONFIRMO SUBIR) | `prepare_inbox_upload` (Jump) |

**No mover al agente:** creación CRM/SO, fill Formulario, upload real a Odoo (idempotencia + validate viven en grafo).  
**No mover al grafo (por ahora):** parse multimodal de lista (Excel/foto/texto) — el agente elige tool según adjunto.  
**Candidatos ya fuera del toolset activo:** `verificar_servicio`, `medir_fidelidad_pedido` (ops/KPI; quedan en Kapso registry, no en el agente).  
**KB staff:** `life_reglas_staff` (extract) en lugar de la FAQ larga `life_reglas_comerciales`.

**Debounce staff:** wait node = **10s** (lock ~1333). Prompt + KB patterns alineados a 10s.

**Pedido en dos pasos:** (1) `opportunity_only` → CRM auto; (2) solo *HAZ PRESUPUESTO* → SO draft. Guard evita que `complete_task` en nómina/compra entre a compile.

## Nómina

- PIN attlog = `hr.employee.barcode` (credencial).
- Cola `NOM-…` al confirmar; **sin** `hr.attendance` aún.
- Doc: `kapso/docs/nomina_attlog_kapso.md`

## Compras

- Tool `crear_compra_odoo` → `purchase.order` draft.
- Schema `purchase_draft_v1`. Nunca confirma PO.

## Inbox / Jump

Doc: `kapso/docs/inbox_ingreso_handoff.md` — Jump → Agent Staff.

## Sin reintroducir

Agentes `agent_staff_nomina_*`, `agent_inbox_ingreso_*`, o decide multi-agente por dominio.
