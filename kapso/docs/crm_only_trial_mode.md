# Modo prueba: solo CRM (sin WA a Paola/Javier)

Prueba de unos días: el vendedor y `ensure-crm-from-quote` **siguen creando/actualizando oportunidades** en Odoo; **no** llegan templates ni textos proactivos de ventas a Paola ni Javier.

## Qué sigue igual

| Pieza | Comportamiento |
|-------|----------------|
| Agente vendedor | Responde al cliente (6 a.m.–10 p.m.) |
| `ensure-crm-from-quote` | Siembra/actualiza `crm.lead` stage Asistente Kapso (6) |
| `notificar_interes_ventas` (tool agente) | **Sigue llamándose** — dentro hace CRM seed + `Asignado a` en Odoo |
| `LIFE_CRM_SEED_ENABLED` | **`true`** (no tocar) |

## Qué se apaga

| Pieza | Flag |
|-------|------|
| Template `alerta_oportunidad_ventas_kapso_v2` a Paola/Javier | `LIFE_SALES_NOTIFY_ENABLED=false` |
| Copy automático al cliente post-notify (*“Un asesor le escribe…”*) | mismo flag (solo se envía si notify ON) |
| Cola `pending_staff_notify` + flush 8 a.m. | `morning_flush` también lee el flag → no envía |

**Handoff Compose:** con notify OFF igual se abre **`handoff`** en el hilo del cliente (Paola/Javier responden desde CRM/Compose). Sin eso el grafo termina en `ended` y el cliente “se repite” en un hilo nuevo.

## Qué NO apaga este modo

- Cliente comparte contacto → `on-contact-shared` (aviso staff propio).
- Llegada a fábrica → `enviar_ubicacion` con `notify_staff: true`.
- Staff escribe inbound → carril staff responde.

Si hace falta silenciar **todo** proactivo a Paola/Javier, es otro flag (no incluido aquí).

---

## Activar (CRM only)

```bash
cd projects/lifedeportes
node kapso/scripts/set_sales_notify_mode.js --mode crm-only
```

Guarda snapshot en `kapso/ops/notify_mode.snapshot.json` (valores previos).

## Volver a producción

```bash
node kapso/scripts/set_sales_notify_mode.js --mode production
```

Restaura desde snapshot si existe; si no, usa default prod (`ENABLED=true`, phones Paola+Javier).

## Dry-run

```bash
node kapso/scripts/set_sales_notify_mode.js --mode crm-only --dry-run
```

---

## Secrets (function `notify-sales-interest` `a2236fdc`)

| Secret | CRM only | Producción |
|--------|----------|------------|
| `LIFE_SALES_NOTIFY_ENABLED` | `false` | `true` |
| `LIFE_SALES_NOTIFY_PHONES` | (ignorado) | `573213988464,573103362484` |
| `LIFE_CRM_SEED_ENABLED` | `true` | `true` |

También se actualiza `morning-flush-staff-notifies` si está en `service_registry.json`.

Tras cambiar secrets → **redeploy** automático de la function (el script lo hace).

---

## Verificación

1. Interés claro en chat prueba → opp nueva/actualizada en Odoo Canal Ventas / Asistente Kapso.
2. `Asignado a: Paola|Javier` persiste en description (round-robin).
3. **Cero** template `alerta_oportunidad_ventas_kapso_v2` en WA de Paola/Javier.
4. `vars.sales_notify.status` = `disabled` en logs de notify.

---

## Rollback checklist

- [ ] `set_sales_notify_mode.js --mode production`
- [ ] Probar notify en horario staff (8–18) con chat canary
- [ ] Confirmar flush matutino si quedaron `pending_staff_notify` en leads viejos

Ver también: [staff_notify_deferred_8am.md](staff_notify_deferred_8am.md), [seed_crm_awaiting.md](seed_crm_awaiting.md).
