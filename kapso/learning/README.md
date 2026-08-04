# Aprendizaje editorial Life Deportes

Kapso ejecuta conocimiento validado. Cursor es el taller donde se revisan conversaciones, se proponen aliases regionales, se crean regresiones y se publican cambios versionados.

## Ciclo

1. Exportar conversaciones de Kapso a `scratch/` con acceso restringido.
2. Construir el corpus anonimizado:

   ```bash
   LIFE_LEARNING_SALT="valor-local-no-versionado" \
     node kapso/scripts/build_learning_corpus.js
   ```

3. Revisar `kapso/learning/out/conversations_anonymized.jsonl`; etiquetar únicamente ejemplos útiles.
4. Registrar aliases propuestos en `aliases_candidates.json` con evidencia desidentificada.
5. Convertir cada decisión aceptada en un caso de `golden_cases.json` y, cuando corresponda, en `run_product_match_tests.js`.
6. Actualizar KB o catálogo semántico, ejecutar evaluación y revisar el diff.
7. Empaquetar Functions, refrescar el grafo, validar con `kapso-graph-guard` y publicar de forma controlada.

## Estados editoriales

- `candidate`: propuesta todavía sin efecto en runtime.
- `active`: alias aprobado, probado e incorporado al catálogo o KB.
- `rejected`: evidencia insuficiente, ambigua o conflictiva.

No se autopublican aliases. El modo sombra automático queda fuera de esta fase.

## Fuente de verdad

Una interpretación se considera correcta solo cuando coincide con:

- una aprobación/corrección explícita del staff; y
- el producto y cantidades del SO que quedó listo o fue confirmado en Odoo.

Que la conversación continúe o termine no demuestra que la interpretación haya sido correcta.

## Salidas no versionadas

`kapso/learning/out/` contiene corpus derivados y permanece ignorado por Git. Solo se versionan casos desidentificados, aliases editoriales, scripts y métricas agregadas.
