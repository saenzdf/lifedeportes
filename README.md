# Life Deportes — Ecosistema de Automatización, Odoo y Skills Antigravity

Este repositorio contiene la arquitectura completa de automatización comercial, procesamiento de listas de pedidos, integración con **Odoo ERP**, automatizaciones de **Kapso (WhatsApp)** y la colección de **Skills para Agentes Antigravity** de **Life Soluciones Deportivas S.A.S.**

---

## 🚀 Arquitectura y Capacidades

```
[ Cliente WhatsApp ] ───► [ Kapso / Wacli ]
                               │
                               ▼
                    [ Agente Antigravity ]
                               │
  ┌────────────────────────────┼────────────────────────────┐
  │                            │                            │
  ▼                            ▼                            ▼
[ Parseo de Listas ]    [ Matriz de Productos ]   [ Integración MCP Odoo ]
(Excel/Word/Imagen/PDF) (Fútbol, Voley, Basket)    (Partner, Lead, SO, Task)
  │                            │                            │
  └────────────────────────────┼────────────────────────────┘
                               ▼
                  [ Borrador Odoo (S0xxxx) ]
```

---

## 📚 Skills para Agentes Antigravity (`.agents/skills/`)

Este repositorio incluye los skills listos para ser consumidos por agentes AI (Antigravity) para operar en el ecosistema de Life Deportes:

| Skill | Descripción |
|-------|-------------|
| **[`life-guia-flujos-y-listas`](.agents/skills/life-guia-flujos-y-listas/SKILL.md)** | **Guía Maestra del Dominio**: explica qué es subir productos, las reglas de negocio, parseo de listas en todos sus formatos, manejo de adjuntos vía MCP Odoo e inspección con Kapso. |
| **[`life-odoo-ingreso-pedidos`](.agents/skills/life-odoo-ingreso-pedidos/SKILL.md)** | Ejecuta la creación del borrador de presupuesto (`sale.order`) en Odoo vía MCP: Partner, CRM Lead, Servicio Diseño $0 (ID 504) y líneas por variante real (`product.product`). |
| **[`life-odoo-lista-tarea`](.agents/skills/life-odoo-lista-tarea/SKILL.md)** | Parsea la lista de pedido (Excel `formato life`, Word, imagen, texto) y escribe el detalle HTML agrupado en `sale.order.note` y `project.task.description`. |
| **[`life-preparar-pedido`](.agents/skills/life-preparar-pedido/SKILL.md)** | Sincroniza conversaciones de WhatsApp vía `wacli`, descarga escudos/listas a una carpeta local y extrae especificaciones técnicas antes del ingreso. |
| **[`print-pdf-ocr-local`](.agents/skills/print-pdf-ocr-local/SKILL.md)** | Ejecuta lectura OCR en PDFs de impresión sin capa de texto (Tesseract / Gemini v3) y realiza auditoría cruzada (Print QC) contra la lista Excel de tallas. |
| **[`life-experto-ventas`](.agents/skills/life-experto-ventas/SKILL.md)** | Asistente de ventas para redactar respuestas comerciales oficiales y consultar listas de precios. |
| **[`life-auditoria-impresion`](.agents/skills/life-auditoria-impresion/SKILL.md)** | Automatización local para auditar visualmente los PDFs de impresión contra listas Excel. |

---

## 📁 Estructura del Repositorio

```
.
├── .agents/skills/             # Colección de Skills Antigravity
│   ├── life-guia-flujos-y-listas/ # Skill maestro de flujos y listas
│   ├── life-odoo-ingreso-pedidos/ # Skill de ingreso Odoo MCP
│   ├── life-odoo-lista-tarea/     # Skill de parseo HTML y sincronización
│   ├── life-preparar-pedido/      # Skill de extracción Wacli
│   ├── print-pdf-ocr-local/       # Skill OCR de PDFs de impresión
│   └── ...
├── kapso/                      # Integración con la plataforma Kapso (WhatsApp)
│   ├── functions/lib/          # Parsers unificados (Excel, Word, HTML)
│   ├── knowledge/              # Base de conocimiento (KB) de Kapso staff
│   └── scripts/                # Scripts Node.js para sync de listas
├── scripts/                    # Scripts Python/Node de utilidades y mantenimiento Odoo
├── docs/                       # Guías técnicas y playbooks operativos
├── CONTEXT.md                  # Glosario y términos canónicos de Life Deportes
└── README.md                   # Documentación principal del proyecto
```

---

## ⚖️ Reglas Comerciales y Operativas de Oro

1. **PROHIBIDO `action_confirm` por Agentes**: Los presupuestos (`sale.order`) se crean en estado **Borrador (`draft`)**. La confirmación final y la verificación del abono del 50% la realiza la operaria humana en Odoo.
2. **Línea Servicio Diseño $0 (ID 504)**: Todo presupuesto debe llevar la línea de servicio de diseño obligatoria.
3. **Mínimo Comercial**: 6 unidades del mismo producto/diseño.
4. **Subida Directa (Sin Fricción)**: Si no existen bloqueadores duros, el agente ingresa el borrador a Odoo sin requerir confirmación previa de la operaria.
5. **No Duplicar Datos Sensibles**: La nota del pedido (`sale.order.note`) y la tarea (`project.task.description`) no contienen precios ni datos del cliente.

---

## 🛠️ Configuración e Instalación

### Requisitos
- **Node.js**: v18+
- **Python**: 3.10+
- **Tesseract OCR**: `brew install tesseract tesseract-lang` (para auditoría de PDFs)

### Setup de Variables de Entorno
Copiar `.env.example` a `.env` y configurar las credenciales de Odoo y Kapso:

```bash
cp .env.example .env
```

### Ejecución de Script de Parseo Local
Para parsear un Excel y actualizar la nota de un pedido existente:

```bash
node kapso/scripts/sync_lista_pedido_to_odoo.js \
  --order=2564 \
  --file="/ruta/FORMATO PEDIDO LIFE.xlsx" \
  --prod
```
