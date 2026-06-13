# Guía de Instalación AmetraOS en macOS

## Dónde están los instaladores

1. Entrar a: `https://github.com/fenixbrotherssa-lgtm/micasita/actions`
2. Hacer clic en el workflow más reciente con ✅ verde ("Build macOS")
3. Bajar hasta la sección **Artifacts** al fondo de la página
4. Descargar los tres archivos:
   - `AmetraOS-Backend-Mac` → contiene el `.pkg` del servidor
   - `AmetraOS-Desktop-Mac` → contiene el `.dmg` de la app
   - `AmetraOS-Uninstall-Mac` → script de desinstalación (guardar para después)

Cada descarga llega como `.zip`. Descomprimirlo para obtener el `.pkg` o `.dmg` dentro.

---

## Requisitos previos (instalar una sola vez)

### 1. Node.js 24

- Abrir Safari y entrar a `https://nodejs.org`
- Descargar el botón **LTS** (versión recomendada)
- Abrir el `.pkg` descargado → Continuar → Instalar
- Verificar: abrir **Terminal** (Aplicaciones → Utilidades → Terminal) y escribir:
  ```
  node --version
  ```
  Debe mostrar `v24.x.x`

### 2. Docker Desktop

- Entrar a `https://www.docker.com/products/docker-desktop`
- Descargar para Mac (elegir **Apple Silicon** si el Mac es M1/M2/M3/M4, o **Intel** si es más antiguo)
- Abrir el `.dmg`, arrastrar Docker a Aplicaciones
- Abrir Docker desde Aplicaciones y dejarlo correr (aparece la ballena en la barra de menú)
- Esperar hasta que diga **"Docker Desktop is running"**

### 3. SQL Server 2025 Express

Con Docker corriendo, abrir **Terminal** y pegar este comando completo:

```bash
docker run -d --name ametra-db \
  -e "ACCEPT_EULA=Y" \
  -e "SA_PASSWORD=Daviana06101988!" \
  -e "MSSQL_PID=Express" \
  -p 1433:1433 \
  --restart unless-stopped \
  mcr.microsoft.com/mssql/server:2025-latest
```

> **Nota sobre la contraseña:** En Mac, SQL Server exige contraseñas con mayúsculas, minúsculas, números y un símbolo especial. Se usa `Daviana06101988!` (con D mayúscula y ! al final). Esta contraseña se configura también en el archivo .env del backend.

Verificar que el contenedor arrancó:
```bash
docker ps
```
Debe aparecer una línea con `ametra-db` y estado `Up`.

### 4. Azure Data Studio (para restaurar la base de datos)

- Entrar a `https://azure.microsoft.com/products/data-studio`
- Descargar para macOS e instalar
- Al abrir, crear nueva conexión:
  - Servidor: `127.0.0.1`
  - Usuario: `sa`
  - Contraseña: `Daviana06101988!`
  - Tipo de autenticación: SQL Login

---

## Instalación paso a paso

### Paso 1 — Instalar el backend como servicio

1. Descomprimir `AmetraOS-Backend-Mac.zip`
2. Doble clic en `AmetraOS-Backend-3.0.0.pkg`
3. Clic en **Continuar** → **Instalar**
4. El Mac pide contraseña de administrador → escribirla → **Instalar software**
5. El instalador automáticamente:
   - Copia el servidor a `/Library/AmetraOS/backend/`
   - Crea el archivo de configuración `.env`
   - Registra el servidor como servicio del sistema (arranca solo con el Mac)

### Paso 2 — Configurar el archivo .env

Abrir Terminal y escribir:
```bash
sudo nano /Library/AmetraOS/backend/.env
```
El Mac pide contraseña de administrador. Editar los valores:

```
PORT=8000
DB_USER=sa
DB_PASSWORD=Daviana06101988!
DB_SERVER=127.0.0.1
DB_NAME=SistemaOdonto_Pro
POLITICA_API_KEY=<pegar la clave de Gemini>
IA_MODEL_NAME=gemini-2.5-flash-lite
IA_FALLBACK_MODELS=gemini-2.5-flash,gemini-2.0-flash
MAIL_USER=<correo>
MAIL_PASS=<contraseña del correo>
```

Guardar: presionar `Ctrl + O` → Enter → `Ctrl + X` para salir.

### Paso 3 — Reiniciar el backend con la nueva configuración

```bash
sudo launchctl stop com.casrodsoft.ametraos.backend
sudo launchctl start com.casrodsoft.ametraos.backend
```

### Paso 4 — Restaurar la base de datos

1. Copiar el archivo `.bak` de Windows al Mac (por USB o red)
2. Copiar el `.bak` al contenedor Docker:
   ```bash
   docker cp /ruta/al/archivo/SistemaOdonto_Pro.bak ametra-db:/tmp/
   ```
3. Abrir Azure Data Studio → conectarse a `127.0.0.1`
4. Clic derecho en **Databases** → **Restore**
5. Source: Device → seleccionar el archivo `/tmp/SistemaOdonto_Pro.bak`
6. Database name: `SistemaOdonto_Pro`
7. Clic en **Restore**

### Paso 5 — Copiar la BASE_MAESTRA_NACIONAL.csv

Conectar el USB con el archivo y en Terminal:
```bash
sudo cp /Volumes/NOMBRE_USB/BASE_MAESTRA_NACIONAL.csv /Library/AmetraOS/backend/
```
> Reemplazar `NOMBRE_USB` con el nombre real del pendrive (se ve en el Finder en la barra lateral izquierda).

### Paso 6 — Instalar la app de escritorio

1. Descomprimir `AmetraOS-Desktop-Mac.zip`
2. Doble clic en el `.dmg`
3. Arrastrar el ícono de `ametra-os` a la carpeta **Aplicaciones**
4. Cerrar el `.dmg`
5. Abrir la app desde Aplicaciones

> **Primera vez:** macOS puede mostrar un aviso de seguridad porque la app no está firmada con certificado de Apple. Ir a **Configuración del Sistema → Privacidad y Seguridad** → bajar hasta ver el mensaje de ametra-os → clic en **Abrir de todas formas**.

---

## Verificación final

Abrir Terminal y verificar que el backend responde:
```bash
curl http://127.0.0.1:8000/api/auth
```
Debe responder algo (aunque sea un error de método) — eso confirma que el servidor está corriendo.

---

## Comandos útiles de mantenimiento

```bash
# Ver logs del backend en tiempo real
tail -f /Library/Logs/AmetraOS/backend.log

# Reiniciar el backend
sudo launchctl stop com.casrodsoft.ametraos.backend
sudo launchctl start com.casrodsoft.ametraos.backend

# Ver si el servicio está activo
sudo launchctl list | grep casrodsoft

# Reiniciar el contenedor de SQL Server
docker restart ametra-db

# Ver logs de SQL Server
docker logs ametra-db
```

---

## Desinstalación

```bash
# Descomprimir AmetraOS-Uninstall-Mac.zip primero, luego:
sudo bash uninstall.sh
```

El script pregunta si eliminar también los datos. Si es una desinstalación para reinstalar, decir **N** para conservar los datos.
