[Setup]
AppName=PDV2Cloud Collector Agent
AppVersion=1.0.0
AppId={{A8B5C6D7-E8F9-4A1B-2C3D-4E5F6A7B8C9D}
DefaultDirName={autopf}\PDV2Cloud
DefaultGroupName=PDV2Cloud
OutputDir=Output
OutputBaseFilename=PDV2Cloud-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
UninstallDisplayIcon={app}\config-ui\PDV2Cloud Config.exe
CloseApplications=yes
CloseApplicationsFilter=*.exe,*.dll
RestartApplications=no
SetupLogging=yes
AppPublisher=PDV2Cloud
AllowNoIcons=no
; Permitir múltiplas instâncias do instalador
UsePreviousAppDir=yes
; Criar entrada no Painel de Controle > Programas
CreateUninstallRegKey=yes

[Files]
Source: "..\..\dist\python-embed\*"; DestDir: "{app}\python"; Flags: recursesubdirs ignoreversion
Source: "..\..\dist\service\*"; DestDir: "{app}\service"; Flags: recursesubdirs ignoreversion
Source: "..\..\dist\config-ui\*"; DestDir: "{app}\config-ui"; Flags: recursesubdirs ignoreversion

[Icons]
; Atalho no Menu Iniciar (aparece na busca do Windows)
Name: "{group}\PDV2Cloud"; Filename: "{app}\config-ui\PDV2Cloud Config.exe"; Comment: "Abrir PDV2Cloud Coletor"
Name: "{group}\Desinstalar PDV2Cloud"; Filename: "{uninstallexe}"
; Atalho na Área de Trabalho
Name: "{autodesktop}\PDV2Cloud"; Filename: "{app}\config-ui\PDV2Cloud Config.exe"; Comment: "Abrir PDV2Cloud Coletor"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na Área de Trabalho"; GroupDescription: "Atalhos:"

[Run]
; Install pip in embedded Python
Filename: "{app}\python\python.exe"; Parameters: "get-pip.py"; WorkingDir: "{app}\python"; StatusMsg: "Instalando pip..."; Flags: runhidden
; Install Python dependencies
Filename: "{app}\python\python.exe"; Parameters: "-m pip install -r requirements.txt"; WorkingDir: "{app}\service"; StatusMsg: "Instalando dependências Python..."; Flags: runhidden
; Create ProgramData directory structure
Filename: "{sys}\cmd.exe"; Parameters: "/c if not exist ""C:\ProgramData\PDV2Cloud\logs"" mkdir ""C:\ProgramData\PDV2Cloud\logs"""; Flags: runhidden
; Launch Config UI with admin rights
Filename: "{app}\config-ui\PDV2Cloud Config.exe"; Description: "Abrir Assistente de Configuração"; Flags: postinstall nowait shellexec

[UninstallRun]
; Stop and remove Windows service
Filename: "{sys}\net.exe"; Parameters: "stop PDV2CloudAgent"; Flags: runhidden; RunOnceId: "StopService"
Filename: "{sys}\sc.exe"; Parameters: "delete PDV2CloudAgent"; Flags: runhidden; RunOnceId: "DeleteService"
; Force kill any remaining processes
Filename: "taskkill.exe"; Parameters: "/F /IM ""PDV2Cloud Config.exe"""; Flags: runhidden
Filename: "taskkill.exe"; Parameters: "/F /IM python.exe /FI ""WINDOWTITLE eq PDV2CloudAgent*"""; Flags: runhidden

[UninstallDelete]
; Clean up ProgramData (config, logs, status, queues)
Type: filesandordirs; Name: "C:\ProgramData\PDV2Cloud"
; Clean up application directory completely
Type: filesandordirs; Name: "{app}\python\Lib\site-packages"
Type: filesandordirs; Name: "{app}\python\Scripts"
Type: filesandordirs; Name: "{app}\service\__pycache__"
Type: files; Name: "{app}\*.log"
Type: files; Name: "{app}\*.tmp"
Type: files; Name: "{app}\*.pyc"
Type: files; Name: "{app}\*.pyo"
Type: files; Name: "{app}\version.txt"
; Clean up user temp files
Type: files; Name: "{tmp}\PDV2Cloud-*.exe"
Type: files; Name: "{tmp}\pdv2cloud-*.txt"

[Code]
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
  UninstallString: String;
  UninstallExe: String;
begin
  Result := True;

  // Force close PDV2Cloud Config.exe if running
  Exec('taskkill.exe', '/F /IM "PDV2Cloud Config.exe"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // Force kill any python processes related to PDV2Cloud
  Exec('taskkill.exe', '/F /IM python.exe /FI "WINDOWTITLE eq PDV2CloudAgent*"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // Stop the service if it's running
  Exec('net.exe', 'stop PDV2CloudAgent', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // Check if there's a previous installation
  if RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{#emit SetupSetting("AppId")}_is1', 'UninstallString', UninstallString) then
  begin
    // Previous installation found - ask user if they want to uninstall
    if MsgBox('Uma versão anterior do PDV2Cloud foi detectada. Deseja desinstalá-la antes de continuar?' + #13#10 + #13#10 + 'Recomendado: Sim', mbConfirmation, MB_YESNO) = IDYES then
    begin
      // Extract the uninstaller path
      UninstallExe := RemoveQuotes(UninstallString);
      if FileExists(UninstallExe) then
      begin
        // Run uninstaller silently
        if Exec(UninstallExe, '/VERYSILENT /NORESTART /SUPPRESSMSGBOXES', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
        begin
          // Wait a moment for uninstaller to complete
          Sleep(2000);

          // Force delete any remaining files
          DelTree(ExpandConstant('{autopf}\PDV2Cloud'), True, True, True);
          DelTree('C:\ProgramData\PDV2Cloud', True, True, True);

          // Delete the service if it still exists
          Exec('sc.exe', 'delete PDV2CloudAgent', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        end;
      end;
    end
    else
    begin
      // User chose not to uninstall - warn about potential conflicts
      MsgBox('ATENÇÃO: A instalação continuará, mas pode haver conflitos com a versão anterior.' + #13#10 + #13#10 + 'Recomendamos desinstalar a versão anterior manualmente antes de continuar.', mbInformation, MB_OK);
    end;
  end;

  // Clean up any orphaned service
  Exec('sc.exe', 'query PDV2CloudAgent', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if ResultCode = 0 then
  begin
    // Service exists but no uninstaller - clean it up
    Exec('net.exe', 'stop PDV2CloudAgent', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('sc.exe', 'delete PDV2CloudAgent', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  VersionFile: String;
begin
  if CurStep = ssPostInstall then
  begin
    // Create version.txt file with current version
    VersionFile := ExpandConstant('{app}\version.txt');
    SaveStringToFile(VersionFile, '{#SetupSetting("AppVersion")}', False);
  end;
end;
