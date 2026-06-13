#!/bin/bash
# Ejecutado por el PKG ANTES de copiar archivos.
# Detiene el servicio si ya existe (actualización).

LABEL="com.casrodsoft.ametraos.backend"
PLIST="/Library/LaunchDaemons/${LABEL}.plist"

if [ -f "$PLIST" ]; then
    echo "[AmetraOS] Deteniendo servicio anterior..."
    launchctl unload "$PLIST" 2>/dev/null || true
fi

exit 0
