# Informe E2E — Staff Kapso + Formulario Life (2026-07-12)

## Resumen ejecutivo

Se probaron **10 paquetes** reales (Excel + fotos, sin PDFs de impresión) contra **Odoo test** (`testlifesoluciones.odoo.com`) vía el writer Kapso `odoo-create-lead-and-so`.

| Resultado | Cantidad |
|-----------|----------|
| SO borrador + Formulario snapshot OK | **8 / 10** |
| Fallo parse Excel no-formato-life | 1 (case 06 ADRIAN) |
| Bloqueo comercial `BASE_BELOW_MINIMUM` | 1 (case 09) |
| Canal WhatsApp staff (wacli) | **No disponible** — sesión expirada; packs listos para cel |

**Veredicto Formulario (prioridad del test):** tras corregir 3 bugs de producción, el fill **sí persiste** en `sale.order.spreadsheet` con pestañas correctas y nombres/tallas en Aprobación. Aún no usa la plantilla nativa con fórmulas SEQUENCE/XLOOKUP/ODOO.LIST (test no tiene Calculadora publicada; solo el Excel lista).

## Canal WhatsApp / wacli

- wacli store: autenticado históricamente como Diego `573172575981` (allowlist OK).
- Al reconectar, la sesión caducó → `wacli auth` requiere pairing (`Linked Devices`). Códigos emitidos; no se completó pairing en esta sesión.
- **Modo B activo:** paquetes en `scratch/kapso_staff_e2e_2026-07-12/case_NN/` (Excel, fotos, `manifest.json`, `SEND.txt`).
- Kapso inbound + `staff_only_mode` OK; secrets Odoo → test sync OK.

Para repetir el loop WhatsApp: `wacli auth` (QR o teléfono) y enviar case_01… al `+57 322 2252942`.

## Flujo esperado vs real (writer / Formulario)

```
parse Excel → order_draft.detail.rows
  → resolved_lines + draft_payload
  → odoo-create-lead-and-so
  → SO draft + upsert Formulario Life
```

| Paso | Esperado | Real (post-fix) |
|------|----------|-------------------|
| Parse FORMATO LIFE | filas persona | OK en 9/10 |
| Crear SO draft test | borrador, no confirm | OK (S02629–S02636) |
| Formulario pestañas | Aprobación + Productos | OK |
| Snapshot persistido | `spreadsheet_snapshot` | OK tras fix write |
| Nombres/tallas Aprobación | C/E llenos | OK (ej. ANDRÉS J / M) |
| Fórmulas A–B / ODOO.LIST | intactas | **No** — snapshot mínimo (sin plantilla Calculadora en test) |
| Productos I–O attrs | base+cuello+manga… | Parcial (I ok; attrs J+ a menudo vacíos; fila Diseño aparece) |

## Scorecard por caso

| Case | Origen | E2E | SO | Formulario | Nota |
|------|--------|-----|----|------------|------|
| 01 PASTO | task 2237 | PASS | S02629 | 36 filas, C2=ANDRÉS J | |
| 02 JORGE | | PASS | S02630 | 26 | |
| 03 LUCU | | PASS | S02631 | 19 | |
| 04 NELSON | | PASS | S02632 | 53 | |
| 05 FORTALEZA | | PASS | S02633 | 16 | |
| 06 ADRIAN | LISTADO ADRIAN.xlsx | FAIL | — | — | Excel **no** es FORMATO LIFE (`no_rows_parsed`) |
| 07 david | | PASS | S02634 | 17 | |
| 08 WILLIAM | | PASS | S02635 | 17 | |
| 09 JEAN | | FAIL | — | — | `BASE_BELOW_MINIMUM` (uniforme &lt; 6) |
| 10 CHUCHO | | PASS | S02636 | 13 | |

Artefactos: `E2E_SUMMARY_V3.json`, `case_NN/e2e_result.json`, packs en la misma carpeta.

## Bugs encontrados y fixes aplicados

### 1. `normalizeText is not defined` (bloqueante Kapso)
- **Síntoma:** invoke `odoo-create-lead-and-so` → 500.
- **Fix:** definir `normalizeText` en `odoo_create_lead_and_so.js`; redeploy.

