[Setup]
AppName=Agente Mercado Flow
AppVersion=1.0.0
DefaultDirName={pf}\PDV2Cloud
DefaultGroupName=Agente Mercado Flow
OutputDir=Output
OutputBaseFilename=AgenteMercadoFlow-Setup-Silent
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
; Silent installation options
DisableWelcomePage=yes
DisableReadyPage=yes
DisableDirPage=yes
DisableProgramGroupPage=yes
AlwaysRestart=no

[Files]
Source: "..\..\dist\python-embed\*"; DestDir: "{app}\python"; Flags: recursesubdirs
Source: "..\..\dist\service\*"; DestDir: "{app}\service"; Flags: recursesubdirs
Source: "..\..\dist\config-ui\*"; DestDir: "{app}\config-ui"; Flags: recursesubdirs
Source: "silent-config.json"; DestDir: "{commonappdata}\PDV2Cloud"; DestName: "config.json"; Flags: onlyifdoesntexist

[Registry]
; Optional: Auto-start config UI after reboot (enterprise mode)
; Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "AgenteMercadoFlow"; ValueData: """{app}\config-ui\Agente Mercado Flow.exe"""; Flags: uninsdeletevalue

[Run]
; Criar estrutura de diretórios em ProgramData
Filename: "{sys}\cmd.exe"; Parameters: "/c if not exist ""{commonappdata}\PDV2Cloud\logs"" mkdir ""{commonappdata}\PDV2Cloud\logs"""; Flags: runhidden waituntilterminated
; AGT-02: a pasta guarda a chave do agente (config.json) e CPFs da fila
; (queue.db). Só SYSTEM (o serviço) e Administradores (a UI roda elevada,
; requireAdministrator) acessam. Sem herança de Usuários. Roda na instalação
; e em toda atualização (/VERYSILENT também executa esta seção).
; 1) dono = Administradores, para um usuário comum que tenha criado arquivo
;    aqui não manter o acesso implícito de dono;
; 2) a pasta perde a herança e fica só com SYSTEM e Administradores;
; 3) o que já existe dentro volta a herdar da pasta (descarta ACL antiga).
; SIDs em vez de nomes: funcionam em Windows em qualquer idioma.
Filename: "{sys}\icacls.exe"; Parameters: """{commonappdata}\PDV2Cloud"" /setowner *S-1-5-32-544 /T /C /Q"; Flags: runhidden waituntilterminated
Filename: "{sys}\icacls.exe"; Parameters: """{commonappdata}\PDV2Cloud"" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F /C /Q"; Flags: runhidden waituntilterminated
Filename: "{sys}\icacls.exe"; Parameters: """{commonappdata}\PDV2Cloud\*"" /reset /T /C /Q"; Flags: runhidden waituntilterminated
; Install dependencies silently
Filename: "{app}\python\python.exe"; Parameters: "get-pip.py"; WorkingDir: "{app}\python"; Flags: runhidden
Filename: "{app}\python\python.exe"; Parameters: "-m pip install -r requirements.txt"; WorkingDir: "{app}\service"; Flags: runhidden
; Install Windows service
Filename: "{app}\python\python.exe"; Parameters: "installer\service_installer.py install"; WorkingDir: "{app}\service"; Flags: runhidden
; Start service automatically
Filename: "{app}\python\python.exe"; Parameters: "installer\service_installer.py start"; WorkingDir: "{app}\service"; Flags: runhidden
; Do NOT open config UI in silent mode

[UninstallRun]
; Stop and remove service on uninstall
Filename: "{app}\python\python.exe"; Parameters: "installer\service_installer.py stop"; WorkingDir: "{app}\service"; Flags: runhidden
Filename: "{app}\python\python.exe"; Parameters: "installer\service_installer.py remove"; WorkingDir: "{app}\service"; Flags: runhidden

[Code]
// Support for command-line parameters
var
  ApiKeyParam: String;
  WatchPathsParam: String;
  ApiUrlParam: String;

procedure InitializeWizard();
begin
  // Extract command-line parameters
  ApiKeyParam := ExpandConstant('{param:APIKEY}');
  WatchPathsParam := ExpandConstant('{param:WATCHPATHS}');
  ApiUrlParam := ExpandConstant('{param:APIURL|https://mercadoflow.com}');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigPath: String;
  ConfigContent: String;
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    // If API key provided via command line, configure automatically
    if ApiKeyParam <> '' then
    begin
      ConfigPath := ExpandConstant('{commonappdata}\PDV2Cloud\config.json');

      // Build configuration JSON
      ConfigContent := '{' + #13#10;
      ConfigContent := ConfigContent + '  "api_url": "' + ApiUrlParam + '",' + #13#10;
      ConfigContent := ConfigContent + '  "api_key": "' + ApiKeyParam + '",' + #13#10;

      if WatchPathsParam <> '' then
      begin
        ConfigContent := ConfigContent + '  "watch_paths": [';
        // Split by semicolon and format as JSON array
        ConfigContent := ConfigContent + '"' + StringChangeEx(WatchPathsParam, ';', '", "', True) + '"';
        ConfigContent := ConfigContent + '],' + #13#10;
      end else
      begin
        ConfigContent := ConfigContent + '  "watch_paths": [],' + #13#10;
      end;

      ConfigContent := ConfigContent + '  "poll_interval_seconds": 10,' + #13#10;
      ConfigContent := ConfigContent + '  "retry_interval_minutes": 5,' + #13#10;
      ConfigContent := ConfigContent + '  "healthcheck_enabled": true,' + #13#10;
      ConfigContent := ConfigContent + '  "healthcheck_port": 8765' + #13#10;
      ConfigContent := ConfigContent + '}';

      // Save configuration
      SaveStringToFile(ConfigPath, ConfigContent, False);

      // Restart service to apply configuration
      Exec(ExpandConstant('{app}\python\python.exe'),
           'installer\service_installer.py restart',
           ExpandConstant('{app}\service'),
           SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
  end;
end;

[Icons]
Name: "{group}\Agente Mercado Flow"; Filename: "{app}\config-ui\Agente Mercado Flow.exe"
Name: "{group}\Desinstalar Agente Mercado Flow"; Filename: "{uninstallexe}"

[Messages]
WelcomeLabel2=Este instalador configurará o Agente Mercado Flow em seu computador em modo silencioso.
