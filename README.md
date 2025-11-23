# Life Deportes - Sistema de Automatización de Ventas

## 📋 Descripción del Proyecto

Life Deportes es un sistema automatizado de gestión de ventas para ropa deportiva desarrollado con n8n y diseñado para optimizar el proceso de cotización, pedidos y post-venta. El sistema incluye un chatbot inteligente integrado con Telegram para atención al cliente 24/7.

## 🎯 Características Principales

- **Automatización de Ventas**: Flujos completos desde cotización hasta entrega
- **Chatbot Inteligente**: Integración con Telegram para atención automatizada
- **Gestión de Inventario**: Productos y variantes con precios dinámicos
- **Cotizaciones Automáticas**: Generación instantánea de presupuestos
- **Post-Venta**: Seguimiento automatizado de pedidos y producción
- **Sincronización Cloud**: Respaldo y sincronización automática con n8n Cloud

## 📁 Estructura del Proyecto

```
/Users/diego/Sync/
├── .gitignore                    # Archivos excluidos de Git
├── README.md                     # Este archivo
├── workflows/
│   └── n8n/                     # Workflows de n8n
│       ├── Life deportes.json   # Workflow principal
│       ├── workflow_ventas.json # Flujo de ventas optimizado
│       ├── workflow_pedido.json # Gestión de pedidos
│       └── workflow_post_venta.json # Post-venta
├── docs/
│   ├── technical/               # Documentación técnica
│   ├── user-guide/              # Manual de usuario
│   └── api/                     # Documentación de API
├── scripts/
│   ├── development/             # Scripts de desarrollo
│   ├── deployment/              # Scripts de despliegue
│   └── maintenance/             # Scripts de mantenimiento
├── config/
│   ├── local/                   # Configuración local
│   └── environments/            # Configuración de entornos
├── tests/
│   ├── unit/                    # Pruebas unitarias
│   ├── integration/             # Pruebas de integración
│   └── e2e/                     # Pruebas end-to-end
└── backup/
    ├── scheduled/               # Respaldos programados
    └── manual/                  # Respaldos manuales
```

## 🚀 Inicio Rápido

### Prerrequisitos

- n8n (local o cloud)
- Node.js (para scripts de desarrollo)
- Git
- Cuenta de Telegram para el chatbot

### Instalación

1. **Clonar el repositorio**
   ```bash
   git clone [URL_DEL_REPOSITORIO]
   cd life-deportes
   ```

2. **Configurar variables de entorno**
   ```bash
   cp config/environments/.env.example config/local/.env
   # Editar las variables según tu configuración
   ```

3. **Importar workflows a n8n**
   - Importar cada archivo `.json` desde la carpeta `workflows/n8n/`
   - Configurar las credenciales necesarias

4. **Configurar el chatbot de Telegram**
   - Crear bot con @BotFather
   - Configurar webhook o polling
   - Actualizar las credenciales en n8n

## 🔧 Configuración

### Variables de Entorno

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=tu_token_aqui
TELEGRAM_WEBHOOK_URL=tu_webhook_url

# Odoo Integration
ODOO_URL=https://tu-instancia.odoo.com
ODOO_USERNAME=tu_usuario
ODOO_PASSWORD=tu_password

# Qdrant Vector Database
QDRANT_URL=https://tu-cluster.qdrant.io
QDRANT_API_KEY=tu_api_key

