[Setup]
; --- INFORMACIÓN BÁSICA ---
AppName=Ametra OS
AppVersion=4.5
DefaultDirName={autopf}\MedicinaEcuador
DefaultGroupName=MedicinaEcuador

; --- RUTAS DE SALIDA ---
OutputDir=C:\MedicinaEcuador_Project\ametra-os-client
OutputBaseFilename=Instalador_ametra_os_V-4.5

; --- RECURSOS ---
SetupIconFile=C:\MedicinaEcuador_Project\medicSystemcore\assets\icon.ico
WizardImageFile=C:\MedicinaEcuador_Project\medicSystemcore\assets\wizard_image_client.bmp
WizardSmallImageFile=C:\MedicinaEcuador_Project\medicSystemcore\assets\wizard_small_client.bmp

; --- COMPRESIÓN Y PRIVILEGIOS ---
Compression=lzma2/ultra64
SolidCompression=yes
; PRIVILEGIOS DE ADMIN: Necesarios para escribir en Program Files y evitar bloqueos de red
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
; --- 1. ARCHIVOS DEL PROGRAMA (ELECTRON BUILDER) ---
; EXCLUSIÓN DE CONFIGURACIÓN BASE PARA EVITAR CRUCES
Source: "C:\MedicinaEcuador_Project\medicSystemcore\dist\win-unpacked\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs; Excludes: "resources\config.json,resources\app\config.json"; Permissions: users-full

; --- 2. CONFIGURACIÓN (FUENTE ÚNICA) ---
; SOBRESCRITURA FORZADA DEL CONFIG PARA LA CLÍNICA DESTINO
Source: "C:\MedicinaEcuador_Project\medicSystemcore\config.json"; DestDir: "{app}\resources"; Flags: ignoreversion; Permissions: users-full

[Dirs]
; Permisos totales para que Electron maneje sus recursos sin bloqueos de UAC
Name: "{app}\resources"; Permissions: users-full

[Icons]
; ACCESOS DIRECTOS CON DIRECTORIO DE TRABAJO DEFINIDO (Evita fallos de carga de DLL)
Name: "{autodesktop}\MedicinaEcuador Pro"; Filename: "{app}\ametra-os.exe"; WorkingDir: "{app}"
Name: "{group}\MedicinaEcuador Pro"; Filename: "{app}\ametra-os.exe"; WorkingDir: "{app}"

[Run]
; --- LANZAMIENTO SEGURO ---
; Se agrega 'shellexec' para que Windows gestione la elevación de privilegios correctamente al terminar
Filename: "{app}\ametra-os.exe"; Description: "{cm:LaunchProgram,MedicinaEcuador Pro}"; Flags: nowait postinstall skipifsilent shellexec

[InstallDelete]
; LIMPIEZA QUIRÚRGICA: Evita pantallas blancas eliminando caché y librerías viejas
Type: filesandordirs; Name: "{app}\locales"
Type: filesandordirs; Name: "{app}\swiftshader"
Type: files; Name: "{app}\*.dll"

[UninstallDelete]
; Borramos archivos de sistema
Type: filesandordirs; Name: "{app}\locales"
Type: filesandordirs; Name: "{app}\swiftshader"
; Borra tanto la carpeta 'app' como el archivo 'app.asar' si existen para no dejar basura
Type: filesandordirs; Name: "{app}\resources\app"
Type: files; Name: "{app}\resources\app.asar"

; --- NUEVO: PURGA TOTAL DE CACHÉ DE CHROMIUM Y ESTADO DE RED ---
; Destruye LocalStorage, IndexedDB y tokens para evitar sesiones fantasma en reinstalaciones
Type: filesandordirs; Name: "{userappdata}\ametra-os"