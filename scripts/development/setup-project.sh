#!/bin/bash

# Script de configuración inicial del proyecto Life Deportes
# Automatiza el setup completo para nuevos desarrolladores

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función de logging
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Banner
echo -e "${BLUE}"
echo "=========================================="
echo "   LIFE DEPORTES - SETUP INICIAL"
echo "   Configuración Automática del Proyecto"
echo "=========================================="
echo -e "${NC}"

# Verificar que estamos en el directorio correcto
if [ ! -f "README.md" ] || [ ! -d ".git" ]; then
    log_error "Este script debe ejecutarse desde la raíz del proyecto Life Deportes"
    exit 1
fi

log_info "Iniciando configuración automática..."

# 1. Configurar Git global si no está configurado
log_info "Verificando configuración de Git..."
if ! git config --global user.name > /dev/null 2>&1; then
    log_warning "Configuración de Git incompleta"
    echo "Por favor, configura tu identidad de Git:"
    echo "git config --global user.name 'Tu Nombre'"
    echo "git config --global user.email 'tu@email.com'"
    echo ""
fi

# 2. Configurar aliases de Git
log_info "Configurando aliases de Git..."
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.st status
git config --global alias.unstage 'reset HEAD --'
git config --global alias.last 'log -1 HEAD'
git config --global alias.visual '!gitk'

# Aliases específicos del proyecto
git config --global alias.feature 'checkout -b'
git config --global alias.publish 'push -u origin'
git config --global alias.merge-to 'checkout develop && merge'
git config --global alias.tag-release 'tag -a v'

log_success "Aliases de Git configurados"

# 3. Configurar hooks de pre-commit
log_info "Configurando hooks de pre-commit..."

# Crear directorio de hooks si no existe
mkdir -p .git/hooks

# Hook de validación de mensajes de commit
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
# Pre-commit hook para Life Deportes

# Verificar que el mensaje de commit sigue convenciones
commit_regex='^(feat|fix|docs|style|refactor|test|chore|perf|build|ci)(\(.+\))?: .{1,50}'

if ! grep -qE "$commit_regex" "$1" 2>/dev/null; then
    echo "❌ ERROR: Mensaje de commit no sigue convenciones."
    echo "Formato: tipo(scope): descripción (máximo 50 caracteres)"
    echo "Tipos válidos: feat, fix, docs, style, refactor, test, chore, perf, build, ci"
    echo ""
    echo "Ejemplos:"
    echo "  feat(chatbot): agregar nueva funcionalidad"
    echo "  fix(api): corregir timeout en integración"
    echo "  docs: actualizar documentación"
    exit 1
fi

echo "✅ Mensaje de commit válido"
EOF

# Hook para verificar archivos grandes
cat >> .git/hooks/pre-commit << 'EOF'

# Verificar que no se agreguen archivos de credenciales
if git diff --cached --name-only | grep -qE '\.(env|key|pem|p12)$'; then
    echo "❌ ERROR: Archivos de credenciales no pueden ser commitados"
    echo "Agrega estos archivos a .gitignore"
    exit 1
fi

echo "✅ Validaciones de archivos completadas"
EOF

chmod +x .git/hooks/pre-commit
log_success "Hooks de pre-commit configurados"

# 4. Crear archivos de configuración local
log_info "Creando archivos de configuración..."

# Crear archivo de variables de entorno de ejemplo
cat > config/local/.env.example << 'EOF'
# Configuración de Telegram Bot
TELEGRAM_BOT_TOKEN=tu_token_de_botfather
TELEGRAM_WEBHOOK_URL=https://tu-dominio.com/webhook

# Configuración de Odoo
ODOO_URL=https://tu-instancia.odoo.com
ODOO_USERNAME=tu_usuario
ODOO_PASSWORD=tu_password

# Configuración de Qdrant
QDRANT_URL=https://tu-cluster.qdrant.io
QDRANT_API_KEY=tu_api_key

