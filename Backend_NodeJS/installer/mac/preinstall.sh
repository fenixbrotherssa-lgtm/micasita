#!/bin/bash
# Ejecutado por el PKG ANTES de copiar archivos.
# Detiene el servicio si ya existe (actualización).

LABEL="com.casrodsoft.ametraos.backend"
PLIST="/Library/LaunchDaemons/${LABEL}.plist"

if [ -f "$PLIST" ]; then
    echo "[AmetraOS] Deteniendo servicio anterior..."
    launchctl unload "$PLIST" 2>/dev/null || true
fi

# Preservar sesión de WhatsApp durante actualizaciones
SESSION_SRC="/Library/AmetraOS/backend/sessions"
SESSION_BAK="/tmp/ametra_sessions_backup"
if [ -d "$SESSION_SRC" ]; then
    echo "[AmetraOS] Guardando sesión de WhatsApp..."
    rm -rf "$SESSION_BAK"
    cp -r "$SESSION_SRC" "$SESSION_BAK"
fi

exit 0
