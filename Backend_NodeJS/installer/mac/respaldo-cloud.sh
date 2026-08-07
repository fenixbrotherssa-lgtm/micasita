#!/bin/bash
# =========================================================
# CONFIGURACIÓN DEL CLIENTE
# =========================================================
# Las credenciales (contraseña SQL + OAuth de Google Drive) NUNCA van
# hardcodeadas ni a git: viven en un archivo aparte que se crea a mano en
# cada Mac cliente, igual que el .env del backend. Ver
# respaldo-cloud.conf.example en esta misma carpeta para el formato.
CONFIG_FILE="${AMETRA_BACKUP_CONFIG:-/Library/AmetraOS/respaldo-cloud.conf}"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "[Respaldo] ERROR: no se encontró $CONFIG_FILE con las credenciales."
    echo "[Respaldo] Copiá respaldo-cloud.conf.example a esa ruta y completá los valores."
    exit 1
fi
# shellcheck disable=SC1090
source "$CONFIG_FILE"

# =========================================================
# CONFIGURACIÓN LOCAL
# =========================================================
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

BACKUP_DIR="/Library/AmetraOS/backups"
LABEL="com.casrodsoft.ametraos.backup"
SCRIPT_DEST="/Library/AmetraOS/backup/respaldo-cloud.sh"
PLIST_PATH="/Library/LaunchDaemons/${LABEL}.plist"
LOG_DIR="/Library/Logs/AmetraOS"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.bak"
CONTAINER_BACKUP="/var/opt/mssql/backups/${DB_NAME}_${TIMESTAMP}.bak"

# =========================================================
# TAREA PROGRAMADA (solo la primera vez)
# =========================================================
if [ ! -f "$PLIST_PATH" ]; then
    echo "[Respaldo] Registrando tarea programada a las ${HORA_RESPALDO}:00..."
    mkdir -p "$(dirname "$SCRIPT_DEST")"
    cp "$0" "$SCRIPT_DEST"
    chmod +x "$SCRIPT_DEST"

    cat > "$PLIST_PATH" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${SCRIPT_DEST}</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>${HORA_RESPALDO}</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/backup.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/backup-error.log</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
PLISTEOF

    chown root:wheel "$PLIST_PATH"
    chmod 644 "$PLIST_PATH"
    launchctl load "$PLIST_PATH"
    echo "[Respaldo] Tarea programada correctamente para las ${HORA_RESPALDO}:00"
fi

# =========================================================
# BACKUP SQL (via Docker/OrbStack)
# =========================================================
echo "[Respaldo] Generando backup SQL..."

CONTAINER=$(docker ps --format '{{.Names}}' | grep -iE 'sql|mssql|ametra-db' | head -1)
if [ -z "$CONTAINER" ]; then
    echo "[Respaldo] ERROR: No se encontró contenedor SQL Server en ejecución"
    exit 1
fi

docker exec "$CONTAINER" mkdir -p /var/opt/mssql/backups

if docker exec "$CONTAINER" test -f /opt/mssql-tools18/bin/sqlcmd 2>/dev/null; then
    SQLCMD="/opt/mssql-tools18/bin/sqlcmd"
else
    SQLCMD="/opt/mssql-tools/bin/sqlcmd"
fi

docker exec "$CONTAINER" $SQLCMD \
    -S localhost -U "$USER_SQL" -P "$PASS_SQL" -C \
    -Q "BACKUP DATABASE [$DB_NAME] TO DISK = '$CONTAINER_BACKUP' WITH FORMAT, INIT, STATS = 10"

docker cp "$CONTAINER:$CONTAINER_BACKUP" "$BACKUP_FILE"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "[Respaldo] ERROR: No se generó el archivo de backup."
    exit 1
fi
echo "[Respaldo] Backup generado: $BACKUP_FILE"

# =========================================================
# TOKEN GOOGLE
# =========================================================
get_google_token() {
    python3 - << PYEOF
import urllib.request, urllib.parse, json, sys
data = urllib.parse.urlencode({
    'client_id':     '${CLIENT_ID}',
    'client_secret': '${CLIENT_SECRET}',
    'refresh_token': '${REFRESH_TOKEN}',
    'grant_type':    'refresh_token'
}).encode()
try:
    resp = json.loads(urllib.request.urlopen(
        urllib.request.Request('https://oauth2.googleapis.com/token', data=data)
    ).read())
    print(resp['access_token'])
except Exception as e:
    print('', end='')
    sys.exit(1)
PYEOF
}

# =========================================================
# SUBIR A GOOGLE DRIVE
# =========================================================
upload_to_drive() {
    local file_path="$1"
    local folder_id="$2"
    local token="$3"
    local file_name
    file_name=$(basename "$file_path")

    curl -s -X POST \
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart" \
        -H "Authorization: Bearer $token" \
        -F "metadata={\"name\":\"$file_name\",\"parents\":[\"$folder_id\"]};type=application/json;charset=UTF-8" \
        -F "file=@${file_path};type=application/octet-stream"
}

# =========================================================
# EJECUCIÓN
# =========================================================
echo "[Respaldo] Obteniendo token Google..."
TOKEN=$(get_google_token)
if [ -z "$TOKEN" ]; then
    echo "[Respaldo] ERROR: No se pudo obtener token de Google"
    exit 1
fi

echo "[Respaldo] Subiendo a Google Drive..."
RESULT=$(upload_to_drive "$BACKUP_FILE" "$FOLDER_ID" "$TOKEN")

FILE_NAME=$(python3 -c "import sys,json; d=json.loads('''$RESULT'''); print(d.get('name','-'))" 2>/dev/null || echo "-")
FILE_ID=$(python3   -c "import sys,json; d=json.loads('''$RESULT'''); print(d.get('id','-'))"   2>/dev/null || echo "-")

echo "[Respaldo] RESPALDO SUBIDO CORRECTAMENTE"
echo "[Respaldo] ARCHIVO:  $FILE_NAME"
echo "[Respaldo] ID DRIVE: $FILE_ID"

# =========================================================
# LIMPIEZA LOCAL — borra backups de más de 3 días
# =========================================================
find "$BACKUP_DIR" -name "*.bak" -mtime +3 -delete
echo "[Respaldo] Limpieza de backups antiguos completada."
