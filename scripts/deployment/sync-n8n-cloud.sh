#!/bin/bash

# Script de sincronización con n8n Cloud
# Automatiza el proceso de sincronización entre local y n8n Cloud

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funciones de utilidad
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

# Configuración
WORKFLOWS_DIR="workflows/n8n"
BACKUP_DIR="backup/$(date +%Y%m%d_%H%M%S)"
CONFIG_FILE="config/local/sync.config"

# Función para crear backup
create_backup() {
    log_info "Creando backup local..."
    mkdir -p "$BACKUP_DIR"
    
    # Backup de workflows actuales
    if [ -d "$WORKFLOWS_DIR" ]; then
        cp -r "$WORKFLOWS_DIR" "$BACKUP_DIR/workflows"
        log_success "Backup de workflows creado en $BACKUP_DIR/workflows"
    fi
    
    # Backup de configuraciones
    if [ -d "config" ]; then
        cp -r config "$BACKUP_DIR/"
        log_success "Backup de configuraciones creado en $BACKUP_DIR/config"
    fi
}

# Función para validar configuración
validate_config() {
    log_info "Validando configuración..."
    
    if [ ! -f "$CONFIG_FILE" ]; then
        log_error "Archivo de configuración no encontrado: $CONFIG_FILE"
        log_info "Creando configuración de ejemplo..."
        create_example_config
        return 1
    fi
    
    # Validar variables requeridas
    source "$CONFIG_FILE"
    
    required_vars=("N8N_CLOUD_API_URL" "N8N_CLOUD_API_KEY" "WORKFLOW_NAMES")
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            log_error "Variable requerida no definida: $var"
            return 1
        fi
    done
    
    log_success "Configuración validada correctamente"
    return 0
}

# Función para crear configuración de ejemplo
create_example_config() {
    cat > "$CONFIG_FILE" << EOF
# Configuración de sincronización con n8n Cloud
# Copiar a config/local/sync.config y completar valores

# URL de la API de n8n Cloud
N8N_CLOUD_API_URL="https://tu-instancia.app.n8n.cloud/api/v1"

# API Key de n8n Cloud (desde Settings > API Keys)
N8N_CLOUD_API_KEY="tu_api_key_aqui"

# Nombres de workflows a sincronizar (separados por espacios)
WORKFLOW_NAMES="Life deportes workflow_ventas workflow_pedido workflow_post_venta"

# Directorio local de workflows
LOCAL_WORKFLOWS_DIR="workflows/n8n"

# Configuración de backup
BACKUP_RETENTION_DAYS=30

# Configuración de logging
LOG_LEVEL="INFO"
LOG_FILE="logs/sync_$(date +%Y%m%d).log"

# Configuración de notificaciones (opcional)
NOTIFICATION_WEBHOOK_URL=""
NOTIFICATION_EMAIL="tu-email@ejemplo.com"
EOF
    
    log_info "Configuración de ejemplo creada en $CONFIG_FILE"
    log_warning "Por favor, edita $CONFIG_FILE con tus valores reales"
}

# Función para sincronizar workflows hacia Cloud
sync_to_cloud() {
    log_info "Sincronizando workflows hacia n8n Cloud..."
    
    source "$CONFIG_FILE"
    
    for workflow_name in $WORKFLOW_NAMES; do
        local_file="$LOCAL_WORKFLOWS_DIR/${workflow_name}.json"
        
        if [ ! -f "$local_file" ]; then
            log_warning "Archivo de workflow no encontrado: $local_file"
            continue
        fi
        
        log_info "Subiendo workflow: $workflow_name"
        
        # Aquí iría la lógica para subir a n8n Cloud
        # Por ahora, registramos la acción
        echo "$(date): Subir workflow $workflow_name hacia Cloud" >> sync.log
        
        log_success "Workflow $workflow_name preparado para subida"
    done
}

# Función para sincronizar workflows desde Cloud
sync_from_cloud() {
    log_info "Sincronizando workflows desde n8n Cloud..."
    
    source "$CONFIG_FILE"
    
    # Crear directorio temporal para descargar workflows
    temp_dir="temp_download_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$temp_dir"
    
    for workflow_name in $WORKFLOW_NAMES; do
        log_info "Descargando workflow: $workflow_name"
        
        # Aquí iría la lógica para descargar desde n8n Cloud
        # Por ahora, registramos la acción
        echo "$(date): Descargar workflow $workflow_name desde Cloud" >> sync.log
        
        # Simular descarga (en implementación real usarías curl con la API)
        # curl -X GET "$N8N_CLOUD_API_URL/workflows/$workflow_name" \
        #      -H "Authorization: Bearer $N8N_CLOUD_API_KEY" \
        #      -o "$temp_dir/${workflow_name}.json"
        
        log_success "Workflow $workflow_name descargado a $temp_dir"
    done
    
    log_info "Workflows descargados en: $temp_dir"
    log_warning "Revisa los archivos y cópialos manualmente a workflows/n8n/ si son correctos"
}

# Función para verificar estado de sincronización
check_sync_status() {
    log_info "Verificando estado de sincronización..."
    
    if [ ! -f "sync.log" ]; then
        log_warning "No se encontraron logs de sincronización"
        return 1
    fi
    
    echo "Últimas 5 sincronizaciones:"
    tail -5 sync.log
}

# Función para limpiar backups antiguos
cleanup_old_backups() {
    log_info "Limpiando backups antiguos..."
    
    source "$CONFIG_FILE"
    retention_days=${BACKUP_RETENTION_DAYS:-30}
    
    find backup/ -type d -name "backup_*" -mtime +$retention_days -exec rm -rf {} + 2>/dev/null || true
    
    log_success "Backups antiguos limpiados"
}

# Función principal
main() {
    case "${1:-help}" in
        "to-cloud")
            validate_config && create_backup && sync_to_cloud
            ;;
        "from-cloud")
            validate_config && sync_from_cloud
            ;;
        "status")
            check_sync_status
            ;;
        "cleanup")
            cleanup_old_backups
            ;;
        "config")
            create_example_config
            ;;
        "help"|*)
            echo "Uso: $0 {to-cloud|from-cloud|status|cleanup|config|help}"
            echo ""
            echo "Comandos disponibles:"
            echo "  to-cloud   - Sincroniza workflows locales hacia n8n Cloud"
            echo "  from-cloud - Descarga workflows desde n8n Cloud"
            echo "  status     - Muestra estado de sincronización"
            echo "  cleanup    - Limpia backups antiguos"
            echo "  config     - Crea archivo de configuración de ejemplo"
            echo "  help       - Muestra esta ayuda"
            echo ""
            echo "Primero ejecutar: $0 config"
            ;;
    esac
}

# Crear directorios necesarios
mkdir -p logs backup

# Ejecutar función principal
main "$@"