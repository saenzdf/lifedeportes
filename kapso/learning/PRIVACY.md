# Política de datos para aprendizaje comercial

## Alcance

- Solo conversaciones comerciales de ventas.
- Nómina, compras, comprobantes de pago y datos laborales no entran al corpus.
- El corpus de trabajo contiene únicamente mensajes de clientes relacionados con producto, precio o cotización.

## Retención

- Exportaciones crudas: acceso restringido y eliminación dentro de 90 días.
- Corpus anonimizado: local, no versionado y revisable.
- Conservación permanente: solo ejemplos desidentificados, etiquetas, aliases y métricas agregadas.

## Anonimización mínima

Antes del análisis se eliminan o sustituyen:

- teléfono, correo, URL y números largos;
- nombre declarado por el cliente;
- enlaces y metadatos de adjuntos;
- nombre de contacto e identificadores directos de conversación.

El identificador de conversación se reemplaza por un HMAC con `LIFE_LEARNING_SALT`, secreto local no versionado.

## Revisión

El script reduce PII evidente, pero no garantiza anonimización perfecta de texto libre. Antes de incorporar un ejemplo a `golden_cases.json`, una persona debe verificar que no contenga nombres, teléfonos, direcciones, documentos, cuentas bancarias ni información de terceros.
