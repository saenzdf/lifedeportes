# Convenciones de Commits - Life Deportes

## 📋 Resumen de Convenciones

Este documento establece las convenciones de commits para mantener un historial de Git limpio, consistente y fácil de entender.

## 🎯 Tipos de Commits

### feat (Funcionalidades)
```bash
# Nueva característica o funcionalidad
git commit -m "feat(chatbot): implementar detección de productos por palabras clave

- Agregar análisis semántico de mensajes entrantes
- Mapear palabras clave como 'fútbol' → uniformes de fútbol
- Integrar con catálogo de precios de referencia
- Mejorar respuesta automática en primer contacto

Closes: #45"
```

### fix (Correcciones)
```bash
# Corrección de bugs
git commit -m "fix(api): resolver timeout en sincronización con n8n Cloud

- Aumentar timeout de 10s a 30s
- Implementar retry automático con backoff exponencial
- Agregar logging detallado para debugging
- Validar respuesta antes de procesar

Fixes: #67"
```

### docs (Documentación)
```bash
# Cambios en documentación
git commit -m "docs: actualizar guía de instalación con nuevos requisitos

- Agregar sección de variables de entorno
- Incluir ejemplos de configuración de n8n Cloud
- Añadir troubleshooting para errores comunes
- Actualizar diagramas de arquitectura

Refs: #89"
```

### refactor (Refactorización)
```bash
# Refactorización de código sin cambiar funcionalidad
git commit -m "refactor(workflow): simplificar lógica de clasificación de mensajes

- Extraer función isTextMessage() para reutilización
- Reorganizar estructura condicional para mejor lectura
- Eliminar código duplicado en detección de rutas
- Mejorar manejo de casos edge

Refs: #123"
```

### test (Testing)
```bash
# Agregar o modificar pruebas
git commit -m "test(chatbot): agregar tests unitarios para detección de productos

- Crear tests para función detectProductKeywords
- Agregar tests de edge cases y mensajes ambiguos
- Mockear dependencias externas (productos-life API)
- Verificar cobertura de código >80%

Refs: #156"
```

### chore (Mantenimiento)
```bash
# Tareas de mantenimiento y configuración
git commit -m "chore: actualizar dependencias y configurar pre-commit hooks

- Actualizar n8n-nodes-langchain a v3.3
- Configurar husky para validaciones pre-commit
- Agregar linting automático con eslint
- Optimizar build pipeline

Refs: #178"
```

### perf (Rendimiento)
```bash
# Mejoras de rendimiento
git commit -m "perf(api): optimizar búsqueda de productos con cache local

- Implementar cache LRU para consultas frecuentes
- Reducir llamadas a base de datos en 60%
- Agregar invalidación automática de cache cada 5 minutos
- Medir impacto: tiempo de respuesta de 2.1s → 0.8s

Refs: #189"
```

### build (Build y Dependencias)
```bash
# Cambios en sistema de build o dependencias
git commit -m "build(deps): actualizar Node.js a v20 y reconstruir proyecto

- Upgrade Node.js de v18 a v20 LTS
- Actualizar todos los packages a última versión compatible
- Resolver conflictos de dependencias
- Verificar compatibilidad con n8n Cloud

Refs: #201"
```

### ci (CI/CD)
```bash
# Cambios en integración continua
git commit -m "ci: configurar GitHub Actions para testing automático

- Agregar workflow de testing en cada push
- Configurar matriz de testing para Node.js v18/v20
- Automatizar deployment a n8n Cloud en merges a main
- Agregar notificaciones de Slack para fallos

Refs: #223"
```

## 🏷️ Scopes (Alcances)

### Scopes Principales

- **chatbot**: Cambios en el bot de Telegram
- **workflow**: Modificaciones en workflows de n8n
- **api**: Cambios en APIs y integraciones externas
- **database**: Modificaciones en base de datos o esquemas
- **config**: Cambios en configuración
- **docs**: Solo documentación
- **ui**: Cambios en interfaz de usuario
- **security**: Mejoras de seguridad

### Scopes Específicos del Proyecto

```bash
feat(chatbot): nueva funcionalidad del bot
feat(workflow): nuevo workflow de n8n
feat(api): integración con servicio externo
fix(chatbot): corrección en respuestas del bot
refactor(workflow): reorganizar lógica de workflow
test(workflow): agregar pruebas a workflows
```

## 📝 Plantillas de Commits

### Para Nuevas Funcionalidades
```
feat(scope): descripción breve de la funcionalidad

Explicación detallada de qué se implementó y por qué es necesario.

Changes made:
- Primera mejora específica
- Segunda mejora específica
- Tercera mejora específica

Testing:
- Cómo fue probado el cambio
- Qué casos edge se consideraron

Closes/Fixes: #número
```

