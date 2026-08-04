# Tools lista pedido — agente staff (v7)

Deploy: `bash kapso/scripts/deploy_order_detail_lane.sh`

## Tools Kapso (`flow_agent_function_tools`)

| Tool agente | Function Kapso | Archivo fuente |
|-------------|----------------|----------------|
| `clasificar_adjuntos_pedido` | `clasificar-adjuntos-pedido` | `functions/classify_order_attachments.js` |
| `parsear_lista_excel_pedido` | `parsear-lista-excel-pedido` | `functions/parse_order_detail_excel.js` |
| `parsear_lista_texto_pedido` | `parsear-lista-texto-pedido` | `functions/parse_order_detail_text.js` |
| `parsear_lista_imagen_pedido` | `parsear-lista-imagen-pedido` | `functions/parse_order_detail_image.js` |
| `parsear_lista_pdf_pedido` | `parsear-lista-pdf-pedido` | `functions/parse_order_detail_pdf.js` |
| `registrar_adjuntos_pedido` | `registrar-adjuntos-pedido` | `functions/register_order_attachments.js` |
| `fusionar_borrador_lista` | `fusionar-borrador-lista` | `functions/merge_order_detail_draft.js` |

IDs prod: `kapso/docs/order_detail_function_ids.json`

## Libs compartidas

- `functions/lib/order_detail_shared.js` — adjuntos, filas, vars
- `functions/lib/parse_life_text_lines.js` — texto / JSON visión
- `functions/lib/parse_life_excel.js` — Excel FORMATO PEDIDO (ZIP+XML)
- `functions/lib/parse_life_pdf.js` — PDF FORMATO LIFE (`formato_life_pdf_v1`; fflate + binary string, no TextDecoder latin1 en Workers)
- `functions/lib/merge_order_detail_draft.js` — fusión y validación
- `functions/lib/odoo_attach_from_url.js` — referencia (inline en `odoo_create_lead_and_so.js`)

## Tests

```bash
node kapso/tests/run_order_detail_tools_tests.js
node kapso/scripts/bundle_order_detail_tools.js
```

## Grafo

- Prompt: `prompts/agent_staff_upload_v7_slim.md`
- KB: `knowledge/life_lista_pedido_staff_v1.md`
- Patch: `scripts/build_graph_v10_order_detail.js`

## Write Odoo

`odoo-create-lead-and-so` sube `order_draft.attachments[]` a `ir.attachment` del SO borrador.
