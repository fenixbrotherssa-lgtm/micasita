[Setup]
; --- INFORMACI�N B�SICA ---
AppName=Ametra OS
AppVersion=4.5
DefaultDirName={autopf}\MedicinaEcuador
DefaultGroupName=MedicinaEcuador

; --- RUTAS DE SALIDA ---
OutputDir=C:\ametrawindows\medicSystemcore
OutputBaseFilename=Instalador_ametra_os_V-4.5

; --- RECURSOS ---
SetupIconFile=C:\ametrawindows\medicSystemcore\assets\icon.ico
WizardImageFile=C:\ametrawindows\medicSystemcore\assets\wizard_image_client.bmp
WizardSmallImageFile=C:\ametrawindows\medicSystemcore\assets\wizard_small_client.bmp

; --- COMPRESI�N Y PRIVILEGIOS ---
Compression=lzma2/ultra64
SolidCompression=yes
; PRIVILEGIOS DE ADMIN: Necesarios para escribir en Program Files y evitar bloqueos de red
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
; --- 1. ARCHIVOS DEL PROGRAMA (ELECTRON BUILDER, YA OFUSCADO POR build.js) ---
; EXCLUSI�N DE CONFIGURACI�N BASE PARA EVITAR CRUCES
Source: "C:\ametrawindows\medicSystemcore\MedicSystem_Ready\dist\win-unpacked\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs; Excludes: "resources\config.json,resources\app\config.json"; Permissions: users-full

; --- 2. CONFIGURACI�N (FUENTE �NICA) ---
; "onlyifdoesntexist": solo se coloca el config.json de f�brica en una instalaci�n NUEVA
; (cuando el archivo todav�a no existe en el destino). Antes ten�a "ignoreversion", que lo
; pisaba en CADA instalaci�n/actualizaci�n con el config.json del repo de desarrollo,
; borrando el URL_PRODUCCION/PUBLIC_DOMAIN real que esa cl�nica hab�a configurado.
Source: "C:\ametrawindows\medicSystemcore\config.json"; DestDir: "{app}\resources"; Flags: onlyifdoesntexist; Permissions: users-full

[Dirs]
; Permisos totales para que Electron maneje sus recursos sin bloqueos de UAC
Name: "{app}\resources"; Permissions: users-full

[Icons]
; ACCESOS DIRECTOS CON DIRECTORIO DE TRABAJO DEFINIDO (Evita fallos de carga de DLL)
Name: "{autodesktop}\MedicinaEcuador Pro"; Filename: "{app}\ametra-os.exe"; WorkingDir: "{app}"
Name: "{group}\MedicinaEcuador Pro"; Filename: "{app}\ametra-os.exe"; WorkingDir: "{app}"

[Run]
; --- LANZAMIENTO SEGURO ---
; Se agrega 'shellexec' para que Windows gestione la elevaci�n de privilegios correctamente al terminar
Filename: "{app}\ametra-os.exe"; Description: "{cm:LaunchProgram,MedicinaEcuador Pro}"; Flags: nowait postinstall skipifsilent shellexec

[InstallDelete]
; LIMPIEZA QUIR�RGICA: Evita pantallas blancas eliminando cach� y librer�as viejas
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

; --- NUEVO: PURGA TOTAL DE CACH� DE CHROMIUM Y ESTADO DE RED ---
; Destruye LocalStorage, IndexedDB y tokens para evitar sesiones fantasma en reinstalaciones
Type: filesandordirs; Name: "{userappdata}\ametra-os"