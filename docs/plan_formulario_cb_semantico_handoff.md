# Plan — Formulario C+B, match semántico y handoff vendedor

Actualizado 2026-07-12 (ejecución en curso).

## Decisiones cerradas

| # | Decisión | Ref |
|---|----------|-----|
| 1 | **C+B**: Kapso Payload; Odoo/script llena Formulario | ADR 0005 |
| 2 | Prueba: **1 pedido** | grill |
| 3 | Confrontación **híbrida** | ADR 0006 |
| 4 | Timing: SO + Formulario nativo → luego fill | E2E |

## Estado ejecución

### A. Contrato Payload Formulario
- [x] Schema JSON + docs `kapso/docs/payload_formulario_v1.md`
- [x] Vive en `ir.attachment` `formulario_payload_v1.json` (campo `raw` Odoo 19)
- [x] Idempotencia: update attachment same name
- [x] Flag `FORMULARIO_FILL_MODE=payload` (default) en writer

### B. Fill en Odoo
- [x] PoC script `kapso/scripts/fill_formulario_from_payload.js`
- [x] No renombra Pedido si hay `Pedido!`
- [x] PoC 1 pedido: **S02641** — payload_ready → fill 36 → Confrontación OK
- [ ] Automation Studio en Odoo (siguiente: portar PoC a server action)

### C. Confrontación híbrida
- [x] Checklist grave vs aviso en payload doc
- [x] Superficie PoC: nota SO + JSON confront
- [ ] KPI fidelity Kapso wiring (pendiente)

### D. Match semántico
- [x] Primera pasada: `LIFE_REGIONAL_ALIASES` en `odoo_search_product_price.js` + lib
- [ ] Aprendizaje desde historial Kapso (pendiente)
- [ ] Redeploy `odoo-search-product-price` a Kapso

### E. Handoff vendedor
- [ ] Stub: no implementar aún — siguiente grill cuando C+B automation Odoo esté verde
- Requisitos capturados: no interrumpir handoff; retomar lo hablado; carril correcto; vendedor resuelve ambigüedad

## PoC verificado

```
S02641 (test) · FORMULARIO_FILL_MODE=payload · filled cells=0 on create
→ fill_formulario_from_payload.js · filled=36 · Confrontación OK
spreadsheet: /odoo/sales/2631/sale-order-spreadsheet/60
```

## Siguiente

1. **Preparar Plantilla venta v2** en Odoo test (doc `kapso/docs/formulario_plantilla_v2.md`): producto base en Pedido!I, Aprobación B→XLOOKUP a base, Diseño fuera de cumqty, headers ADR 0003.
2. Confrontación: match `names_without_product` (nombres/tallas sin producto) como primera intención de SO incompleta.
3. Portar fill a automation Odoo Studio.
4. Grill corto handoff (E).
5. Ampliar aliases regionales con evidencia de chats.
