[Setup]
AppName=PDV2Cloud Collector Agent
AppVersion=1.0.0
DefaultDirName={pf}\PDV2Cloud
DefaultGroupName=PDV2Cloud
OutputDir=Output
OutputBaseFilename=PDV2Cloud-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
UninstallDisplayIcon={app}\config-ui\PDV2Cloud Config.exe

[Files]
Source: "..\..\dist\python-embed\*"; DestDir: "{app}\python"; Flags: recursesubdirs ignoreversion
Source: "..\..\dist\service\*"; DestDir: "{app}\service"; Flags: recursesubdirs ignoreversion
Source: "..\..\dist\config-ui\*"; DestDir: "{app}\config-ui"; Flags: recursesubdirs ignoreversion

[Run]
; Install pip in embedded Python
Filename: "{app}\python\python.exe"; Parameters: "get-pip.py"; WorkingDir: "{app}\python"; StatusMsg: "Instalando pip..."; Flags: runhidden
; Install Python dependencies
Filename: "{app}\python\python.exe"; Parameters: "-m pip install -r requirements.txt"; WorkingDir: "{app}\service"; StatusMsg: "Instalando dependências Python..."; Flags: runhidden
; Create ProgramData directory structure
Filename: "{sys}\cmd.exe"; Parameters: "/c if not exist ""C:\ProgramData\PDV2Cloud\logs"" mkdir ""C:\ProgramData\PDV2Cloud\logs"""; Flags: runhidden
; Launch Config UI with admin rights
Filename: "{app}\config-ui\PDV2Cloud Config.exe"; Description: "Abrir Assistente de Configuração"; Flags: postinstall nowait runasoriginaluser

[UninstallRun]
; Stop and remove Windows service
Filename: "{sys}\net.exe"; Parameters: "stop PDV2CloudAgent"; Flags: runhidden; RunOnceId: "StopService"
Filename: "{sys}\sc.exe"; Parameters: "delete PDV2CloudAgent"; Flags: runhidden; RunOnceId: "DeleteService"

[UninstallDelete]
; Clean up ProgramData (config, logs, status)
Type: filesandordirs; Name: "C:\ProgramData\PDV2Cloud"
; Clean up any temp files
Type: files; Name: "{app}\*.log"
Type: files; Name: "{app}\*.tmp"
