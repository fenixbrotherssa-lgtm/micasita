#!/bin/bash
# Instalación completa automatizada de AmetraOS en una Mac de cliente nueva.
# Reemplaza la secuencia manual de ~20 comandos de INSTALACION_MAC.md.
#
# Uso: parado dentro de una carpeta con esta estructura (la misma que se arma
# hoy a mano con los artifacts de GitHub Actions + los archivos del cliente):
#
#   AmetraOS-Backend-Mac/*.pkg
#   AmetraOS-Desktop-Mac/*.dmg       (arm64 y/o Intel — se detecta el chip solo)
#   secrets/firebase-service-account.json
#   secrets/ametra-checkin.key   (opcional: registro de instalaciones)
#   *.bak                             (backup de la base de datos del cliente)
#   BASE_MAESTRA_NACIONAL.csv
#
#   sudo bash instalar-cliente-mac.sh
#
# Es idempotente: si algo ya está instalado/configurado, lo detecta y lo salta.
# Sirve tanto para una instalación nueva como para revisar/reparar una existente.

set -uo pipefail

LABEL="com.casrodsoft.ametraos.backend"
INSTALL_DIR="/Library/AmetraOS/backend"
PLIST="/Library/LaunchDaemons/${LABEL}.plist"
DB_CONTAINER="ametra-db"
DB_NAME="SistemaOdonto_Pro"

linea() { echo "══════════════════════════════════════════════"; }
paso()  { echo ""; linea; echo "  $1"; linea; }

# ── 0. Preflight ─────────────────────────────────────────────────────────────
if [ "$(uname -s)" != "Darwin" ]; then
    echo "Este script es solo para macOS."
    exit 1
fi

if [ "$EUID" -ne 0 ]; then
    echo "Se necesitan privilegios de administrador, reintentando con sudo..."
    exec sudo -E bash "$0" "$@"
fi

REAL_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
INPUT_DIR="$(pwd)"

paso "Instalación AmetraOS - Mac cliente nuevo"
echo "Carpeta de entrada: $INPUT_DIR"
echo "Usuario real: $REAL_USER"

# ── 1. Homebrew ───────────────────────────────────────────────────────────────
paso "1/13 - Homebrew"
if command -v brew &>/dev/null; then
    echo "✓ Ya instalado."
    BREW_BIN="$(command -v brew)"
else
    echo "Instalando Homebrew (como $REAL_USER, no como root)..."
    sudo -u "$REAL_USER" /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    BREW_BIN="/opt/homebrew/bin/brew"
    [ -x "$BREW_BIN" ] || BREW_BIN="/usr/local/bin/brew"
fi

# ── 2. Node.js 24 ─────────────────────────────────────────────────────────────
paso "2/13 - Node.js 24"
if node --version 2>/dev/null | grep -q "^v24"; then
    echo "✓ Ya instalado: $(node --version)"
else
    echo "Instalando Node.js 24 vía Homebrew..."
    sudo -u "$REAL_USER" "$BREW_BIN" install node@24
    sudo -u "$REAL_USER" "$BREW_BIN" link --overwrite --force node@24
fi

# ── 3. OrbStack ───────────────────────────────────────────────────────────────
paso "3/13 - OrbStack"
if ! command -v docker &>/dev/null; then
    echo "Instalando OrbStack..."
    sudo -u "$REAL_USER" "$BREW_BIN" install orbstack
    echo ""
    echo "Abrí OrbStack desde Aplicaciones, aceptá los permisos que pida,"
    echo "y esperá a que diga 'Running'."
    read -rp "Presioná Enter cuando esté listo... " _
fi

echo "Esperando a que OrbStack responda..."
for i in $(seq 1 30); do
    docker info &>/dev/null && break
    sleep 2
done
if ! docker info &>/dev/null; then
    echo "✗ OrbStack no responde. Abrilo manualmente desde Aplicaciones y volvé a correr este script."
    exit 1
fi
echo "✓ OrbStack activo."

