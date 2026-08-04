# Catálogo semántico Life Deportes v1

Archivo máquina: `life_catalog_semantic_v1.json` (generado con `node kapso/scripts/build_semantic_catalog.js`).

## Propósito

- Entrenar / documentar cómo mapear **lenguaje coloquial** → **producto Odoo** + **variante**.
- Alimentar `buscar_producto_odoo` (`functions/lib/product_match_engine.js`).
- Conocimiento embebido en prompt staff: `prompts/knowledge_staff_catalog_v1.md`.

## Regenerar

```bash
cd lifedeportes/kapso
node scripts/build_semantic_catalog.js
node scripts/bundle_odoo_search_function.js
node tests/run_product_match_tests.js
```

## Deploy function Kapso

```bash
node scripts/bundle_odoo_search_function.js
node ../../.agents/skills/automate-whatsapp/scripts/update-function.js \
  --function-id 4503ca5c-7114-4442-bada-112be3ddf67e \
  --name odoo-search-product-price \
  --code-file functions/odoo_search_product_price.js
node scripts/deploy-function.js  # si existe wrapper en proyecto
```

## Tests

`node kapso/tests/run_product_match_tests.js` — 9 casos de frases coloquiales.

## Próximo (vendedor)

Reusar el mismo motor en agente vendedor cuando se embeba `agent_vendedor_v3` + ampliar `input_schema` del tool en ese nodo.
