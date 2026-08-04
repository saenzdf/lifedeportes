# DEBUG PLAN — Case 1 (NO_SO_IN_ODOO)

## Qué falló
- **Código:** `NO_SO_IN_ODOO`
- **Error:** no_so_found_after_wacli
- **Marker:** `WACLI-KAPSO 07170051 C1`
- **Staff → Life:** 573172575981 → 573222252942
- **Started:** 2026-07-17T00:51:00.181Z

## Evidencia
- TRACE: `TRACE.md`
- Polls: `messages_poll_*.json`
- result.json (steps + detail)

## Hipótesis por código

| Código | Hipótesis | Chequeo |
|--------|-----------|---------|
| WACLI_SEND_TEXT / FILE | Sesión wacli / lock / desconexión | `wacli doctor`; `wacli sync --once` |
| WACLI_CONFIRMO | No llegó confirmación | Ver mensajes en chat Life |
| NO_SO_IN_ODOO | Kapso no corrió writer / wrong env / agent stuck | Kapso executions; secrets test; reply bot |
| NO_MEDIA | Pack sin xlsx | case dir |

## Pasos de debug sugeridos
1. `wacli doctor` + re-sync.
2. Leer últimos mensajes del chat Life (poll json).
3. Kapso dashboard: última execution staff inbound — ¿error function? ¿wait CONFIRMO?
4. Odoo test: `sale.order` create_date >= started_at; buscar marker en note.
5. Verificar secrets Kapso `odoo-create-lead-and-so` apuntan a **test**.
6. Si agent pidió dato y no respondimos: ampliar script con reply al ask.
7. Si Excel no Life (case 6): confirmar mensaje espejo vs bloqueo.

## Last bot text
```
Todo procesado. Resumen del pedido PASTO:

**Cliente:** PASTO
**Excel:** Formato Life v1, pestaña "formato life" - 36 filas

**Lineas comerciales:**
1. **Uniforme de Futbol** x17 - $50.000 c/u = $850.000
2. **Camiseta deportiva dry-fit** x19 - $30.000 c/u = $570.000

**Total estimado:** $1.420.000

**Detalle lista (36 personas):**
- 17 M uniforme (incluye 2 arqueros manga larga: ELL' MENDOZA #18, MAURICIO#2 #21)
- 1 M camiseta (John S. Muñoz, dorsal "Teacher")
- 18 F camiseta (incluye 2 arqueras manga larga: ALEJA.P #21, FERRIN LARE #1)
- 4 arqueros total - "Uniforme arquero de francia"

**Adjuntos:** Excel lista + 2 fotos de referencia (arquero y jugadores)

**Notas:**
- El dorsal "Teacher" en John S. Muñoz queda como esta en el Excel (no es numerico).
- Las arqueras ALEJA.P y FERRIN LARE figuran como camiseta (FEM sin producto = camiseta segun regla), marcadas arquero manga larga.

Si todo cuadra, responde **CONFIRMO SUBIR** y creo el borrador en Odoo.
---
Ambos productos validados. Ahora seteo el nombre del cliente y previsualizo el borrador.
---
Uniforme de Fútbol encontrado: ID 115, $50.000 c/u, total $850.000. Ahora busco la camiseta.
---
Borrador fusionado. Ahora valido los productos en Odoo. Tengo dos líneas comerciales: 17 uniformes y 19 camisetas.
---
Excel parseado correctamente. Ahora fusiono el borrador con la lista normalizada.
---
Ahora parseo el Excel formato Life.
---
Los adjuntos no se detectaron automáticamente. Los registro manualmente y luego parseo el Ex
```
