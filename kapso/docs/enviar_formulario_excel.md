# Enviar Formulario Life (Excel) por WhatsApp

Asset: `kapso/assets/Formulario-detalle-pedido.xlsx`  
Function: `enviar-formulario-excel` · tool `enviar_formulario_excel`

## Qué hace

Envía el **Formulario detalle pedido** (`.xlsx`) como documento WhatsApp.

| Quién | Frase / trigger | Destino |
|-------|-----------------|--------|
| **Cliente** (agente vendedor) | Cómo enviar la lista, tallas, nombres, “me manda el formato/excel” | Mismo chat del cliente |
| **Staff** | `ENVIAR EXCEL DETALLE` · “envíale el excel/formato a Emmanuelle” | WA del cliente (`customer_phone`) |

## Flujo staff

1. (Si no hay teléfono) `buscar_oportunidad_odoo` → toma phone del CRM.
2. `enviar_formulario_excel` con `customer_phone` (o ya en `vars.quote` / lead).
3. Confirmar a staff: “Listo, envié el Formulario a …”.

Ventana 24h: si Meta rechaza, usar **`ENVIAR RETOMAR`** (`enviar_retomar_pedido`) y, cuando el cliente responda, reenviar el Excel. Doc: `enviar_retomar_pedido.md`.

## Flujo vendedor

1. Cliente pregunta por lista/tallas/formato.
2. Tool `enviar_formulario_excel` (sin teléfono; usa el WA del chat).
3. Mensaje corto + `enter_waiting`. **No** inventar columnas a mano si ya mandó el archivo.

## Deploy

```bash
cd projects/lifedeportes
node kapso/scripts/deploy_enviar_formulario_excel.js
node kapso/scripts/embed_agent_knowledge.js
# luego publish grafo (deploy_graph_kb_progressive / update-graph)
```

Secrets de la function: `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, opcional `LIFE_FORMULARIO_MEDIA_ID` (cache; si expira ~30d, re-sube el xlsx embebido en B64).

## Caption default

> Formulario Life para la lista del pedido (nombre, talla, número, manga, género). Llénele y envíelo por este WhatsApp.