### 2. Bundle partner phone ausente al redeployar a mano
- **Síntoma:** `findPartnerByWaPhone is not defined`.
- **Fix:** correr `bundle_odoo_partner_phone.js` antes de upsert/deploy.

### 3. Campo Studio inexistente en test
- **Síntoma:** `Odoo Server Error` al crear SO con `x_studio_nombre_de_pedido: false`.
- **Fix:** solo escribir el campo si hay valor real (billing third party).

### 4. Formulario: `executeKw` sin `uid` (bloqueante fill)
- **Síntoma:** SO creado, `spreadsheet.status=error`, sin sheet.
- **Fix:** pasar wrapper `(model, method, …) => executeKw(uid, …)` como en adjuntos.

### 5. Formulario: plantilla + write incorrectos (bloqueante persistencia)
- **Síntoma:** template `FORMATO PEDIDO LIFE` es el **Excel lista** (Hoja1/formato life), no la Calculadora; escribir `spreadsheet_data` **junto** a `spreadsheet_snapshot` en Odoo 19 **borra** el snapshot.
- **Fix:** detectar plantilla inválida → `buildMinimalFormularioSnapshot`; escribir **solo** `spreadsheet_snapshot`.
- **Deploy:** function `8a7b731d-…` actualizada + secrets test re-sync.

## Hallazgos abiertos (sin fix completo)

1. **No hay plantilla Calculadora en test/prod templates** — solo Excel lista. El Formulario “de verdad” con SEQUENCE/XLOOKUP vive en SOs ya creados (smart button). Hace falta publicar/copiar plantilla Formulario o clonar snapshot semilla.
2. **Fila Diseño en Productos (I2)** — el fill incluye línea diseño $0; debería excluirse siempre.
3. **Attrs principales (J–M) a menudo vacíos** — el runner E2E manda attrs simplificados; el agente Kapso real debería poblar mejor vía `compile_staff_order_draft`.
4. **Excel genéricos** (LISTADO ADRIAN) → parse 0 filas; el agente debe pedir FORMATO LIFE o usar visión/`parsear_lista_imagen`.
5. **WhatsApp agent loop no ejecutado** — falta re-auth wacli o envío manual desde cel.

## Propuesta de mejora (priorizada)

### P0 — Formulario producción-ready
1. Semilla Formulario: exportar snapshot de un SO prod bueno → `spreadsheet.template` “Formulario Life Calculadora” en test+prod; buscar esa plantilla (no el Excel lista).
2. Nunca escribir `spreadsheet_data` al mismo tiempo que snapshot (ya aplicado); añadir test unitario de persistencia.
3. Excluir producto Diseño de filas Productos del pedido.
4. Checklist deploy: `bundle_odoo_partner_phone` + upsert + secrets.

### P1 — Staff WhatsApp E2E
1. Re-auth wacli; smoke send a Life; canary case_01 completo (CONFIRMO SUBIR).
2. Matriz: Excel FORMATO LIFE / imagen lista / multi-producto / qty&lt;6.
3. Observabilidad: loggear `spreadsheet.status|filled|error` en mensaje staff.

### P2 — UX / datos
1. Si parse `no_rows_parsed`, mensaje claro: “adjunte FORMATO PEDIDO LIFE”.
2. Gate `BASE_BELOW_MINIMUM` → mensaje humano + opción CONFIRMO.
3. Alinear fill inline con `lib/sale_order_spreadsheet.js` (una sola implementación).

## Cómo reproducir

```bash
# Packs ya creados
ls scratch/kapso_staff_e2e_2026-07-12/case_*

# Writer + Formulario (sin WhatsApp)
node kapso/scripts/run_staff_e2e_formulario_cases.js --from 1 --to 10

# WhatsApp (tras wacli auth)
wacli send file --to 573222252942 --file scratch/.../case_01/*.xlsx --caption "..."
wacli send text --to 573222252942 --message "CONFIRMO SUBIR"
```

## SO creados en test (limpieza opcional)

S02629–S02636 (+ intentos previos S02620–S02628). No confirmar.
