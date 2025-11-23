# Workflow de Desarrollo Git - Life Deportes

## 🎯 Objetivo
Establecer un flujo de trabajo profesional para el desarrollo colaborativo y la gestión de versiones del proyecto Life Deportes.

## 🌳 Estrategia de Branching

### Estructura de Ramas

```
main (producción)
├── develop (desarrollo)
├── feature/* (nuevas funcionalidades)
├── bugfix/* (corrección de errores)
├── hotfix/* (correcciones urgentes en producción)
└── release/* (preparación de versiones)
```

### Convenciones de Nombres

- **Features**: `feature/nombre-descriptivo`
- **Bugfixes**: `bugfix/descripcion-del-bug`
- **Hotfixes**: `hotfix/urgencia-descripcion`
- **Releases**: `release/v1.0.0`

### Ejemplos
```bash
git checkout -b feature/implementar-chatbot-telegram
git checkout -b bugfix/corregir-flujo-precios-inmediatos
git checkout -b hotfix/critical-error-cotizacion
git checkout -b release/v1.1.0
```

## 🔄 Flujo de Trabajo (Git Flow)

### 1. Desarrollo de Features

```bash
# 1. Crear rama desde develop
git checkout develop
git pull origin develop
git checkout -b feature/nueva-funcionalidad

# 2. Desarrollo y commits
git add .
git commit -m "feat: agregar nueva funcionalidad"

# 3. Subir rama y crear Pull Request
git push origin feature/nueva-funcionalidad

# 4. Code review y merge
# Merge a develop después de revisión
```

### 2. Corrección de Bugs

```bash
# Bugs en desarrollo
git checkout develop
git checkout -b bugfix/descripcion-del-problema

# Bugs urgentes en producción
git checkout main
git checkout -b hotfix/correccion-urgente
```

### 3. Release de Versiones

```bash
# Preparar release
git checkout develop
git checkout -b release/v1.1.0

# Actualizar versionado en README.md y documentación
# Ejecutar testing completo
git commit -m "docs: actualizar versión a v1.1.0"

# Merge a main y develop
git checkout main
git merge release/v1.1.0
git tag v1.1.0
git push origin main --tags

git checkout develop
git merge release/v1.1.0
```

## 📝 Convenciones de Commits

### Formato de Commits
```
tipo(scope): descripción corta

Descripción más detallada si es necesario.

- Lista de cambios específicos
- Referencias a issues (#123)
```

### Tipos de Commits

- **feat**: Nueva funcionalidad
- **fix**: Corrección de error
- **docs**: Cambios en documentación
- **style**: Formateo, puntuación, etc. (sin cambio de lógica)
- **refactor**: Refactorización de código
- **test**: Agregar o modificar pruebas
- **chore**: Tareas de mantenimiento, configuración
- **perf**: Mejoras de rendimiento
- **ci**: Cambios en CI/CD
- **build**: Cambios en build o dependencias

### Ejemplos de Commits

```bash
# Buena práctica
git commit -m "feat(workflow): implementar precios inmediatos en chatbot

- Agregar catálogo de precios de referencia
- Modificar lógica de respuesta para consultas genéricas
- Mantener flexibilidad para refinamiento posterior

Resolves: #45"

git commit -m "fix(api): corregir timeout en sincronización n8n

- Aumentar timeout a 30 segundos
- Implementar retry con backoff exponencial
- Agregar logging detallado para debugging

Refs: #67"

git commit -m "docs: actualizar README con guía de instalación

- Agregar sección de prerrequisitos
- Incluir ejemplos de configuración de variables
- Añadir troubleshooting común"
```

### Commits Consecutivos para Mismo Feature

```bash
# Primer commit - lógica básica
git commit -m "feat(chatbot): agregar detección de palabras clave

- Implementar análisis semántico de mensajes
- Mapear palabras clave a categorías de productos
- Integrar con sistema de precios de referencia"

# Segundo commit - mejoras
git commit -m "feat(chatbot): optimizar respuestas y manejo de errores

- Mejorar redacción de respuestas automáticas
- Agregar fallback para consultas no reconocidas
- Implementar logging de conversaciones"

# Commit final - testing y documentación
git commit -m "test(chatbot): agregar pruebas unitarias y documentación

- Crear tests para detección de palabras clave
- Documentar casos de uso en user-guide
- Actualizar API reference"
```

## 🧪 Testing y Quality Assurance

### Pre-commit Checklist

Antes de cada commit, verificar:

- [ ] Código sigue convenciones del proyecto
- [ ] Tests pasan correctamente
- [ ] Documentación actualizada si es necesario
- [ ] No hay credenciales o datos sensibles
- [ ] Mensaje de commit sigue convenciones
- [ ] Archivos relevantes incluidos en el commit