### Para Correcciones de Bugs
```
fix(scope): descripción del bug corregido

Descripción del problema encontrado y cómo fue solucionado.

Root cause:
- Explicación técnica del problema
- Por qué ocurría el bug

Solution:
- Enfoque utilizado para la solución
- Alternativas consideradas

Testing:
- Pasos para reproducir el bug original
- Verificación de que la solución funciona

Fixes: #número
```

### Para Refactorización
```
refactor(scope): qué fue refactorizado y por qué

Explicación de por qué se hizo la refactorización y qué beneficios aporta.

Changes:
- Qué archivos fueron modificados
- Patrones de diseño aplicados
- Mejoras en legibilidad/performance

Impact:
- Breaking changes (si los hay)
- Mejoras en performance
- Facilita futuras modificaciones

Refs: #número
```

## ✅ Buenas Prácticas

### ❌ NO Hacer

```bash
# Commits muy genéricos
git commit -m "fix bug"
git commit -m "update"
git commit -m "changes"

# Commits sin contexto
git commit -m "feat: improve system"

# Cambios múltiples sin relación
git commit -m "feat: chatbot + fix database + update docs"

# Mensajes muy largos (>50 caracteres en primera línea)
git commit -m "feat: implement very long feature description that exceeds normal length and should be split"
```

### ✅ SÍ Hacer

```bash
# Específico y descriptivo
git commit -m "feat(chatbot): agregar detección automática de productos deportivos"

# Enfoque en un cambio
git commit -m "fix(api): resolver timeout en productos-life query"

# Incluir contexto cuando es necesario
git commit -m "refactor(workflow): extraer lógica de validación a función separada

- Mejora legibilidad del código principal
- Permite reutilización en otros workflows
- Facilita testing unitario"

# Referencias a issues cuando aplica
git commit -m "docs: actualizar troubleshooting para error #156

Closes: #156"
```

## 🔍 Commits para Tipos Específicos

### Para Workflows de n8n
```bash
# Agregar workflow nuevo
git commit -m "feat(workflow): crear workflow de notificaciones SMS

- Integrar con API de Twilio
- Enviar confirmaciones de pedido por SMS
- Reemplazar notificaciones solo por email
- Configurar templates de mensajes personalizados"

# Modificar workflow existente
git commit -m "fix(workflow): corregir error en workflow_post_venta

- Agregar validación de archivo antes de procesar
- Manejar casos de archivos Excel vacíos
- Mejorar logging para debugging
- Prevenir crashes en producción"
```

### Para Integraciones con APIs
```bash
# Nueva integración
git commit -m "feat(api): integrar búsqueda de productos con Qdrant vector DB

- Configurar conexión con Qdrant Cloud
- Implementar búsqueda semántica de productos
- Cache de resultados para queries frecuentes
- Fallback a búsqueda por texto cuando falla vector search"

# Actualizar integración existente
git commit -m "refactor(api): optimizar llamadas a Odoo API

- Implementar connection pooling
- Reducir queries redundantes en 40%
- Agregar retry logic con exponential backoff
- Mejorar error handling y logging"
```

## 📊 Commit Hooks Recomendados

### Pre-commit Hook
```bash
#!/bin/sh
# .git/hooks/pre-commit

# Verificar que el mensaje de commit sigue convenciones
commit_regex='^(feat|fix|docs|style|refactor|test|chore|perf|build|ci)(\(.+\))?: .{1,50}'

if ! grep -qE "$commit_regex" "$1"; then
    echo "❌ ERROR: Mensaje de commit no sigue convenciones."
    echo "Formato: tipo(scope): descripción (máximo 50 caracteres)"
    echo "Tipos válidos: feat, fix, docs, style, refactor, test, chore, perf, build, ci"
    exit 1
fi

# Verificar que no hay archivos grandes
if [ $(du -k "$1" | cut -f1) -gt 1024 ]; then
    echo "⚠️  WARNING: El commit es muy grande. Considera dividirlo."
fi

echo "✅ Pre-commit validations passed"
```

## 🛠️ Herramientas Útiles

### Conventional Commits CLI
```bash
# Instalar conventional-commits
npm install -g commitizen

# Usar para generar commits con formato correcto
cz commit
```

### Gitmoji
```bash
# Usar emojis en commits para mayor claridad
git commit -m "🎉 feat(chatbot): implementar respuestas con precios inmediatos

- Agregar catálogo de precios de referencia
- Mejorar UX con respuestas más rápidas
- Reducir friction en proceso de cotización

Closes: #45"
```

---

## 📋 Checklist Pre-Commit

Antes de hacer commit, verificar:

- [ ] Mensaje sigue formato: `tipo(scope): descripción`
- [ ] Primera línea máximo 50 caracteres
- [ ] Descripción clara del cambio
- [ ] Incluir contexto adicional si es necesario
- [ ] Referencias a issues cuando aplica
- [ ] Un solo tipo de cambio por commit
- [ ] Tests incluidos si aplica
- [ ] Documentación actualizada si es necesario

**Última actualización**: 2025-11-23  
**Versión**: 1.0.0