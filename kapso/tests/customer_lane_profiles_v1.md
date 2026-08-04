# Perfiles conversación carril cliente (v1)

Fuente: `scratch/rule_classified.json` (100 hilos Kapso, ~763 msgs cliente) + `platform_conversations.json`.

**Setup (jul 2026):** Diego `573172575981` fuera del staff allowlist; `staff_only_mode` **off**. Restaurar allowlist al terminar pruebas staff.

## Banco de aperturas reales (cliente → Life)

| Frecuencia | Texto |
|------------|--------|
| muy alta | `Hola, quiero cotizar uniformes de` |
| alta | `Hola, quiero cotizar uniformes de fútbol` / `futbol` |
| media | `Hola, quiero cotizar uniformes de baloncesto` / `voley` / `voleibol` |
| real | `Necesitaríamos 33 uniformes con un diseño propio` |
| real | `22` / `Son 6 uniformes` / `Necesitaría 22 uniformes` / `130 uniformes` |
| real | `Uniforme completo futbol de camisa y pantalonetas` |
| real | `O uniforme completo que precio tiene` / `Y las camisetas a como ?` |
| real | `Buenos días tengo una pregunta ustedes estan en Bogotá??` |
| real | `Si lo quisiera profesional ?` (→ Dumonti) |
| real | `Quisiera ver algunas imágenes en uniformes q allá echo en la tela dumonti` |
| real | prototipo/diseño + **Image attached** |
| real | audio (Wendy: 15 uniformes por voz) |

## Respuestas rápidas agente (patrones Kapso observados)

- Presentación: `Mucho gusto, Life Deportes… sublimación… mínimo 6…`
- Una pregunta: cantidad **o** diseño (no ambas a la vez en el mismo turno ideal)
- Precio fútbol completo ~`$50.000` c/u (corpus Jr / Okimara)
- Upsell: tela Dumonti si piden “profesional”
- Ubicación Bogotá cuando preguntan
- Con foto de diseño: comentar colores/estilo y cotizar

## Tres perfiles de prueba

### P1 — `futbol_excel_fotos` (con lista + refs)
Cliente que ya tiene lista Excel y fotos (como muchos pedidos reales post-cotización, aquí lo mandamos en el hilo de ventas para ver cómo responde el **agente cliente**).

Script de mensajes:
1. `Hola, quiero cotizar uniformes de fútbol`
2. Esperar reply → `Necesitaríamos 18 uniformes con un diseño propio`
3. Enviar 2 fotos de referencia (case_01 PASTO)
4. Enviar Excel FORMATO LIFE (case_01)
5. `Esa es la lista y las fotos del diseño. ¿Me cotizas el total?`

Éxito: no mensaje de mantenimiento; cotiza; no cae en carril staff; menciona mínimo/sublimación; puede pedir cuello/manga o dar precio.

**E2E 2026-07-13:** ✓ recibió 2 JPEG + Excel PASTO; cotizó $50.000×18 (en el primer run aún caía a historial; tras fix route va a vendedor).

### P2 — `futbol_solo_hilo` (sin Excel)
1. `Hola, quiero cotizar uniformes de futbol, aproximadamente unos 15`
2. `Dry fit, manga corta, cuello en V`
3. `Sí, tengo el diseño, se lo mando después. ¿Cuánto sale el completo?`
4. Si pregunta abono/tiempos: `Ok y el abono cómo es?`

Éxito: precio unitario + total (~15×); no inventa SO; no pide Excel para cotizar.

**E2E 2026-07-13:** ✓ vendedor $50.000×15 = $750.000; explicó abono 50%.

### P3 — `camisetas_vs_uniforme` (ambigüedad producto)
1. `Hola, quiero cotizar camisetas de fútbol`
2. `Son como 12`
3. Si pregunta uniforme vs solo camiseta: `Solo la camiseta, sin pantaloneta`
4. `Dry fit`

Éxito: trata **camiseta sola** (no fuerza uniforme completo); precio acorde catálogo (~$30k dry-fit en Odoo).

**E2E 2026-07-13:** ✓ tras fix `cotiz\w*` → vendedor $30.000×12 dry-fit (sin pantaloneta).

## Qué NO es este carril

Crear SO/Formulario = **staff / inbox Jump**. Aquí medimos calidad de **venta gradual** y que el hilo cliente vuelva a vivir.
