# Life Deportes - Antigravity Skills

Este paquete contiene las Skills personalizadas para Life Deportes, diseñadas para ser utilizadas con Antigravity. 
Estas skills automatizan el flujo de ventas, desde la atención inicial por WhatsApp hasta la creación formal del pedido en Odoo.

## Contenido del Paquete
1. **life-experto-ventas:** Asistente comercial que redacta respuestas profesionales, recuerda la política del 50% de abono y consulta precios en tiempo real.
2. **life-preparar-pedido:** Recopilador de datos que lee el `wacli` local, descarga imágenes (escudos, diseños) y Excels a una carpeta local, y extrae los detalles técnicos de fabricación (tipo de prenda, cuello, mangas, tela, cantidad).
3. **life-odoo-ingreso-pedidos** (recomendado solo Odoo): Ingreso Partner + Lead + SO borrador + Diseño $0 vía MCP Odoo. Ver `README_ANTIGRAVITY_ODOO.md`.
4. **life-ingreso-pedidos** (legacy): alias; usar `life-odoo-ingreso-pedidos`.

## Instalación (Deployment) en Antigravity local

Para instalar estas skills en la computadora del vendedor, sigue estos pasos:

1. Extrae el contenido de este archivo `.zip`.
2. Ubica la carpeta de trabajo (workspace) donde Antigravity está configurado.
3. Dentro de esa carpeta, navega hasta (o crea si no existe) la ruta oculta: `.agents/skills/`
4. Copia las tres carpetas (`life-experto-ventas`, `life-preparar-pedido`, `life-ingreso-pedidos`) directamente dentro de la carpeta `skills`.
5. **Requisitos Adicionales:** Asegúrate de que el entorno local de Antigravity tenga activos los siguientes MCPs:
   - **MCP Odoo Lifedeportes:** Requerido para buscar productos y crear registros en el ERP (suficiente para `life-odoo-ingreso-pedidos`).
   - **MCP Wacli (o CLI de Kapso):** Opcional; solo para `life-preparar-pedido`.

## Uso (Instrucciones para el Vendedor)

Una vez instaladas, el vendedor solo debe interactuar con Antigravity usando un lenguaje natural, delegando el trabajo paso a paso:

### Fase 1: Asistencia en Preventa
El vendedor tiene una duda o quiere una respuesta rápida para el cliente.
> *"Antigravity, ayúdame a responderle a este cliente que quiere 20 uniformes estilo PRESEAS."*
> *(Antigravity buscará el precio exacto en Odoo y redactará el mensaje con las reglas de Life).*

### Fase 2: Recopilación y Análisis del Pedido
El cliente ya confirmó y envió logos, detalles técnicos o un Excel.
> *"Antigravity, revisa la conversación de wacli con [Nombre del Cliente]. Descarga las fotos de referencia y dime qué especificaciones técnicas tiene el pedido."*
> *(Antigravity creará una carpeta, descargará los escudos/Excels allí, y resumirá si es cuello V, manga larga, tela dryfit, etc).*

### Fase 3: Ingreso Automatizado en Odoo
La información del Paso 2 está lista y revisada.
> *"Todo está correcto. Ingresa el pedido de [Nombre]."*
> *(Antigravity se conectará a Odoo, creará el cliente, la oportunidad y la Orden de Venta en segundos).*
