#!/bin/bash
# Desinstalador de AmetraOS Backend para macOS.
# Equivalente a "Desinstalar programa" en Windows.
# Ejecutar con: sudo bash uninstall.sh

LABEL="com.casrodsoft.ametraos.backend"
PLIST="/Library/LaunchDaemons/${LABEL}.plist"
INSTALL_DIR="/Library/AmetraOS"
LOG_DIR="/Library/Logs/AmetraOS"

if [ "$(id -u)" != "0" ]; then
    echo "Este script debe ejecutarse con sudo: sudo bash uninstall.sh"
    exit 1
fi

echo "[AmetraOS] Deteniendo y desactivando el servicio..."
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"

echo "[AmetraOS] ¿Eliminar también los archivos de datos (uploads, .env, base de datos)? [s/N]"
read -r RESPUESTA
if [[ "$RESPUESTA" =~ ^[Ss]$ ]]; then
    rm -rf "$INSTALL_DIR"
    rm -rf "$LOG_DIR"
    echo "[AmetraOS] Archivos eliminados completamente."
else
    # Solo elimina el código, conserva datos del usuario
    rm -rf "$INSTALL_DIR/backend/config"
    rm -rf "$INSTALL_DIR/backend/controllers"
    rm -rf "$INSTALL_DIR/backend/middlewares"
    rm -rf "$INSTALL_DIR/backend/routes"
    rm -rf "$INSTALL_DIR/backend/services"
    rm -rf "$INSTALL_DIR/backend/node_modules"
    rm -f  "$INSTALL_DIR/backend/server.js"
    rm -f  "$INSTALL_DIR/backend/package.json"
    echo "[AmetraOS] Código eliminado. Los datos (uploads, .env) se conservaron en $INSTALL_DIR"
fi

echo "[AmetraOS] Desinstalación completada."
exit 0
