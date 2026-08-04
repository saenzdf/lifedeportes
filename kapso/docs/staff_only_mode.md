# Modo solo staff — Kapso Life Deportes

Cuando el carril **cliente** no debe ejecutarse (vendedor, histórico, classify Odoo), se redirige el edge `customer` de `route-user-entry` a un **router de pausa** (`route-customer-paused`):

1. **Primera vez** en la conversación → `send_text` con mensaje de mantenimiento → marca `vars.kapso.maintenance_message_sent` → `wait_for_response` (conversación viva en inbox).
2. **Mensajes siguientes** del mismo cliente → sin reenviar el texto → solo `wait_for_response`.

El carril **staff** sigue intacto.

## Estado

```bash
cd lifedeportes
export $(grep -v '^#' .env | xargs)
node kapso/scripts/staff_only_mode.js status
```

## Activar / desactivar

```bash
node kapso/scripts/staff_only_mode.js enable   # solo staff
node kapso/scripts/staff_only_mode.js disable  # restaura cliente
```

El trigger WhatsApp público puede seguir **off** (`kapso/docs/test_mode.md`).

## Probar como staff en Kapso (inbound_message UI)

El simulador **Inbound message** no deja elegir el teléfono del remitente. Sin bypass, `staff-allowlist-check` no reconoce staff y caes en el carril cliente (mensaje de mantenimiento con staff-only activo).

### Opción recomendada — variable solo en Development

Kapso distingue **Development** (test runs) vs **Production** ([variables and context](https://docs.kapso.ai/docs/flows/variables-and-context)).

1. Proyecto **Life Deportes** → **Settings** → **Environment variables** (o icono de llave en el canvas del workflow).
2. Añade:

| Variable | Development | Production |
|----------|-------------|------------|
| `LIFE_FORCE_STAFF_LANE` | `true` | *(vacío o `false`)* |
| `LIFE_FORCE_STAFF_NAME` | `Diego Test` | *(opcional, vacío)* |

3. En el workflow → **Test** → trigger **Inbound message** → escribe `hola` o `SUBIR PEDIDO`.
4. Verifica en Events: `vars.user.role = staff`, edge `staff` en `route-user-entry`.

Con `LIFE_FORCE_STAFF_LANE=true` en Development, **cualquier** test inbound entra al carril staff sin allowlist.

### Opción rápida — secret en la function (CLI)

Si no encuentras las env vars del proyecto:

```bash
export $(grep -v '^#' .env | xargs)
node kapso/scripts/force_staff_test_mode.js enable   # antes de probar
node kapso/scripts/force_staff_test_mode.js disable  # antes de activar trigger público
```

**Cuidado:** el secret de function aplica también a ejecuciones API/reales mientras exista. El trigger inbound sigue off, pero desactívalo antes de abrir tráfico público.

### Allowlist real (sin bypass)

Si en el futuro Kapso permite teléfono en el test, o usas API:

| Nombre | Teléfono | Proyecto Odoo en presupuesto |
|--------|----------|------------------------------|
| Diego Saenz | `573172575981` (3172575981) | — |
| Paola | `573213988464` | **Proyecto Paola** (id 9) |
| Javier Ayala | `573103362484` | **Proyecto Javier** (id 8) |
| Sebastián Ayala | `573172273627` | — |

El allowlist (`staff-allowlist-check`) escribe `vars.user.odoo_project_id` / `odoo_project_name` según el remitente.

Mensajes útiles: `hola` (staff general), `SUBIR PEDIDO`, `SUBIR NOMINA`.

## ¿Usa la instancia de pruebas (Odoo test)?

| Capa | Qué usa en test manual Kapso |
|------|------------------------------|
| **Kapso** | Grafo y functions del proyecto Life Deportes (mismo workflow publicado). |
| **WhatsApp** | Simulado en el editor; trigger inbound real sigue **desactivado** → no llegan mensajes del +57 322 2252942. |
| **Odoo** | Los secrets del **proyecto Kapso** (`ODOO_URL`, `ODOO_DB`, … en Functions → Secrets). **No** lee tu `.env` local automáticamente. |

Para que las pruebas staff escriban en **Odoo test** (`testlifesoluciones.odoo.com`), los secrets en Kapso deben apuntar ahí — igual que en `.env.example` / `ODOO_TARGET=test`.

Sincronizar desde el workspace:

```bash
node kapso/scripts/sync_odoo_secrets_to_kapso.js --target test
```

Si los secrets de Kapso apuntan a producción, un `SUBIR PEDIDO` de prueba **crearía datos en prod**. Verifica en Kapso → Project → Function secrets antes de probar writes.

## Matriz rápida staff

Ver `kapso/tests/staff_flow_matrix.md` (tests locales de functions + manual Kapso).
