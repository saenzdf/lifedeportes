# Playbook de Ventas: Life Soluciones Deportivas (WhatsApp a Odoo)

Este documento detalla el flujo de ventas, ejemplos reales, y la estrategia técnica para la integración y automatización de pedidos desde WhatsApp hacia Odoo.

## 1. Momentos Típicos del Ciclo de Venta

### A. El Saludo y Abordaje

Los clientes suelen ser directos pero formales en su trato. Muchos ya tienen un historial de compra.

- **Ejemplos Reales:**
  - *"Buenos Días Don Javier"*
  - *"Don Javier buena tarde, este es el adicional..."*
  - *"Cómo va?"* o *"Valenn?"* (para seguimientos informales)

### B. Cómo Piden los Productos

Las solicitudes a menudo vienen referenciadas por el nombre del cliente final, un número de pedido interno o el nombre del equipo/colegio.

- **Ejemplos Reales:**
  - *"pedido jb"*
  - *"Nuevo pedido"*
  - *"Me ayuda con el pedido de tandem"*
  - *"el pedido 1593] ANNY ALVAREZ. Las pantalonetas son en licra"*

### C. Definición de Producto y Detalles

La definición del diseño es altamente visual y específica.

- **Dinámica:** 
  - Envían imágenes para confirmar diseños: *"Este pedido llamado Diana Triana?"* o *"AQUI le coloco como me gustaria la pantaloneta"*.
  - Mandan Excels o formatos para las tallas: *"FORMATO PEDIDO #2.xlsx"*, *"TALLAS UNIFORMES DE COMPETENCIA LIFE.xlsx"*.
  - Aclaran faltantes: *"A la deportista Julieth Vanessa castillo Caro se le entrego solo una camiseta y eran dos"*.

### D. Negociación y Condiciones

Las dudas se centran en tiempos, características precisas y pagos.

- **Ejemplos Reales:**
  - *"Más o menos cuánto se demora el pedido"*
  - *"¿Ósea No Es Negra?"*
  - *"Don Javier El Pedido México Pagan Allá Verdad ?"*
  - *"Saldo $600.000"*

### E. Cierre y Confirmación

El cierre implica la confirmación de envío a satélite o empaque.

- **Ejemplos Reales:**
  - *"Si Don Javier Ya Está Para Empaque"*
  - *"Se Envió Hoy A Satélite"*
  - *"Salió El Dia Lunes A Satélite. Son 23 Uniformes 3 Cam"*

---

## 2. Transformación del Pedido (WhatsApp -> Odoo)

El flujo de información debe estructurarse desde el desorden natural del chat hasta la formalidad del ERP.

1. **El Pedido de la Gente (WhatsApp Frontend):**
  - El cliente envía un texto suelto: *"Anotar un pedido Danna para 7 de abril"* + una nota de voz con los detalles + una foto del diseño.
2. **El Pedido Intermedio (wacli / MCP):**
  - La IA extrae el contexto: 
    - **Cliente:** Danna
    - **Fecha de entrega:** 7 de abril
    - **Adjuntos:** 1 Imagen (Diseño), 1 Audio (transcrito a texto).
  - Se genera un JSON intermedio con las cantidades, tallas (si se pasaron en Excel) y referencias.
3. **El Pedido Real en Odoo (ERP Backend):**
  - **Compañía:** Odoo opera bajo la entidad `Life Soluciones Deportivas S.A.S` (ID: 1).
  - **Partner:** Se busca o crea el cliente en `res.partner` (Ej: `DANNA`, `YEYO` ID: 2691, `JULIO CESAR` ID: 2690).
  - **Orden de Venta:** Se crea el registro en `sale.order` generando una secuencia formal (Ej: `S01843`, `S01844`).

---

## 3. Manejo Estratégico de Adjuntos

Debido a que el negocio es visual (fabricación de uniformes deportivos), los adjuntos son el núcleo de la venta.

### Referencias de Diseños en Foto (JPG/PNG)

- **Problema:** El cliente envía "quiero este diseño" con una foto.
- **Solución:** 
  1. El bot de WhatsApp descarga la imagen.
  2. Se utiliza una API de visión (como Gemini Pro Vision) para extraer colores principales, tipo de prenda (cuello V, pantaloneta) y escudos.
  3. La imagen original se sube **directamente al Chatter del registro `sale.order` en Odoo** como un *attachment*, garantizando que producción vea exactamente lo que el cliente pidió.

### Formatos y Tallas en Documentos (Excel/PDF)

- **Problema:** Listados masivos de tallas y números ("TALLAS UNIFORMES DE COMPETENCIA LIFE.xlsx").
- **Solución:**
  1. Interceptar el archivo `.xlsx` o `.pdf`.
  2. Ejecutar un script en Python (Pandas para Excel, PyPDF para PDF) que extraiga las filas (Talla, Jugador, Número).
  3. Esto automatiza la creación de las **Líneas de la Orden (Order Lines)** en Odoo, evitando la digitación manual de 20-50 items por pedido.

---

## 4. Estadísticas y Patrones de Interacción

Con base en el análisis de los chats recientes, los métodos de comunicación se distribuyen de la siguiente manera:

- **🎙️ Mensajes de Voz (Aprox. 35%):**
  - *Uso:* Muy frecuentes para explicar cambios complejos, confirmar quejas o detallar diseños que por texto tomarían mucho tiempo.
  - *Acción técnica:* Requiere un pipeline de Speech-to-Text integrado (ej. Whisper) antes de procesar la intención.
- **📝 Mensajes Escritos (Aprox. 45%):**
  - *Uso:* Saludos, confirmaciones cortas ("Listo", "Ya está"), preguntas rápidas sobre saldos y despachos.
- **📊 Archivos Excel / XLSX (Aprox. 10%):**
  - *Uso:* Usados casi exclusivamente para pedidos consolidados, planillas de equipos enteros y competiciones.
- **🖼️ Imágenes / PDFs en Texto (Aprox. 10%):**
  - *Uso:* Las fotos son vitales para mostrar el boceto o la prenda. Los PDFs son menos comunes que los Excel, usualmente usados para recibos de pago o cotizaciones formales.

## 5. Preguntas y Respuestas Comunes (FAQ Bot)

Para entrenar un asistente automático:

- **Q:** *"¿Más o menos cuánto se demora el pedido?"*
  - **A:** *"Don Javier / Cliente, el tiempo estimado de confección es de X días hábiles una vez aprobado el diseño y recibido el anticipo."* (El bot debe consultar el estado en Odoo).
- **Q:** *"¿Me confirmas de este pedido cuántos unidades son?"*
  - **A:** El bot busca la foto enviada, consulta el `sale.order` correspondiente en Odoo y responde: *"Son 19 Uniformes, según la orden S018XX"*.
- **Q:** *"Te cargué en odoo otro diseño, ¿puedes revisar?"*
  - **A:** *"Listo, ya quedó adjunto en el pedido. ¿Deseas que lo pase a Satélite?"*

