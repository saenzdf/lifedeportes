---
name: life-preparar-pedido
description: "Sincroniza y extrae información del cliente desde wacli (Kapso). Descarga imágenes y Excels a una carpeta local del cliente, y extrae detalles técnicos (tipo, cuello, mangas, tela, cantidad) para preparar el ingreso a Odoo."
---

# Life Preparar Pedido (Wacli Sync)

## Cuándo usar
Usa esta skill como el **paso previo** a `life-ingreso-pedidos`. Su objetivo es recopilar toda la información desestructurada de WhatsApp (imágenes, Excels, texto) y organizarla localmente para extraer las especificaciones técnicas del pedido.

- El vendedor te pide buscar la conversación de un cliente en específico.
- Necesitas recopilar escudos, referencias de diseño y archivos Excel antes de ingresar el pedido a Odoo.

Para la guía completa de interpretación de productos, parseo de listas y uso de MCPs, ver [`life-guia-flujos-y-listas`](../life-guia-flujos-y-listas/SKILL.md).

## Flujo de Trabajo

### 1. Búsqueda y Sincronización en Wacli
1. Utiliza el MCP o CLI local de `wacli` para buscar la conversación por el **Nombre del contacto**.
2. Lee y sincroniza los últimos mensajes de la conversación, limitando el contexto estrictamente a los mensajes relevantes para el **pedido actual** (ignorando pedidos antiguos o charlas no relacionadas).

### 2. Creación de Carpeta Local y Descarga de Archivos
1. Crea una estructura de directorios en el entorno local con el formato: `Pedidos/[Nombre del Cliente]/[YYYY-MM-DD]/`.
2. Busca en los mensajes sincronizados todas las imágenes (escudos, fotos de referencias de diseño) y archivos Excel.
3. Descarga y guarda todos estos archivos en la carpeta creada.

### 3. Extracción de Especificaciones del Pedido
Analiza el texto de la conversación, las fotos de referencia y/o el contenido del Excel descargado para determinar las siguientes especificaciones técnicas de la prenda:

- **Tipo de Prenda:** ¿Es "camiseta" sola o "conjunto" (camiseta y pantaloneta)?
- **Tipo de Cuello:** ¿Es "cuello V", "cuello redondo" o "cuello polo"?
- **Largo de Manga:** ¿Es "manga larga" o "manga corta"?
- **Tipo de Manga:** ¿Es "manga normal" o "manga ranglan"?
- **Tela:** Por defecto asume "dryfit", pero busca indicios en la conversación de otras telas (ej. licra, galleta) o confirmaciones explícitas del cliente.
- **Cantidad:** Número total de productos a fabricar.

*Nota:* Puedes usar tus capacidades de visión (si aplica) para analizar las fotos de referencia y extraer el tipo de cuello o manga si no está explícito en el texto.

### 4. Hand-off (Preparación para Ingreso)
Una vez que hayas recopilado las especificaciones, guardado las imágenes y extraído el resumen de cantidades, estructura esta información de manera clara. 
Este resumen detallado será el insumo directo que utilizará la skill `life-ingreso-pedidos` para crear el pedido formal en Odoo, asegurando que producción tenga todos los detalles y archivos de diseño a la mano.
