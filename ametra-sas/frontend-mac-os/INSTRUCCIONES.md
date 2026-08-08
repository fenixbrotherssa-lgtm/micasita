# Instalación en una Mac de cliente — guía rápida

## 1. Bajar los artifacts

`https://github.com/fenixbrotherssa-lgtm/micasita/actions` → build más reciente en verde → **Artifacts**:
- `AmetraOS-Backend-Mac` (.pkg)
- `AmetraOS-Desktop-Mac` (.dmg, viene arm64 e Intel)
- `AmetraOS-Uninstall-Mac`

## 2. Armar la carpeta

En una sola carpeta (ej. `ultimaversion/`), juntar:

```
ultimaversion/
├── AmetraOS-Backend-Mac/     ← el .pkg adentro
├── AmetraOS-Desktop-Mac/     ← los .dmg adentro
├── secrets/
│   └── firebase-service-account.json
├── SistemaOdonto_Pro_....bak   (backup de la base del cliente)
└── BASE_MAESTRA_NACIONAL.csv
```

Si es una actualización (no instalación nueva), no hace falta el `.bak` — el script lo salta si no lo encuentra.

## 3. Transferir a la Mac

Por AnyDesk: ícono de **File Transfer** en la barra de arriba de la ventana → mandar la carpeta completa (comprimida en `.zip` si es más rápido) al Desktop de la Mac. Si AnyDesk da problemas con el clipboard/paste al copiar comandos, usar siempre File Transfer para archivos, nunca pegar contenido de archivos en la Terminal.

## 4. Correr el instalador

En la Terminal de la Mac, parado dentro de la carpeta:

```bash
cd ~/Desktop/ultimaversion
sudo bash Backend_NodeJS/installer/mac/instalar-cliente-mac.sh
```

Si el script no está ahí (instalación nueva, todavía no hay backend instalado), copiarlo primero desde este repo o desde una instalación anterior — vive en:
`Backend_NodeJS/installer/mac/instalar-cliente-mac.sh`

## 5. Lo que va a pedir

- **Contraseña SA de SQL Server** (dos veces, solo si el contenedor no existe todavía). Mayúscula + minúscula + número + símbolo.
- **API key de Gemini** y **correo de notificaciones** — opcionales, Enter para dejarlos pendientes y completarlos después a mano en `.env`.
- **Confirmación antes de restaurar la base** (`s`/`N`) — es destructivo, reemplaza lo que haya.
- **Si querés vincular WhatsApp ahora** (`s`/`N`) — necesita el teléfono a mano para escanear el QR.
- La contraseña de administrador de macOS (`sudo`), la pide el sistema.

## 6. Si algo falla

El script es idempotente — correrlo de nuevo no rompe nada, salta lo que ya está bien. Sirve también como diagnóstico: volver a correrlo entero si algo quedó raro.

Casos conocidos:
- **"OrbStack no responde"** → abrirlo a mano desde Aplicaciones, esperar "Running", volver a correr el script.
- **Backend no responde después de instalar** → `tail -f /Library/Logs/AmetraOS/backend.log`, buscar `Cannot find module` (indica que faltó algo en el `.pkg`, revisar `.github/workflows/build-mac.yml`) u otro error.
- **Gatekeeper — "dañará tu ordenador" o "notarización revocada" al abrir la app** → desinstalar y reinstalar el `.dmg` a mano con doble clic (arrastrar a Aplicaciones, NO por terminal), después ir a **Configuración del Sistema → Privacidad y Seguridad** → bajar hasta el aviso de `ametra-os` → **Abrir de todas formas**. Esto funcionó cuando el método por Terminal (`cp -R` + `codesign`) no.

## 7. Verificación final

El script termina imprimiendo esto solo, pero se puede correr aparte en cualquier momento:

```bash
echo "=== Backend ===" && curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/auth && echo "" \
&& echo "=== SQL Server ===" && docker ps --filter name=ametra-db --format "{{.Status}}" \
&& echo "=== Servicio ===" && sudo launchctl list | grep casrodsoft \
&& echo "=== WhatsApp ===" && grep "Conectado" /Library/Logs/AmetraOS/backend.log | tail -1
```

Esperado: Backend `404`, SQL Server `Up`, servicio con `com.casrodsoft.ametraos.backend`, WhatsApp `Conectado`.
