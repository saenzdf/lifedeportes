# Evaluación y salida gradual — ventas y pedidos staff

## Señales observables

### Descubrimiento de producto

- exactitud top-1 y top-3 contra `learning/golden_cases.json`;
- `match_confidence`, candidatos y diferencia de score;
- `missing_dimensions` y pregunta aclaratoria elegida;
- número de preguntas hasta producto resuelto;
- precio con `price_source=odoo_live`;
- solicitudes de foto sin imagen publicada del producto exacto.

### Ingreso staff

- `staff.input_route`: formato, confianza, parser y modo;
- `order_draft.detail.parse_status`, warnings y conteo por persona/componentes;
- SO siempre en `draft`, con `needs_review` cuando el parseo sea parcial o agentico;
- `idempotency_key`, `deduplicated` y cantidad de intentos;
- adjuntos esperados, subidos y errores;
- correcciones humanas al producto, cantidad y detalle final.

No registrar texto crudo, teléfono, nombres ni URLs en métricas agregadas.

## Secuencia de despliegue

### 1. Replay offline

Ejecutar:

```bash
node kapso/scripts/run_architecture_checks.js
```

Gate:

- 100 % en casos críticos (`camiseta`, draft-only, idempotencia, foto exacta);
- al menos 95 % top-1 cuando el conjunto oro tenga 20 casos o más;
- cero detecciones de PII en fixtures versionados;
- grafo válido, sin nodos huérfanos ni Functions archivadas.

### 2. Observer

Reproducir conversaciones recientes sin enviar mensajes ni escribir en Odoo. Comparar propuesta con decisión del staff y SO final.

Gate mínimo: 20 conversaciones evaluables, top-1 ≥ 90 %, cero precios inventados y cero fotos de productos distintos.

### 3. Canary staff

Habilitar solo para staff autorizado. Revisar los primeros 10 borradores antes de confirmarlos manualmente.

Gate:

- 0 SO duplicados;
- 100 % en estado `draft`;
- 100 % de ingresos agenticos con `needs_review`;
- 100 % de archivos originales presentes o error de adjunto visible;
- tasa de corrección de producto/cantidad ≤ 10 %.

Si falla un hard gate, detener canary, conservar el borrador para auditoría y volver a replay.

### 4. Canary clientes

Solo después de aprobar observer y canary staff. Empezar con contactos internos o porcentaje pequeño, manteniendo handoff humano.

Medir: preguntas hasta resolución, handoff, abandono después de precio, corrección de producto y solicitudes de foto sin publicación.

## Publicación

1. Empaquetar Functions generadas.
2. Refrescar prompts/KB con `embed_agent_knowledge.js`.
3. Ejecutar `run_architecture_checks.js`.
4. Seguir `kapso-graph-guard`: obtener grafo remoto y `lock_version`, validar y actualizar con esa versión.
5. Confirmar Functions y grafo remotos después del despliegue.

La fase actual no autopublica aliases ni conocimiento.