# ── 4. Contenedor SQL Server ──────────────────────────────────────────────────
paso "4/13 - SQL Server"
SQLCMD_BIN() {
    if docker exec "$DB_CONTAINER" test -f /opt/mssql-tools18/bin/sqlcmd 2>/dev/null; then
        echo "/opt/mssql-tools18/bin/sqlcmd"
    else
        echo "/opt/mssql-tools/bin/sqlcmd"
    fi
}

if ! docker inspect "$DB_CONTAINER" &>/dev/null; then
    echo "Creando el contenedor SQL Server (2025 Express)..."
    while true; do
        read -rsp "Contraseña SA (mayúscula+minúscula+número+símbolo): " SA_PASS; echo
        read -rsp "Repetila: " SA_PASS2; echo
        [ "$SA_PASS" = "$SA_PASS2" ] && break
        echo "No coinciden, probá de nuevo."
    done

    docker run -d --name "$DB_CONTAINER" \
        -e "ACCEPT_EULA=Y" \
        -e "SA_PASSWORD=$SA_PASS" \
        -e "MSSQL_PID=Express" \
        -p 1433:1433 \
        --restart always \
        mcr.microsoft.com/mssql/server:2025-latest

    echo "Esperando a que SQL Server acepte conexiones (puede tardar ~60s la primera vez)..."
    SQLCMD=""
    for i in $(seq 1 40); do
        CANDIDATE=$(SQLCMD_BIN 2>/dev/null)
        if [ -n "$CANDIDATE" ] && docker exec "$DB_CONTAINER" "$CANDIDATE" -S localhost -U sa -P "$SA_PASS" -No -Q "SELECT 1" &>/dev/null; then
            SQLCMD="$CANDIDATE"
            break
        fi
        sleep 3
    done
    if [ -z "$SQLCMD" ]; then
        echo "✗ SQL Server no respondió a tiempo. Revisar: docker logs $DB_CONTAINER"
        exit 1
    fi
    echo "✓ SQL Server activo."

    echo "Limitando memoria de SQL Server a 1024MB..."
    docker exec "$DB_CONTAINER" "$SQLCMD" -S localhost -U sa -P "$SA_PASS" -No \
        -Q "EXEC sp_configure 'show advanced options', 1; RECONFIGURE; EXEC sp_configure 'max server memory (MB)', 1024; RECONFIGURE;"
else
    echo "✓ Contenedor $DB_CONTAINER ya existe."
    RESTART=$(docker inspect "$DB_CONTAINER" --format='{{.HostConfig.RestartPolicy.Name}}')
    if [ "$RESTART" != "always" ]; then
        docker update --restart always "$DB_CONTAINER"
        echo "✓ Política de reinicio corregida a 'always'."
    fi
    docker start "$DB_CONTAINER" &>/dev/null || true
    read -rsp "Contraseña SA existente (para restaurar la base / completar el .env): " SA_PASS; echo
    SQLCMD=$(SQLCMD_BIN)
fi

# ── 5. Restaurar backup de la base de datos ──────────────────────────────────
paso "5/13 - Restaurar base de datos"
BAK_FILE=$(find "$INPUT_DIR" -maxdepth 2 -iname "*.bak" 2>/dev/null | head -1)
if [ -z "$BAK_FILE" ]; then
    echo "No encontré ningún .bak en $INPUT_DIR — se omite la restauración."
else
    BAK_NAME=$(basename "$BAK_FILE")
    echo "Encontrado: $BAK_FILE"
    read -rp "Esto va a REEMPLAZAR la base '$DB_NAME' si ya existe datos. ¿Continuar? (s/N): " CONFIRMA
    if [ "$CONFIRMA" = "s" ] || [ "$CONFIRMA" = "S" ]; then
        docker cp "$BAK_FILE" "$DB_CONTAINER:/tmp/$BAK_NAME"
        docker exec "$DB_CONTAINER" "$SQLCMD" -S localhost -U sa -P "$SA_PASS" -No \
            -Q "RESTORE DATABASE [$DB_NAME] FROM DISK = '/tmp/$BAK_NAME' WITH REPLACE"
        echo "✓ Base restaurada."
    else
        echo "Restauración cancelada por el operador."
    fi
fi