# Base de datos PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_DATABASE=life_deportes
POSTGRES_USERNAME=tu_usuario
POSTGRES_PASSWORD=tu_password

# Google Gemini API
GOOGLE_GEMINI_API_KEY=tu_api_key

# Configuración de n8n Cloud
N8N_CLOUD_API_URL=https://tu-instancia.app.n8n.cloud/api/v1
N8N_CLOUD_API_KEY=tu_cloud_api_key
EOF

log_success "Archivo .env.example creado"

# 5. Crear package.json para scripts npm
log_info "Configurando scripts de desarrollo..."

if [ ! -f "package.json" ]; then
    cat > package.json << 'EOF'
{
  "name": "life-deportes",
  "version": "1.0.0",
  "description": "Sistema de automatización de ventas Life Deportes",
  "main": "index.js",
  "scripts": {
    "dev": "echo 'Modo desarrollo - scripts disponibles:",
    "dev:help": "  npm run setup    - Configuración inicial",
    "dev:sync   - Sincronizar con n8n Cloud",
    "dev:test   - Ejecutar tests",
    "dev:lint   - Verificar código',
    "setup": "./scripts/development/setup-project.sh",
    "sync:cloud": "./scripts/deployment/sync-n8n-cloud.sh to-cloud",
    "sync:status": "./scripts/deployment/sync-n8n-cloud.sh status",
    "test": "echo 'Ejecutar tests unitarios'",
    "test:integration": "echo 'Ejecutar tests de integración'",
    "test:e2e": "echo 'Ejecutar tests end-to-end'",
    "lint": "echo 'Verificar calidad del código'",
    "format": "echo 'Formatear código'",
    "commit": "git commit -m",
    "branch": "git checkout -b",
    "status": "git status --short",
    "log": "git log --oneline --graph --decorate",
    "tag": "git tag -a"
  },
  "keywords": [
    "n8n",
    "automation",
    "chatbot",
    "telegram",
    "sales",
    "life-deportes"
  ],
  "author": "Diego <diego@life-deportes.com>",
  "license": "MIT"
}
EOF
    log_success "package.json creado"
else
    log_info "package.json ya existe, no se modifica"
fi

# 6. Crear archivo de configuración VS Code
log_info "Configurando VS Code..."

if [ ! -d ".vscode" ]; then
    mkdir -p .vscode
    
    # Settings de VS Code
    cat > .vscode/settings.json << 'EOF'
{
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
        "source.fixAll.eslint": true
    },
    "files.exclude": {
        "**/.git": true,
        "**/.DS_Store": true,
        "**/node_modules": true,
        "**/dist": true
    },
    "search.exclude": {
        "**/node_modules": true,
        "**/dist": true
    }
}
EOF

    # Extensiones recomendadas
    cat > .vscode/extensions.json << 'EOF'
{
    "recommendations": [
        "ms-vscode.vscode-json",
        "redhat.vscode-yaml",
        "ms-vscode.vscode-typescript-next",
        "esbenp.prettier-vscode",
        "ms-vscode.vscode-eslint",
        "gitpod.gitpod-desktop"
    ]
}
EOF
    
    log_success "Configuración de VS Code creada"
fi

# 7. Crear scripts de ayuda rápida
log_info "Creando scripts de ayuda rápida..."

cat > scripts/development/git-helpers.sh << 'EOF'
#!/bin/bash
# Helpers para Git - Life Deportes

function help() {
    echo "🚀 Git Helpers - Life Deportes"
    echo ""
    echo "Comandos disponibles:"
    echo "  new-feature <nombre>    - Crear nueva rama de feature"
    echo "  quick-commit <mensaje>  - Commit rápido con convenciones"
    echo "  sync-branches           - Sincronizar branches con remoto"
    echo "  show-log                - Mostrar log visual"
    echo "  create-tag <version>    - Crear tag de versión"
    echo "  cleanup-branches        - Limpiar ramas locales merged"
    echo ""
}

