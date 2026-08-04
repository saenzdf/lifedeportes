# Debug Kapso — carril cliente (12–14 jul 2026)

Veredicto visual: canvas
`/Users/diego/.cursor/projects/Users-diego-Documents-Sync-projects-lifedeportes/canvases/kapso-customer-flow-debug.canvas.tsx`

## Fuentes
- Kapso msgs Diego `573172575981` (conv `6ce89339…` y hermanas)
- E2E `scratch/e2e_customer_lane_2026-07-12/` (P1–P3)
- E2E `scratch/e2e_customer_conversation_2026-07-13/` (C1–C3 v7)
- Dump: `scratch/debug_customer_flow_2026-07-14/`

## Bien (plan v7)
- Debounce ráfaga → 1 reply (C2)
- Precio tool: uniforme $50k / camiseta $30k
- Semántica camiseta vs uniforme
- Route cotizar → vendedor (post-fix `cotiz\w*`)
- Saludo no spam en C1–C3

## Pierde el hilo
1. CTA “¿registremos?” casi cada turno (checks E2E no lo cazan)
2. `quote`/hilo sucio: qty 18/12/10 y “diseño enviado” cruzan perfiles
3. Pre-fix: history loop “le paso con ventas”
4. Silencio 11:28–11:31 (3 inbound sin BOT; exec stuck)
5. Inventa variantes / salta gradualidad
6. History agent no cotiza cuando cae mal

## P0
- Ban CTA registro hasta aceptación explícita (+ test rojo)
- Reset `quote.*` al abrir cotización nueva
