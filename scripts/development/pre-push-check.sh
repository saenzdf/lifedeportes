#!/bin/bash

# Script de verificación pre-push a GitHub
# Te ayuda a verificar que todo está listo antes de hacer push

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
    echo -e "${GREEN}[✅ OK]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠️  WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[❌ ERROR]${NC} $1"
}

echo -e "${BLUE}"
echo "🔍 VERIFICACIÓN PRE-PUSH A GITHUB"
echo "==============================="
echo -e "${NC}"

# Contador de verificaciones
PASSED=0
TOTAL=8

# 1. Verificar que estamos en un repositorio Git
log_info "Verificando repositorio Git..."
if git rev-parse --git-dir > /dev/null 2>&1; then
    log_success "Repositorio Git válido detectado"
    ((PASSED++))
else
    log_error "No estamos en un repositorio Git"
    exit 1
fi

# 2. Verificar configuración de usuario
log_info "Verificando configuración de usuario..."
USER_NAME=$(git config user.name)
USER_EMAIL=$(git config user.email)

if [ -n "$USER_NAME" ] && [ -n "$USER_EMAIL" ]; then
    log_success "Usuario configurado: $USER_NAME <$USER_EMAIL>"
    ((PASSED++))
else
    log_error "Falta configurar user.name o user.email"
    echo "Ejecuta: git config --global user.name 'Tu Nombre'"
    echo "         git config --global user.email 'tu@email.com'"
fi

# 3. Verificar que no hay cambios pendientes
log_info "Verificando cambios pendientes..."
if [ -z "$(git status --porcelain)" ]; then
    log_success "No hay cambios pendientes (repositorio limpio)"
    ((PASSED++))
else
    log_warning "Hay cambios pendientes en el repositorio"
    echo "Archivos modificados:"
    git status --short
fi

# 4. Verificar historial de commits
log_info "Verificando historial de commits..."
COMMIT_COUNT=$(git rev-list --all --count)
if [ $COMMIT_COUNT -gt 0 ]; then
    log_success "Tienes $COMMIT_COUNT commit(s) en el historial"
    echo "Últimos commits:"
    git log --oneline -3
    ((PASSED++))
else
    log_warning "No hay commits en el historial"
fi

# 5. Verificar ramas
log_info "Verificando ramas..."
CURRENT_BRANCH=$(git branch --show-current)
log_success "Rama actual: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" = "main" ]; then
    ((PASSED++))
else
    log_warning "Estás en la rama '$CURRENT_BRANCH', no en 'main'"
    echo "Considera cambiar a main: git checkout main"
fi

# 6. Verificar remotos
log_info "Verificando repositorios remotos..."
REMOTE_COUNT=$(git remote | wc -l)
if [ $REMOTE_COUNT -gt 0 ]; then
    log_success "Remotos configurados:"
    git remote -v
    ((PASSED++))
else
    log_warning "No hay repositorios remotos configurados"
    echo ""
    echo "Para agregar GitHub:"
    echo "git remote add origin https://github.com/TU-USUARIO/life-deportes.git"
    echo ""
    echo "Consulta la guía: docs/technical/github-setup-guide.md"
fi

# 7. Verificar tamaño del repositorio
log_info "Verificando tamaño del repositorio..."
REPO_SIZE=$(du -sh . | cut -f1)
log_success "Tamaño del repositorio: $REPO_SIZE"

if [ "$(echo "$REPO_SIZE" | sed 's/[A-Za-z]*//g' | sed 's/\.//g')" -gt 100 ]; then
    log_warning "El repositorio es grande, considera excluir archivos"
fi
((PASSED++))

# 8. Verificar .gitignore
log_info "Verificando .gitignore..."
if [ -f ".gitignore" ]; then
    log_success "Archivo .gitignore presente"
    EXCLUDED_COUNT=$(grep -v "^#" .gitignore | grep -v "^$" | wc -l)
    echo "Reglas de exclusión: $EXCLUDED_COUNT"
    ((PASSED++))
else
    log_warning "No hay archivo .gitignore"
    echo "Considera crear uno para excluir archivos innecesarios"
fi

# Resumen final
echo ""
echo -e "${BLUE}📊 RESUMEN DE VERIFICACIÓN${NC}"
echo "============================"
echo -e "✅ Verificaciones pasadas: $PASSED/$TOTAL"
echo -e "📋 Estado del repositorio: ${PASSED}/$TOTAL criterios cumplidos"

if [ $PASSED -eq $TOTAL ]; then
    echo -e "${GREEN}🎉 ¡ESTÁS LISTO PARA HACER PUSH A GITHUB!${NC}"
    echo ""
    echo "Próximos pasos:"
    echo "1. Ve a github.com y crea un repositorio nuevo"
    echo "2. Copia la URL del repositorio"
    echo "3. Ejecuta:"
    echo "   git remote add origin https://github.com/TU-USUARIO/life-deportes.git"
    echo "   git push -u origin main"
    echo ""
    echo "📖 Guía completa: docs/technical/github-setup-guide.md"
elif [ $PASSED -gt $TOTAL/2 ]; then
    echo -e "${YELLOW}⚠️  CASI LISTO - Revisa las advertencias arriba${NC}"
    echo ""
    echo "La mayoría de verificaciones pasaron, pero hay algunos puntos a revisar."
else
    echo -e "${RED}❌ NECESITA CONFIGURACIÓN ADICIONAL${NC}"
    echo ""
    echo "Faltan verificaciones importantes. Revisa los errores arriba."
    echo "Consulta la guía: docs/technical/github-setup-guide.md"
fi

echo ""
echo -e "${BLUE}💡 COMANDOS ÚTILES PARA EL PROCESO:${NC}"
echo "git status              - Ver estado actual"
echo "git remote -v           - Ver remotos configurados"
echo "git log --oneline       - Ver historial de commits"
echo "git branch              - Ver ramas"
echo ""
echo -e "${GREEN}¡Buena suerte con tu push a GitHub! 🚀${NC}"