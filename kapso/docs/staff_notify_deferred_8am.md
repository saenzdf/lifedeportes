# Avisos staff diferidos (8:00 a.m.)

Fuera de **8:00 a.m.–6:00 p.m.** lun–sáb (y todo el domingo), `notify-sales-interest` **siembra el CRM** y **no** manda WhatsApp inmediato a Paola/Javier. Encola el aviso en la descripción del lead:

```html
<!-- kapso:pending_staff_notify={...json...} -->
```

Al cliente, de **10:00 p.m. a 6:00 a.m.** no se le escribe (`customer_send_ok`). De **6:00 p.m. a 10:00 p.m.** solo vendedor; staff encolado. A las 6:00 a.m. `resume_overnight_customer` reanuda waiting con inbound de noche.

Si el asesor **escribe** (inbound staff), el carril staff sí responde fuera de horario.

## Flush matutino

Function Kapso: `morning-flush-staff-notifies` (ver `service_registry.json`).

```bash
# Deploy / actualizar
node kapso/scripts/deploy_morning_flush_staff_notifies.js

# Probar sin enviar WA
node kapso/scripts/run_morning_flush_staff_notifies.js --dry-run

# Enviar pendientes reales
node kapso/scripts/run_morning_flush_staff_notifies.js
```

Programar en Mac (día hábil ~8:05 Bogotá) con `launchd` o cron local, p. ej.:

```cron
5 8 * * 1-6 cd /Users/diego/Documents/Sync/projects/lifedeportes && /usr/bin/node kapso/scripts/run_morning_flush_staff_notifies.js >> /tmp/life_morning_flush.log 2>&1
```

(Sábado 8:05 también; domingo no hace falta — no hay pendientes nuevos de “día hábil” o el flush los limpia el lunes.)

## Round-robin

El siguiente asesor se elige con el **último** `Asignado a: Paola|Javier` en Odoo (no el contador por conversación Kapso). Sticky por conversación/BSUID/teléfono se mantiene.
