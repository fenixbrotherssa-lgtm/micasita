#!/bin/bash
# Ejecutado por el PKG DESPUÉS de copiar archivos.
# Equivalente al setup que hace Inno Setup + NSSM en Windows.

set -e

INSTALL_DIR="/Library/AmetraOS/backend"
LOG_DIR="/Library/Logs/AmetraOS"
LABEL="com.casrodsoft.ametraos.backend"
PLIST_DEST="/Library/LaunchDaemons/${LABEL}.plist"

# ── 1. Detectar Node.js ──────────────────────────────────────────────────────
NODE_BIN=""
for candidate in \
    "/opt/homebrew/bin/node" \
    "/usr/local/bin/node" \
    "/usr/bin/node" \
    "$(which node 2>/dev/null)"; do
    if [ -x "$candidate" ]; then
        NODE_BIN="$candidate"
        break
    fi
done

if [ -z "$NODE_BIN" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║  ERROR: Node.js no está instalado.                               ║"
    echo "║  Instálelo desde https://nodejs.org (versión 24 LTS) y          ║"
    echo "║  vuelva a ejecutar este instalador.                              ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    exit 1
fi

echo "[AmetraOS] Node.js detectado en: $NODE_BIN"

# ── 2. Crear directorios necesarios ─────────────────────────────────────────
mkdir -p "$LOG_DIR"
mkdir -p "$INSTALL_DIR/uploads/clinico"
mkdir -p "$INSTALL_DIR/uploads/recetas"
mkdir -p "$INSTALL_DIR/uploads/vouchers"
mkdir -p "$INSTALL_DIR/uploads/facturacion/xml_generados"
mkdir -p "$INSTALL_DIR/uploads/facturacion/xml_firmados"
mkdir -p "$INSTALL_DIR/sessions"

# ── 3. Crear .env si no existe (primera instalación) ────────────────────────
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" << 'ENVEOF'
PORT=8000
DB_USER=sa
DB_PASSWORD=CAMBIA_ESTO
DB_SERVER=127.0.0.1
DB_NAME=SistemaOdonto_Pro
POLITICA_API_KEY=CAMBIA_ESTO
IA_MODEL_NAME=gemini-2.5-flash-lite
IA_FALLBACK_MODELS=gemini-2.5-flash,gemini-2.0-flash
MAIL_USER=
MAIL_PASS=
ENVEOF
    echo "[AmetraOS] Archivo .env creado. EDÍTELO antes de iniciar el servicio:"
    echo "           sudo nano $ENV_FILE"
fi

# ── 4. Ajustar permisos ──────────────────────────────────────────────────────
chown -R root:wheel "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"
chmod 600 "$ENV_FILE"

# ── 5. Generar el plist de launchd con la ruta real de Node ─────────────────
cat > "$PLIST_DEST" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${INSTALL_DIR}/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${INSTALL_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/backend.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/backend-error.log</string>
    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>
PLISTEOF

chown root:wheel "$PLIST_DEST"
chmod 644 "$PLIST_DEST"

# ── 6. Activar e iniciar el servicio ────────────────────────────────────────
launchctl load "$PLIST_DEST"
launchctl start "$LABEL"

# ── 7. Silenciar Docker Desktop (no abrir ventana al arrancar) ──────────
defaults write com.docker.docker showDockerDashboardAtLogin -bool false 2>/dev/null || true

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  AmetraOS Backend instalado y corriendo como servicio del sistema ║"
echo "║                                                                   ║"
echo "║  Logs:      tail -f ${LOG_DIR}/backend.log     ║"
echo "║  Detener:   sudo launchctl stop ${LABEL}   ║"
echo "║  Iniciar:   sudo launchctl start ${LABEL}  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "  IMPORTANTE: Edite el .env antes de usar el sistema:"
echo "  sudo nano $ENV_FILE"

exit 0
