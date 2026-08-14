# Guía de Uso de `wacli` para Canales de Ventas

Se han configurado dos canales **independientes y aislados** para WhatsApp CLI (`wacli`).

---

## Estructura de Directorios

- **Binario**: `.\bin\wacli.exe`
- **Almacenamiento Canal Javier**: `.\stores\javier\`
- **Almacenamiento Canal Paola**: `.\stores\paola\`
- **Scripts de Control**: `.\scripts\`

---

## 1. Vinculación Inicial (Código QR)

Abre una ventana de PowerShell en la carpeta del proyecto y ejecuta el script correspondiente al canal que deseas vincular:

### Para Vincular el Canal Javier:
```powershell
.\scripts\auth_javier.ps1
```
> Se generará un código QR en la consola. En el teléfono de **Javier**, abre WhatsApp -> **Dispositivos vinculados** -> **Vincular un dispositivo** y escanea el código QR.

### Para Vincular el Canal Paola:
```powershell
.\scripts\auth_paola.ps1
```
> Se generará un código QR en la consola. En el teléfono de **Paola**, abre WhatsApp -> **Dispositivos vinculados** -> **Vincular un dispositivo** y escanea el código QR.

---

## 2. Comandos de Consulta por Canal

Para consultar mensajes, chats o sincronizar sin mezclar la información entre vendedores, utiliza los wrappers dedicados:

### Canal Javier:
```powershell
# Sincronizar historial de mensajes de Javier
.\scripts\wacli_javier.ps1 sync

# Listar chats de Javier
.\scripts\wacli_javier.ps1 chats list

# Listar mensajes recientes de Javier
.\scripts\wacli_javier.ps1 messages list

# Buscar un mensaje específico de Javier
.\scripts\wacli_javier.ps1 messages list --query "pedido"
```

### Canal Paola:
```powershell
# Sincronizar historial de mensajes de Paola
.\scripts\wacli_paola.ps1 sync

# Listar chats de Paola
.\scripts\wacli_paola.ps1 chats list

# Listar mensajes recientes de Paola
.\scripts\wacli_paola.ps1 messages list

# Buscar un mensaje específico de Paola
.\scripts\wacli_paola.ps1 messages list --query "pedido"
```

---

## 3. Comandos Útiles Generales de `wacli`

Cualquier comando admitido por `wacli` se puede pasar a través de los scripts por canal:
- `.\scripts\wacli_javier.ps1 doctor` (Diagnóstico de sesión)
- `.\scripts\wacli_javier.ps1 status` (Estado de conexión)
- `.\scripts\wacli_javier.ps1 contacts search --query "Nombre"` (Buscar contacto)