# ── 6. Instalar el backend (PKG) ─────────────────────────────────────────────
paso "6/13 - Instalar backend"
PKG_FILE=$(find "$INPUT_DIR" -maxdepth 3 -iname "*.pkg" 2>/dev/null | head -1)
if [ -z "$PKG_FILE" ]; then
    echo "✗ No encontré ningún .pkg en $INPUT_DIR. Abortando."
    exit 1
fi
echo "Instalando: $PKG_FILE"
installer -pkg "$PKG_FILE" -target /

# ── 7. Completar .env ─────────────────────────────────────────────────────────
paso "7/13 - Configurar .env"
ENV_FILE="$INSTALL_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    sed -i '' "s/^DB_PASSWORD=.*/DB_PASSWORD=$SA_PASS/" "$ENV_FILE"
    read -rp "API key de Gemini (Enter para dejarla pendiente): " GEMINI_KEY
    [ -n "$GEMINI_KEY" ] && sed -i '' "s/^POLITICA_API_KEY=.*/POLITICA_API_KEY=$GEMINI_KEY/" "$ENV_FILE"
    read -rp "Correo para notificaciones (Enter para omitir): " MAIL_U
    if [ -n "$MAIL_U" ]; then
        sed -i '' "s/^MAIL_USER=.*/MAIL_USER=$MAIL_U/" "$ENV_FILE"
        read -rsp "Contraseña de aplicación del correo: " MAIL_P; echo
        sed -i '' "s/^MAIL_PASS=.*/MAIL_PASS=$MAIL_P/" "$ENV_FILE"
    fi
    echo "✓ .env actualizado."
else
    echo "✗ No se encontró $ENV_FILE — revisar que el PKG haya corrido postinstall.sh bien."
fi

# ── 8. CSV maestro + credencial de Firebase ──────────────────────────────────
paso "8/13 - CSV maestro y credencial de Firebase"
CSV_FILE=$(find "$INPUT_DIR" -maxdepth 2 -iname "BASE_MAESTRA_NACIONAL.csv" 2>/dev/null | head -1)
if [ -n "$CSV_FILE" ]; then
    cp "$CSV_FILE" "$INSTALL_DIR/BASE_MAESTRA_NACIONAL.csv"
    echo "✓ CSV maestro copiado."
else
    echo "AVISO: no encontré BASE_MAESTRA_NACIONAL.csv en $INPUT_DIR."
fi

FIREBASE_FILE=$(find "$INPUT_DIR" -maxdepth 3 -iname "firebase-service-account.json" 2>/dev/null | head -1)
if [ -n "$FIREBASE_FILE" ]; then
    mkdir -p "$INSTALL_DIR/secrets"
    cp "$FIREBASE_FILE" "$INSTALL_DIR/secrets/firebase-service-account.json"
    chown root:wheel "$INSTALL_DIR/secrets/firebase-service-account.json"
    chmod 600 "$INSTALL_DIR/secrets/firebase-service-account.json"
    echo "✓ Credencial de Firebase copiada."
else
    echo "AVISO: no encontré secrets/firebase-service-account.json — el módulo de notificaciones push no va a arrancar hasta agregarla."
fi

# Clave del registro de instalaciones (casrodsoft.com/admin/instalaciones). Sin ella el
# sistema funciona igual, solo no se reporta en el panel.
CHECKIN_FILE=$(find "$INPUT_DIR" -maxdepth 3 -iname "ametra-checkin.key" 2>/dev/null | head -1)
if [ -n "$CHECKIN_FILE" ]; then
    mkdir -p "$INSTALL_DIR/secrets"
    cp "$CHECKIN_FILE" "$INSTALL_DIR/secrets/ametra-checkin.key"
    chown root:wheel "$INSTALL_DIR/secrets/ametra-checkin.key"
    chmod 600 "$INSTALL_DIR/secrets/ametra-checkin.key"
    echo "✓ Clave del registro de instalaciones copiada."
else
    echo "AVISO: no encontré secrets/ametra-checkin.key — esta instalación no aparecerá en el panel de instalaciones."
fi

