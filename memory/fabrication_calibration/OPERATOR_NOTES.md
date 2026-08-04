# Notas operador — QC lista vs PDF

## Cuándo **no** confiar en el PDF de la tarea

- **Pantalones / pantalonetas** u otro producto en el nombre del archivo (ej. `…PANT…pdf`) si el pedido de **camisetas** fue enviado **por correo**: el adjunto en Odoo puede no ser la rejilla de espaldas a comparar.
- **Idea de producto (futuro):** revisar mensajes del **chatter** del portal: si el cliente indica aprobación y menciona envío por **correo electrónico** para el arte de camisetas, omitir lectura automática del PDF de la tarea hasta tener el archivo correcto.

## Pedidos empresa / corporativos

- El Excel “formato pedido” puede no alinearse fila a fila con el arte (ej. prefijos de empresa, listas distintas). Preferir **Server Action con botón** (“solo cuando se requiere”) en lugar de webhook automático en cada aprobación. Ver `kapso/docs/PRINT_QC_ODOO19_STUDIO_SETUP.md` — Opción C.

## Pista de talla en el arte (para visión)

- La talla suele aparecer **fuera** del rectángulo principal de sublimación (zona teñida), a menudo **cerca del cuello** o en el borde de una de las caras del patrón de camiseta; el orden en planilla suele ser de **talla mayor a menor**.
