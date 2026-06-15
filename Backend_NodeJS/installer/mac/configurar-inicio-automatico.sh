#!/bin/bash
# Verificación de inicio automático — AmetraOS con OrbStack
# OrbStack ya arranca como daemon del sistema, no requiere configuración adicional.

echo ""
echo "══════════════════════════════════════════════"
echo "  Verificando inicio automático - AmetraOS"
echo "══════════════════════════════════════════════"
echo ""

# 1. Verificar que OrbStack está corriendo
echo "• Verificando OrbStack..."
if docker info >/dev/null 2>&1; then
    echo "  ✓ OrbStack activo"
else
    echo "  ✗ OrbStack no responde. Abrir OrbStack desde Aplicaciones y esperar que diga Running."
    exit 1
fi

# 2. Verificar que el contenedor existe y tiene política de reinicio correcta
echo "• Verificando SQL Server..."
RESTART=$(docker inspect ametra-db --format='{{.HostConfig.RestartPolicy.Name}}' 2>/dev/null)
if [ "$RESTART" = "always" ]; then
    echo "  ✓ SQL Server con reinicio automático (always)"
else
    echo "  Ajustando política de reinicio..."
    docker update --restart always ametra-db
    echo "  ✓ Listo"
fi

# 3. Verificar que el contenedor está corriendo
STATUS=$(docker inspect ametra-db --format='{{.State.Running}}' 2>/dev/null)
if [ "$STATUS" = "true" ]; then
    echo "  ✓ SQL Server corriendo"
else
    echo "  Iniciando SQL Server..."
    docker start ametra-db
    echo "  ✓ Iniciado"
fi

# 4. Verificar el servicio del backend
echo "• Verificando servicio del backend..."
if sudo launchctl list | grep -q "casrodsoft"; then
    echo "  ✓ Backend registrado como servicio del sistema"
else
    echo "  ✗ El servicio no está registrado. Reinstalar el .pkg"
    exit 1
fi

echo ""
echo "══════════════════════════════════════════════"
echo "  Secuencia de arranque al encender el Mac:"
echo ""
echo "  1. Mac enciende"
echo "  2. OrbStack arranca como servicio del sistema"
echo "  3. SQL Server arranca dentro de OrbStack"
echo "  4. Backend AmetraOS arranca como servicio"
echo "  5. En ~45 segundos todo está listo para usar"
echo ""
echo "  El cliente NO necesita hacer nada técnico."
echo "══════════════════════════════════════════════"
echo ""
