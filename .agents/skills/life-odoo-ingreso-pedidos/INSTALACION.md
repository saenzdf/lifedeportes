# Instalación — life-odoo-ingreso-pedidos (Antigravity)

Paquete jul 2026 — incluye reglas **camiseta sola**, uniforme completo, interpretación audio/foto, catálogo ampliado.

## Requisitos

1. Antigravity en el PC operario.
2. MCP Odoo Life Deportes configurado.
3. No Kapso, no wacli, no repo completo.

## Instalar

1. Copia la carpeta `life-odoo-ingreso-pedidos` (5 archivos):

   ```
   SKILL.md
   interpretacion.md
   catalogo.md
   ejemplos.md
   INSTALACION.md
   ```

2. Destino:

   ```
   .agents/skills/life-odoo-ingreso-pedidos/
   ```

3. Reinicia Antigravity o recarga skills.

4. Primera sesión: *"Paso 0 del skill life-odoo-ingreso-pedidos — verifica Diseño 504, uniforme 115 y camiseta 62"*.

## Uso

- *"Ingresa pedido de [cliente] en Odoo"*
- *"12 camisetas de fútbol, tel 573…"* → debe usar template **62**, no uniforme
- *"20 uniformes + 2 arqueros"* → dos líneas producto

## Zip portable

En el repo Life también existe:

`life-odoo-ingreso-pedidos-antigravity.zip` (raíz Documents/cursor o entregado por TI)

Descomprimir en `.agents/skills/`.

## Actualización jul 2026

Cambios vs versión anterior:

- **Camiseta / camiseta de fútbol** = camiseta sola (62), no ambigüedad con uniforme
- Archivo **interpretacion.md** (audio, foto, voley, arquero)
- Catálogo: buzos 1811, reglas compuestos
- Alineado con KB Kapso `life_lenguaje_cliente_productos`

## No hace

- Confirmar SO · cobros · WhatsApp cliente · Excel tallas en proyecto
