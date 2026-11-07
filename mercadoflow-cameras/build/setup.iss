; Instalador do MercadoFlow Câmeras. Instala para o usuário, sem pedir administrador.
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{7C0B0E42-5E1B-4C5E-9E4B-3D2F9A6C1F10}
AppName=MercadoFlow Câmeras
AppVersion={#AppVersion}
AppPublisher=MercadoFlow
DefaultDirName={localappdata}\Programs\MercadoFlowCameras
DefaultGroupName=MercadoFlow
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=MercadoFlowCameras-Setup
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\MercadoFlowCameras.exe
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "..\dist\MercadoFlowCameras\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\MercadoFlow Câmeras"; Filename: "{app}\MercadoFlowCameras.exe"
Name: "{userdesktop}\MercadoFlow Câmeras"; Filename: "{app}\MercadoFlowCameras.exe"
; Volta sozinho quando o computador liga: o mapa de calor não pode depender de alguém lembrar.
Name: "{userstartup}\MercadoFlow Câmeras"; Filename: "{app}\MercadoFlowCameras.exe"; Parameters: "--minimized"

[Run]
Filename: "{app}\MercadoFlowCameras.exe"; Description: "Abrir o MercadoFlow Câmeras"; Flags: nowait postinstall skipifsilent
