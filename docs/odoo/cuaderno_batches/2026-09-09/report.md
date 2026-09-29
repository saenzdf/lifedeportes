# Cuaderno 2026-09-09 — extracción

- Pages: **11**
- Packing (Empacado) rows: **42** (unique SO: 42)
- Delivery rows: **195**
- Review bucket: **8**

## Packing SO numbers

2930, 2987, 3006, 3008, 3009, 3010, 3013, 3024, 3025, 3026, 3027, 3028, 3038, 3039, 3045, 3046, 3049, 3052, 3061, 3062, 3073, 3075, 3076, 3077, 3078, 3079, 3080, 3090, 3098, 3100, 3102, 3108, 3110, 3117, 3121, 3135, 3144, 3145, 3146, 3169, 3170, 3173

## Delivery by carrier

- Interrapidísimo: 86
- Envía: 74
- Moto: 22
- Mensajero: 7
- Terminal: 4
- Carro: 2

## Review sample

- [p01_160223] Los 2 Paquetes | so=None | None | review
- [p01_160223] Rosa rebelde | so=None | None | review
- [p07_160143] Suave y Sabor | so=None | None | review
- [p09_160426] Guaridolo sudaderas | so=None | None | review
- [p09_160426] Leonardo Leiva | so=3025 | None | duplicate_so_of_p09_160426
- [p09_160426] (blank red) | so=3039 | None | duplicate_so_of_p08_160438
- [p09_160426] Eduamier | so=None | None | review
- [p11_160335] Eliah | so=None | None | review

## Notes

- Extraction used transcriptions (no JPG on VM).
- Apply script will dry-run against Odoo prod when credentials are available.

## Post-review (agents)

- Packing SO audit: all 42 in range; Empacado uses SO # (names optional).
- Delivery carrier coverage: 195/195 valid.
- Flagged ambiguous delivery names for `needs_review` (no auto-validate): **26**
- Remaining auto-eligible deliveries: **169**
- Packing name cleanups applied: Brayan, Yesica Abello, Laura San Juan, Fortaleza Omar, Luisa Peñaloza.