### Comandos de Testing

```bash
# Ejecutar todos los tests
npm run test

# Tests específicos
npm run test:unit
npm run test:integration
npm run test:e2e

# Verificar cobertura
npm run test:coverage

# Linting y formateo
npm run lint
npm run format
```

## 🔧 Configuración de Git

### Aliases Útiles

```bash
# Configurar aliases
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.st status
git config --global alias.unstage 'reset HEAD --'
git config --global alias.last 'log -1 HEAD'
git config --global alias.visual '!gitk'

# Aliases personalizados para el proyecto
git config --global alias.feature 'checkout -b'
git config --global alias.publish 'push -u origin'
git config --global alias.unpublish 'push origin --delete'
git config --global alias.merge-to 'checkout develop && merge'
git config --global alias.tag-release 'tag -a v'
```

### Configuración de Editor

```bash
# Configurar VS Code como editor por defecto
git config --global core.editor "code --wait"

# Configurar diff tool
git config --global diff.tool vscode
git config --global difftool.vscode.cmd 'code --wait --diff $LOCAL $REMOTE'
```

## 📦 Gestión de Versiones

### Versionado Semántico

Usamos **SemVer** (Semantic Versioning):

- **MAJOR**: Cambios que rompen compatibilidad hacia atrás
- **MINOR**: Nuevas funcionalidades compatibles hacia atrás
- **PATCH**: Correcciones de bugs compatibles

### Ejemplos

```bash
v1.0.0 - Release inicial
v1.1.0 - Nueva funcionalidad (chatbot mejorado)
v1.1.1 - Corrección de bug en cotización
v2.0.0 - Breaking changes (nueva arquitectura)
```

### Tagging

```bash
# Crear annotated tag
git tag -a v1.1.0 -m "Release versión 1.1.0: Precios inmediatos"

# Push tags
git push origin --tags

# Ver tags
git tag -l

# Ver detalles de tag
git show v1.1.0
```

## 🔄 Proceso de Merge

### Pull Requests

1. **Crear PR desde feature branch hacia develop**
2. **Descripción debe incluir**:
   - Qué problema resuelve
   - Cómo fue implementado
   - Testing realizado
   - Screenshots/videos si aplica
3. **Code review obligatorio**
4. **Todos los tests deben pasar**
5. **Merge con squash and merge**

### Merge Strategies

```bash
# Para features (recomendado)
git merge --squash feature/nueva-funcionalidad

# Para hotfixes (preserve history)
git merge --no-ff hotfix/correccion-urgente

# Para releases
git merge --no-ff release/v1.1.0
```

## 🚨 Resolución de Conflictos

### Comandos Útiles

```bash
# Ver conflictos
git status
git diff

# Abortar merge en progreso
git merge --abort

# Resolver conflictos manualmente
# Editar archivos en conflicto
git add .
git commit -m "resolve: conflictos en merge de feature/chatbot"

# Usar mergetool (VS Code)
git mergetool

# Ver historial para entender contexto
git log --oneline --graph --decorate --all
```

## 📊 Monitoreo y Métricas

### Git Logs Personalizados

```bash
# Ver actividad por autor
git log --oneline --author="Diego" --since="1 week ago"

# Ver commits por tipo
git log --oneline --grep="feat:" --grep="fix:" --grep="docs:"

# Ver cambios por archivo
git log --oneline workflows/n8n/

# Ver estadísticas
git log --stat --since="1 month ago"
```

### Workflow Analytics

```bash
# Commits por semana
git log --since="4 weeks ago" --oneline | wc -l

# Archivos más modificados
git log --name-only --pretty=format: | sort | uniq -c | sort -nr | head -10

# Contribuidores activos
git log --format='%aN' | sort -u
```

## 🛡️ Best Practices

### Seguridad
- Nunca commitear credenciales o API keys
- Usar `.gitignore` apropiadamente
- Revisar archivos antes de commit
- Usar branches para trabajo experimental

### Colaboración
- Commits pequeños y frecuentes
- Mensajes descriptivos
- Code review constructivo
- Comunicación clara en PRs

### Performance
- Clonar con `--depth 1` para repos grandes
- Usar `git gc` periódicamente
- Configurar `.gitattributes` para archivos grandes
- Evitar binary files cuando sea posible

## 🔗 Recursos Adicionales

- [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)
- [Conventional Commits](https://conventionalcommits.org/)
- [Git Best Practices](https://git-scm.com/book/en/v2/Git-Branching-Branching-Workflows)
- [Pro Git Book](https://git-scm.com/book)

---

**Última actualización**: 2025-11-23
**Mantenido por**: Diego - Life Deportes