function new-feature() {
    if [ -z "$1" ]; then
        echo "❌ Error: Debes especificar el nombre del feature"
        echo "Uso: new-feature nombre-del-feature"
        return 1
    fi
    
    echo "🌱 Creando feature: feature/$1"
    git checkout -b feature/$1
    echo "✅ Rama creada: feature/$1"
}

function quick-commit() {
    if [ -z "$1" ]; then
        echo "❌ Error: Debes especificar el mensaje de commit"
        echo "Uso: quick-commit 'mensaje del commit'"
        return 1
    fi
    
    echo "📝 Agregando archivos y creando commit..."
    git add .
    git commit -m "$1"
    echo "✅ Commit creado exitosamente"
}

function sync-branches() {
    echo "🔄 Sincronizando branches..."
    git fetch --all --prune
    git checkout develop 2>/dev/null || echo "⚠️  Branch 'develop' no existe localmente"
    git checkout main 2>/dev/null || echo "⚠️  Branch 'main' no existe localmente"
    echo "✅ Sincronización completada"
}

function show-log() {
    echo "📊 Mostrando historial de commits..."
    git log --oneline --graph --decorate --all -15
}

function create-tag() {
    if [ -z "$1" ]; then
        echo "❌ Error: Debes especificar la versión"
        echo "Uso: create-tag v1.0.0"
        return 1
    fi
    
    echo "🏷️  Creando tag: $1"
    git tag -a $1 -m "Release $1"
    echo "✅ Tag creado: $1"
    echo "💡 Para subir al remoto: git push origin --tags"
}

function cleanup-branches() {
    echo "🧹 Limpiando ramas locales que ya están merged..."
    git branch --merged | grep -v '\*\|main\|develop' | xargs -n 1 git branch -d
    echo "✅ Limpieza completada"
}

# Ejecutar función si se llama directamente
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    help
fi
EOF

chmod +x scripts/development/git-helpers.sh
log_success "Scripts de ayuda creados"

# 8. Crear archivo de configuración de gitattributes
log_info "Configurando gitattributes..."

cat > .gitattributes << 'EOF'
# Automatizar line endings para diferentes sistemas operativos
* text=auto eol=lf

# Archivos específicos
*.sh text eol=lf
*.py text eol=lf
*.json text eol=lf
*.md text eol=lf

# Archivos binarios
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.mp4 binary
*.pdf binary
*.iso binary
EOF

log_success "gitattributes configurado"

# 9. Crear directorio de logs
log_info "Preparando directorios de trabajo..."
mkdir -p logs temp-backup

# 10. Mostrar resumen final
echo ""
echo -e "${GREEN}🎉 CONFIGURACIÓN COMPLETADA EXITOSAMENTE!${NC}"
echo ""
echo "📋 Resumen de lo configurado:"
echo "  ✅ Aliases de Git configurados"
echo "  ✅ Hooks de pre-commit instalados"
echo "  ✅ Archivos de configuración local creados"
echo "  ✅ Scripts de desarrollo disponibles"
echo "  ✅ Configuración de VS Code"
echo "  ✅ Git helpers automáticos"
echo ""
echo "🚀 Próximos pasos:"
echo "  1. Configurar variables de entorno:"
echo "     cp config/local/.env.example config/local/.env"
echo "     # Editar config/local/.env con tus valores"
echo ""
echo "  2. Sincronizar con repositorio remoto (si tienes uno):"
echo "     git remote add origin <URL_DEL_REPOSITORIO>"
echo "     git push -u origin main"
echo ""
echo "  3. Usar helpers de Git:"
echo "     source scripts/development/git-helpers.sh"
echo "     new-feature mi-nueva-funcionalidad"
echo ""
echo "  4. Para más ayuda:"
echo "     source scripts/development/git-helpers.sh && help"
echo ""
echo -e "${BLUE}¡Proyecto Life Deportes listo para desarrollo profesional!${NC}"
EOF