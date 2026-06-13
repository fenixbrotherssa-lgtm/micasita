#!/bin/bash
# Ejecutar este script UNA SOLA VEZ después de instalar todo.
# Configura que Docker, SQL Server y el backend arranquen solos al encender el Mac.

echo ""
echo "══════════════════════════════════════════════"
echo "  Configurando inicio automático - AmetraOS"
echo "══════════════════════════════════════════════"
echo ""

# 1. Docker Desktop arranque al iniciar sesión
echo "• Configurando Docker para arrancar con el Mac..."
osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/Docker.app", hidden:true}' 2>/dev/null || true
defaults write com.docker.docker showDockerDashboardAtLogin -bool false

# 2. Verificar que el servicio del backend está activo
echo "• Verificando servicio del backend..."
if sudo launchctl list | grep -q "casrodsoft"; then
    echo "  ✓ Backend registrado como servicio del sistema"
else
    echo "  ✗ Problema: el servicio no está registrado. Reinstalar el .pkg"
fi

# 3. Verificar que el contenedor Docker tiene política de reinicio
echo "• Verificando SQL Server..."
RESTART=$(docker inspect ametra-db --format='{{.HostConfig.RestartPolicy.Name}}' 2>/dev/null)
if [ "$RESTART" = "unless-stopped" ]; then
    echo "  ✓ SQL Server se reinicia automáticamente con Docker"
else
    echo "  Ajustando política de reinicio de SQL Server..."
    docker update --restart unless-stopped ametra-db
    echo "  ✓ Listo"
fi

echo ""
echo "══════════════════════════════════════════════"
echo "  Secuencia de arranque al encender el Mac:"
echo ""
echo "  1. Mac enciende"
echo "  2. Usuario inicia sesión"
echo "  3. Docker arranca en segundo plano (sin ventana)"
echo "  4. SQL Server arranca dentro de Docker"
echo "  5. Backend AmetraOS arranca como servicio"
echo "  6. En ~60 segundos todo está listo para usar"
echo ""
echo "  El cliente NO necesita hacer nada técnico."
echo "══════════════════════════════════════════════"
echo ""
