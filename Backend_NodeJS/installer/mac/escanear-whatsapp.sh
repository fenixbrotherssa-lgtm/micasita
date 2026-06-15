#!/bin/bash
# Usar este script SOLO la primera vez que se configura WhatsApp,
# o cuando WhatsApp cierre sesión y pida escanear de nuevo.

LABEL="com.casrodsoft.ametraos.backend"
INSTALL_DIR="/Library/AmetraOS/backend"

echo ""
echo "══════════════════════════════════════════════"
echo "  Configuración de WhatsApp - AmetraOS"
echo "══════════════════════════════════════════════"
echo ""
echo "1. Deteniendo el servicio y limpiando procesos..."
sudo launchctl unload /Library/LaunchDaemons/${LABEL}.plist 2>/dev/null || true
sudo pkill -f "node" 2>/dev/null || true
sudo pkill -f "Google Chrome" 2>/dev/null || true

echo "   Esperando que el puerto quede libre..."
for i in $(seq 1 15); do
    if ! lsof -i :8000 -sTCP:LISTEN -t &>/dev/null; then
        break
    fi
    sleep 1
done

echo "2. Iniciando en modo QR (NO cierres esta ventana)..."
echo ""
echo "   Cuando aparezca el código QR:"
echo "   - Abre WhatsApp en tu teléfono"
echo "   - Ve a Dispositivos vinculados → Vincular dispositivo"
echo "   - Escanea el QR de la pantalla"
echo ""
echo "   Al completar el escaneo, presiona Ctrl+C para finalizar."
echo "══════════════════════════════════════════════"
echo ""

_reiniciar_servicio() {
    echo ""
    echo "3. Reiniciando el servicio en segundo plano..."
    sudo pkill -f "Google Chrome" 2>/dev/null || true
    sudo launchctl load /Library/LaunchDaemons/${LABEL}.plist 2>/dev/null || true
    sudo launchctl start "$LABEL"
    sleep 2
    echo ""
    echo "✓ Listo. WhatsApp vinculado y servicio corriendo normalmente."
    echo ""
    exit 0
}

trap '_reiniciar_servicio' INT TERM

cd "$INSTALL_DIR"
sudo node server.js

_reiniciar_servicio