# Database Connections
POSTGRES_HOST=localhost
POSTGRES_DATABASE=life_deportes
POSTGRES_USERNAME=tu_usuario
POSTGRES_PASSWORD=tu_password
```

### Configuración de n8n

1. **Credenciales requeridas**:
   - Telegram API
   - Odoo API
   - Qdrant API
   - PostgreSQL
   - Google Gemini API (para procesamiento de IA)

2. **Webhooks**:
   - Configurar webhooks para integración con Telegram
   - Establecer URLs de callback para post-venta

## 🏗️ Arquitectura del Sistema

### Flujos Principales

1. **Flujo de Ventas** (`workflow_ventas.json`)
   - Clasificación de mensajes
   - Cotización inmediata con precios de referencia
   - Identificación de productos y variantes
   - Generación de presupuestos

2. **Gestión de Pedidos** (`workflow_pedido.json`)
   - Confirmación de pedidos
   - Generación de órdenes de venta
   - Gestión de inventario
   - Seguimiento de producción

3. **Post-Venta** (`workflow_post_venta.json`)
   - Recepción de comprobantes de pago
   - Procesamiento de listas de tallas
   - Actualización de estados de producción
   - Comunicación con clientes

### Tecnologías Utilizadas

- **n8n**: Automatización de workflows
- **Telegram**: Canal de comunicación con clientes
- **Odoo**: ERP para gestión de productos y pedidos
- **Qdrant**: Base de datos vectorial para búsqueda semántica
- **PostgreSQL**: Almacenamiento de conversaciones y estados
- **Google Gemini**: Procesamiento de lenguaje natural

## 📚 Documentación

### Guías Técnicas

- [Configuración de Desarrollo](docs/technical/setup-development.md)
- [API Reference](docs/api/README.md)
- [Troubleshooting](docs/technical/troubleshooting.md)

### Guías de Usuario

- [Manual de Cotización](docs/user-guide/cotizacion.md)
- [Gestión de Pedidos](docs/user-guide/pedidos.md)
- [Post-Venta](docs/user-guide/post-venta.md)

## 🧪 Testing

```bash
# Ejecutar pruebas unitarias
npm run test:unit

# Ejecutar pruebas de integración
npm run test:integration

# Ejecutar pruebas end-to-end
npm run test:e2e
```

## 🚀 Deployment

### Desarrollo Local

```bash
# Ejecutar scripts de desarrollo
npm run dev

# Sincronizar con n8n local
npm run sync:local
```

### Production

```bash
# Desplegar a n8n Cloud
npm run deploy:cloud

# Sincronizar cambios
npm run sync:production
```

## 🔄 Workflow de Desarrollo

1. **Crear rama de feature**
   ```bash
   git checkout -b feature/nueva-funcionalidad
   ```

2. **Desarrollar y probar**
   ```bash
   # Hacer cambios y probar localmente
   npm run test
   ```

3. **Commit y push**
   ```bash
   git add .
   git commit -m "feat: agregar nueva funcionalidad"
   git push origin feature/nueva-funcionalidad
   ```

4. **Crear Pull Request**
   - Revisar cambios
   - Merge a main
   - Deploy automático

## 📊 Monitoreo y Métricas

- **Logs de Workflow**: Monitoreo en tiempo real de workflows
- **Métricas de Conversión**: Tasa de conversión de cotizaciones a ventas
- **Tiempo de Respuesta**: Latencia del chatbot
- **Errores**: Tracking de fallos y excepciones

## 🤝 Contribuir

1. Fork el proyecto
2. Crear rama de feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

## 📝 Changelog

### v1.0.0 (2025-11-22)
- ✅ Sistema inicial de cotización
- ✅ Integración con Telegram
- ✅ Automatización de post-venta
- ✅ Precios inmediatos implementados

### v1.1.0 (Próximo)
- 🔄 Sincronización cloud mejorada
- 🔄 Nuevas integraciones
- 🔄 Dashboard de métricas

## 🆘 Soporte

Para soporte técnico:

- **Email**: soporte@terrabloque.com
- **Documentación**: [Wiki del proyecto](docs/)
- **Issues**: [GitHub Issues](https://github.com/saenzdf/lifedeportes/issues) 

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Ver `LICENSE` para más detalles.

## 🏆 Créditos

- **Desarrollado por**: Diego Sáenz
- **Empresa**: Bloquenodo
- **Versión**: 1.0.0
- **Fecha**: Noviembre 2025

---

## 📞 Contacto

Para consultas comerciales o técnicas:
- **WhatsApp**: +57 300 123 4567
- **Email**: info@life-deportes.com
- **Website**: https://life-deportes.com