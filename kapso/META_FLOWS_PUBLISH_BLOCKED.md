# WhatsApp Flows — publicación bloqueada por Meta (#139000)

## Estado (2026-04-21)

Los 3 Flows (`quote_intake_v1`, `payment_ack_v1`, `order_details_v1`) están:

- Creados en Kapso y en Meta con `meta_flow_id` válido.
- JSON **validado sin errores** (v7.3, labels ≤ 20 caracteres, helper-text para detalle).
- **Cifrado configurado** (`flows_encryption_configured: true`, setup exitoso por API).
- **En `draft`**. `published_at: null`.

Al intentar publicar:

```
POST /platform/v1/whatsapp/flows/<id>/publish
→ 422 { "error": "Integrity requirements not met." }  (Meta code 139000)
```

Este error **no se resuelve por API ni editando el JSON**. Es una evaluación de cumplimiento que Meta hace sobre la WABA/Business Manager.

## Qué ya comprobamos

| Chequeo | Valor | Estado |
|---|---|---|
| `phone_number_id` | `1081649091701994` | `CONNECTED`, `quality_rating: GREEN`, `code_verification_status: VERIFIED` |
| `display_phone_number` | `3000000069` | OK |
| `name_status` | `AVAILABLE_WITHOUT_REVIEW` | Pista: no ha pasado revisión de display name |
| `is_official_business_account` | `false` | No requerido para Flows, pero suma |
| `flows_encryption_configured` | `true` | ✓ |
| Flow JSON validation | `validation_errors: null` | ✓ |
| Business account id | `1935759060383719` | Revisar verificación abajo |

## Causas conocidas del #139000 (orden de probabilidad)

1. **Business Verification incompleta o en proceso** en Meta Business Manager. Aunque aparezca "verified" en algunos tableros, el estado puede no estar sincronizado en todos los servicios. Mientras diga "in progress" en cualquier pantalla, Flows queda bloqueado.
2. **Display name sin revisión de Meta** (`name_status: AVAILABLE_WITHOUT_REVIEW`). Pedir revisión/aprobación del display name suele liberar Flows.
3. **Account maturity / número sin historial** de mensajería. Cuentas nuevas con poco volumen a veces se bloquean hasta acumular historial.
4. **Falta System User asignado** a la App **y** a la WABA. Varios reportes confirman que creando un System User en Business Manager y asignándolo a ambas entidades se desbloquea.
5. **Gaps de permisos/2FA**. La cuenta admin necesita 2FA habilitado.

## Pasos para desbloquear (manuales, en UI web de Meta)

Hacer por orden hasta que `POST /publish` deje de dar 422.

### 1) Confirmar Business Verification

- Abrir <https://business.facebook.com/settings/security> con el Business Manager dueño de la WABA `1935759060383719`.
- Verificar que "Business Verification" esté **Verified** (no "In progress", no "Not started").
- Si falta: iniciar, subir documentos (RUT, certificado cámara de comercio para Colombia), esperar aprobación (usualmente 1–3 días hábiles).

### 2) Pedir revisión del display name

- Abrir <https://business.facebook.com/wa/manage/phone-numbers> → seleccionar `3000000069` → "Display name".
- Si dice `AVAILABLE_WITHOUT_REVIEW`, editar y guardar; Meta disparará revisión. Idealmente el nombre debe coincidir con la marca legal o una marca ampliamente conocida de la empresa.
- Esperar a que pase a `APPROVED`.

### 3) Crear System User y asignarlo

- <https://business.facebook.com/settings/system-users>
- Crear System User tipo **Admin**.
- Asignar:
  - La **App** de Meta for Developers que gestiona la WABA (Business Settings → Apps).
  - La **WhatsApp Business Account** `1935759060383719` con rol Admin.
- Generar token (System User access token) con permisos `whatsapp_business_management` y `whatsapp_business_messaging`.
- Compartir ese token con Kapso si aplica (normalmente Kapso ya tiene sus propias credenciales; este paso es más por si hay un check en Meta de que exista un System User sobre la cuenta).

### 4) Revisar Security Center de la cuenta personal admin

- El usuario administrador debe tener **2FA habilitado**.
- Completar "Two-factor authentication" en <https://www.facebook.com/security/2fac/settings>.

### 5) Volver a intentar publicar

Desde el repo, con el skill cargado:

```bash
cd ~/.agents/skills/integrate-whatsapp
set -a && . "/Users/diego/Documents/Sync/projects/lifedeportes/.env" && set +a

for F in \
  dab204cd-5b66-4c3c-9e55-7cee3baf2119 \
  a15f28c3-dae7-4857-9c92-8b9635053edf \
  1477ca63-048b-4757-a011-9a45166c75da; do
  echo "=== $F ===";
  node scripts/publish-flow.js --flow-id $F;
done
```

## Mientras no se desbloquee

El workflow Kapso `lifedeportes_sales_inbound` está coherente y funcional para las ramas que **no** mandan Flow:

- `conversation` → el **AI Agent** responde directamente (funciona hoy).

Las 3 ramas que mandan `send_interactive(flow)` probablemente fallen en runtime hasta publicar. Dos opciones mientras tanto:

- **A. Dejar las ramas apuntando al Flow** (estado actual). Cuando publiques, todo se arregla solo. Costo: si el cliente cae en `quote_new` / `payment_form` / `order_details`, no recibirá respuesta.
- **B. Sustituir temporalmente por `send_text` + ruta al agente**. Menos elegante pero no deja al cliente colgado.

Si prefieres B, dime y edito el JSON para que las 3 ramas hagan `send_text` con un mensaje guía y después terminen (o enruten al agente).

## Referencias

- [Stack Overflow: Whatsapp Flows integrity requirements error](https://stackoverflow.com/questions/79815907/whatsapp-flows-sending-publishing-error-integrity-requirements)
- [Meta Developer Community — Integrity Failure on Verified WABA](https://developers.facebook.com/community/threads/1198712428529116/)
- [Reddit fix — System User assignment unblocks flows](https://www.reddit.com/r/WhatsappBusinessAPI/comments/1s63b3u/heres_how_to_fix_whatsapp_flows_unable_to_publish/)
