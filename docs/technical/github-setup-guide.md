# Guía Manual: Conectar tu proyecto con GitHub

## 🎯 Objetivo
Conectar tu proyecto local Life Deportes con GitHub para tener un respaldo remoto profesional y poder colaborar.

## 📋 PREREQUISITOS
- ✅ Tu proyecto Git ya está configurado localmente
- ✅ Tienes cuenta de GitHub (si no, créala en github.com)
- ✅ Quieres aprender Git paso a paso

---

## 🚀 PASO A PASO MANUAL

### PASO 1: Crear repositorio en GitHub

1. **Ve a GitHub.com** y haz login
2. **Click en el botón verde "New"** (o el ícono "+" → "New repository")
3. **Llena la información:**
   - **Repository name**: `life-deportes` (o el nombre que prefieras)
   - **Description**: `Sistema de automatización de ventas - Life Deportes`
   - **Visibility**: Private (recomendado para proyecto privado)
   - **NO marques** "Add a README file" (ya tienes uno)
   - **NO marques** "Add .gitignore" (ya tienes uno)
4. **Click "Create repository"**

**Resultado:** GitHub te dará una URL como `https://github.com/tu-usuario/life-deportes.git`

---

### PASO 2: Conectar tu repositorio local con GitHub

En tu terminal, desde la carpeta `/Users/diego/Sync`, ejecuta estos comandos UNO POR UNO:

#### 2.1 Verificar estado actual
```bash
git status
```
**¿Qué hace?** Muestra archivos modificados, commits pendientes, etc.

#### 2.2 Agregar el repositorio remoto
```bash
git remote add origin https://github.com/TU-USUARIO/life-deportes.git
```
**¿Qué hace?** 
- `remote`: Gestiona repositorios remotos
- `add origin`: Agrega un remoto llamado "origin"
- La URL: Es la que te dio GitHub

**Reemplaza TU-USUARIO con tu nombre de usuario real de GitHub**

#### 2.3 Verificar que se agregó correctamente
```bash
git remote -v
```
**¿Qué debe mostrar?**
```
origin  https://github.com/TU-USUARIO/life-deportes.git (fetch)
origin  https://github.com/TU-USUARIO/life-deportes.git (push)
```

#### 2.4 Verificar que no hay cambios pendientes
```bash
git status
```
**Debe decir:** "Your branch is up to date with 'origin/main'." (aunque aún no hemos pushado)

---

### PASO 3: Subir tu código a GitHub (Push)

#### 3.1 Hacer push por primera vez
```bash
git push -u origin main
```
**¿Qué hace?**
- `push`: Sube cambios al remoto
- `-u`: Establece upstream (relación entre local y remoto)
- `origin`: Nombre del remoto (que agregamos antes)
- `main`: Rama que queremos subir

#### 3.2 Primera autenticación
GitHub te pedirá autenticarte. Tienes varias opciones:

**Opción A: Personal Access Token (RECOMENDADO)**
1. GitHub te abrirá una página para crear un token
2. O ve a Settings → Developer settings → Personal access tokens
3. Genera un token con permisos de `repo`
4. Cuando te pida password, usa el token como password

**Opción B: GitHub CLI**
```bash
# Si tienes GitHub CLI instalado
gh auth login
```

**Opción C: Usuario y Password (DEPRECADO)**
Ya no se recomienda, GitHub eliminó esta opción.

---

### PASO 4: Verificar que funcionó

#### 4.1 Verificar en GitHub
1. Ve a `https://github.com/TU-USUARIO/life-deportes`
2. Deberías ver todos tus archivos
3. Deberías ver los 3 commits con tu nombre "Diego Sáenz"

#### 4.2 Verificar desde terminal
```bash
git log --oneline -3
```

---

## 🔄 FLUJO DE TRABAJO DIARIO

### Para hacer cambios y subirlos:

#### 1. Verificar estado
```bash
git status
```

#### 2. Agregar archivos modificados
```bash
git add .  # O git add archivo-especifico.txt
```

#### 3. Crear commit
```bash
git commit -m "feat(chatbot): descripción del cambio"
```

#### 4. Subir cambios
```bash
git push
```
**Nota:** Ya no necesitas `-u origin main` porque se estableció la relación

---

## 🆘 TROUBLESHOOTING COMÚN

### Error: "Authentication failed"
```bash
# Solución 1: Actualizar credenciales
git remote set-url origin https://tu-usuario:TOKEN@github.com/tu-usuario/life-deportes.git

# Solución 2: Usar GitHub CLI
gh auth login
```

### Error: "Repository not found"
- Verifica que el nombre del repositorio sea correcto
- Verifica que tengas permisos en el repositorio
- Verifica la URL: `git remote -v`

### Error: "Updates were rejected"
```bash
# Solución: Forzar push (¡CUIDADO en proyectos colaborativos!)
git push -f

# Mejor solución: Hacer pull primero
git pull origin main
# Resolver conflictos si los hay
git add .
git commit -m "resolver conflictos"
git push
```

---

## 🧠 CONCEPTOS IMPORTANTES QUE ESTÁS APRENDIENDO

### ¿Qué es un "remote"?
- Es una versión de tu proyecto que vive en otro lugar (GitHub, GitLab, etc.)
- `origin` es el nombre convencional para el remoto principal

### ¿Qué significa `-u` en `push -u`?
- Establece una relación entre tu rama local y la rama remota
- Después solo necesitas `git push` 
- Git recordará qué rama remota corresponde a tu rama local

### ¿Por qué GitHub pide token en lugar de password?
- Más seguro que las contraseñas
- Puedes revocar tokens específicos
- Puedes limitar permisos por token

---

## 📚 COMANDOS ÚTILES PARA EXPLORAR

```bash
# Ver todos los remotos
git remote -v

# Ver información detallada del remoto
git remote show origin

# Ver historial remoto
git log origin/main

# Descargar cambios sin aplicarlos
git fetch

# Ver diferencias entre local y remoto
git diff main origin/main
```

---

## 🎉 ¡FELICITACIONES!

Cuando completes estos pasos, tendrás:
- ✅ Tu código respaldado en GitHub
- ✅ Historial de versiones completo
- ✅ Capacidad de colaborar con otros
- ✅ Base sólida para sincronización con n8n Cloud

---

## 📝 NOTAS PARA EL FUTURO

### Próximos pasos naturales:
1. **Crear branchs para features**: `git checkout -b feature/nueva-funcionalidad`
2. **Aprender sobre Pull Requests** en GitHub
3. **Configurar sincronización con n8n Cloud** cuando domines Git básico
4. **Explorar GitHub Actions** para automatización

### Recursos para seguir aprendiendo:
- [GitHub Docs](https://docs.github.com/en/get-started)
- [Pro Git Book (gratis)](https://git-scm.com/book)
- [GitHub Skills](https://skills.github.com/)

---

**¡Estás listo para hacer push a GitHub! 🚀**