# ── 9. Reiniciar y verificar backend ─────────────────────────────────────────
paso "9/13 - Reiniciar backend"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST" 2>/dev/null || true
launchctl start "$LABEL"
sleep 5
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/auth)
if [ "$CODE" = "404" ]; then
    echo "✓ Backend respondiendo (404 = normal)."
else
    echo "AVISO: backend respondió código '$CODE'. Revisar: tail -f /Library/Logs/AmetraOS/backend.log"
fi

# ── 10. Instalar el frontend (DMG) ───────────────────────────────────────────
paso "10/13 - Instalar frontend"
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    DMG_FILE=$(find "$INPUT_DIR" -maxdepth 3 -iname "*arm64*.dmg" 2>/dev/null | head -1)
else
    DMG_FILE=$(find "$INPUT_DIR" -maxdepth 3 -iname "*.dmg" ! -iname "*arm64*" 2>/dev/null | head -1)
fi

if [ -z "$DMG_FILE" ]; then
    echo "AVISO: no encontré el .dmg correcto para arquitectura $ARCH — instalar a mano."
else
    echo "Instalando: $DMG_FILE (arquitectura detectada: $ARCH)"
    MOUNT_LINE=$(hdiutil attach -nobrowse "$DMG_FILE" | grep '/Volumes/' | tail -1)
    VOLUME=$(echo "$MOUNT_LINE" | sed -E 's/^.*(\/Volumes\/.*)$/\1/')
    APP_SRC=$(find "$VOLUME" -maxdepth 1 -iname "*.app" 2>/dev/null | head -1)
    if [ -z "$APP_SRC" ]; then
        echo "✗ No encontré el .app dentro del volumen montado ($VOLUME). Instalar a mano."
    else
        rm -rf /Applications/ametra-os.app
        cp -R "$APP_SRC" /Applications/
        hdiutil detach "$VOLUME" &>/dev/null || true
        xattr -rd com.apple.quarantine /Applications/ametra-os.app
        if spctl -a "/Applications/ametra-os.app" &>/dev/null; then
            echo "✓ App instalada y aceptada por Gatekeeper."
        else
            echo ""
            echo "AVISO: macOS todavía bloquea la app (Gatekeeper)."
            echo "Solución que funcionó en el pasado: reinstalar el .dmg a mano con doble clic"
            echo "(arrastrar ametra-os a Aplicaciones) y luego ir a Configuración del Sistema ->"
            echo "Privacidad y Seguridad -> bajar hasta el aviso de ametra-os -> Abrir de todas formas."
        fi
    fi
fi

# ── 11. Inicio automático ─────────────────────────────────────────────────────
paso "11/13 - Verificar inicio automático"
if [ -x "$INSTALL_DIR/configurar-inicio-automatico.sh" ]; then
    bash "$INSTALL_DIR/configurar-inicio-automatico.sh" || true
fi
sudo -u "$REAL_USER" osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/OrbStack.app", hidden:true}' 2>/dev/null || true

# ── 12. WhatsApp ───────────────────────────────────────────────────────────────
paso "12/13 - WhatsApp"
read -rp "¿Vincular WhatsApp ahora? Vas a necesitar el teléfono a mano (s/N): " WA
if [ "$WA" = "s" ] || [ "$WA" = "S" ]; then
    if [ -x "$INSTALL_DIR/escanear-whatsapp.sh" ]; then
        bash "$INSTALL_DIR/escanear-whatsapp.sh"
    else
        echo "✗ No encontré $INSTALL_DIR/escanear-whatsapp.sh"
    fi
else
    echo "Omitido. Correr más tarde: sudo bash $INSTALL_DIR/escanear-whatsapp.sh"
fi

# ── 13. Resumen final ──────────────────────────────────────────────────────────
paso "13/13 - Verificación final"
echo "=== Backend ==="
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/api/auth
echo "=== SQL Server ==="
docker ps --filter name="$DB_CONTAINER" --format "{{.Status}}"
echo "=== Servicio ==="
launchctl list | grep casrodsoft
echo "=== WhatsApp ==="
grep "Conectado" /Library/Logs/AmetraOS/backend.log 2>/dev/null | tail -1

echo ""
linea
echo "  Instalación terminada."
linea
