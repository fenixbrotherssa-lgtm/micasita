[Setup]
AppName=ametra-os V-4.5 Pro - Servidor
AppVersion=4.5
AppPublisher=MedicinaEcuador
DefaultDirName=C:\MedicinaEcuador_Server_Prod
DefaultGroupName=MedicinaEcuador Pro
OutputDir=C:\MedicinaEcuador_Project\ametra-os-client
OutputBaseFilename=server_ametra-os_PRO_V4.5
SetupIconFile=C:\MedicinaEcuador_Project\Backend_DIST\assets\favicon.ico
WizardImageFile=C:\MedicinaEcuador_Project\Backend_DIST\assets\wizard_image.bmp
WizardSmallImageFile=C:\MedicinaEcuador_Project\Backend_DIST\assets\wizard_small_image.bmp

; --- CONFIGURACIÓN TÉCNICA ---
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no

[Files]
Source: "C:\MedicinaEcuador_Project\Backend_DIST\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "C:\MedicinaEcuador_Project\Backend_NodeJS\BASE_MAESTRA_NACIONAL.csv"; DestDir: "{app}"; Flags: ignoreversion


[Dirs]
; Permisos totales para asegurar que el bot pueda escribir sesiones y logs
Name: "{app}"; Permissions: users-full
Name: "{app}\sessions"; Permissions: users-full
Name: "{app}\assets"; Permissions: users-full
Name: "{app}\uploads"; Permissions: users-full

[Run]
; --- PASO 0: LIMPIEZA ---
Filename: "sc.exe"; Parameters: "stop MedicinaEcuador_API"; Flags: runhidden
Filename: "{cmd}"; Parameters: "/c timeout /t 2 /nobreak"; Flags: runhidden
Filename: "sc.exe"; Parameters: "delete MedicinaEcuador_API"; Flags: runhidden

; --- PASO 1: INSTALACIÓN DE NODE.JS ---
Filename: "msiexec.exe"; Parameters: "/i ""{app}\assets\node-v24.14.0-x64.msi"" /qn /norestart"; StatusMsg: "Configurando motor Node.js..."; Flags: runhidden waituntilterminated

; --- PASO 2: CONFIGURACIÓN CON NSSM ---
Filename: "{app}\assets\nssm.exe"; Parameters: "install MedicinaEcuador_API ""C:\Program Files\nodejs\node.exe"" ""{app}\server.js"""; Flags: runhidden

; Directorio de trabajo (Vital para encontrar el .env y la carpeta sessions)
Filename: "{app}\assets\nssm.exe"; Parameters: "set MedicinaEcuador_API AppDirectory ""{app}"""; Flags: runhidden

; ESTA LÍNEA ES LA QUE ACTIVA EL BOT EN EL SERVICIO (Carga el entorno)
Filename: "{app}\assets\nssm.exe"; Parameters: "set MedicinaEcuador_API AppEnvironmentExtra NODE_ENV=production"; Flags: runhidden

; Reinicio automático
Filename: "{app}\assets\nssm.exe"; Parameters: "set MedicinaEcuador_API AppExit Default Restart"; Flags: runhidden
Filename: "{app}\assets\nssm.exe"; Parameters: "set MedicinaEcuador_API AppRestartDelay 5000"; Flags: runhidden

; Logs
Filename: "{app}\assets\nssm.exe"; Parameters: "set MedicinaEcuador_API AppStdout ""{app}\assets\service_out.log"""; Flags: runhidden
Filename: "{app}\assets\nssm.exe"; Parameters: "set MedicinaEcuador_API AppStderr ""{app}\assets\service_err.log"""; Flags: runhidden

; --- PASO 3: INICIO DEL SERVICIO ---
Filename: "{app}\assets\nssm.exe"; Parameters: "start MedicinaEcuador_API"; StatusMsg: "Iniciando MedicinaEcuador Pro..."; Flags: runhidden

[UninstallRun]
Filename: "{app}\assets\nssm.exe"; Parameters: "stop MedicinaEcuador_API"; Flags: runhidden; RunOnceId: "StopMedicinaService"
Filename: "{app}\assets\nssm.exe"; Parameters: "remove MedicinaEcuador_API confirm"; Flags: runhidden; RunOnceId: "RemoveMedicinaService"

[UninstallDelete]
; Limpieza quirúrgica: No borramos la carpeta 'sessions' para que no pierdan el QR al actualizar
Type: files; Name: "{app}\server.js"
Type: files; Name: "{app}\test-doctor.js"
Type: files; Name: "{app}\.env"
Type: files; Name: "{app}\package.json"
Type: filesandordirs; Name: "{app}\controllers"
Type: filesandordirs; Name: "{app}\routes"
Type: filesandordirs; Name: "{app}\middlewares"
Type: filesandordirs; Name: "{app}\config"
Type: filesandordirs; Name: "{app}\services"
Type: filesandordirs; Name: "{app}\node_modules"
Type: filesandordirs; Name: "{app}\assets"
Type: filesandordirs; Name: "{app}\.cache"
Type: files; Name: "{app}\BASE_MAESTRA_NACIONAL.csv"