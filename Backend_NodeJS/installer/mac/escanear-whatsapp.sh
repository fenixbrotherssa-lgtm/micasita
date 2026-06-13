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
echo "1. Deteniendo el servicio..."
sudo launchctl stop "$LABEL"
sleep 2

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

cd "$INSTALL_DIR"
sudo node server.js

echo ""
echo "3. Reiniciando el servicio en segundo plano..."
sudo launchctl start "$LABEL"
sleep 2

echo ""
echo "✓ Listo. WhatsApp vinculado y servicio corriendo normalmente."
echo ""
