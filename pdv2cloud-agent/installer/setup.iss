; PDV2Cloud Collector Agent — Inno Setup Script
; Suporta Windows 7 SP1 (x64 e x86), Windows 8/8.1, Windows 10, Windows 11.
;
; Variável de build injetada pelo build-installer.ps1:
;   /DArch=x64   → instalador 64-bit
;   /DArch=x86   → instalador 32-bit
;
; Se Arch não for passado, default = x64.

#ifndef Arch
  #define Arch "x64"
#endif

#if Arch == "x86"
  #define ArchLabel      "32-bit"
  #define ArchSuffix     "-x86"
  #define IsWin64        False
#else
  #define ArchLabel      "64-bit"
  #define ArchSuffix     ""
  #define IsWin64        True
#endif

[Setup]
AppName=PDV2Cloud Collector Agent
AppVersion=1.0.0
AppId={{A8B5C6D7-E8F9-4A1B-2C3D-4E5F6A7B8C9D}
DefaultDirName={autopf}\PDV2Cloud
DefaultGroupName=PDV2Cloud
OutputDir=Output
OutputBaseFilename=PDV2Cloud-Setup{#ArchSuffix}
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
UsePreviousAppDir=yes
CreateUninstallRegKey=yes

; ── Compatibilidade de sistema operacional ─────────────────────────────────
; Python 3.11 requer Windows 8.1 / Server 2012 R2 ou superior.
; Para Windows 7 SP1 usamos Python 3.8 (ver bundle-dependencies.ps1).
; Aqui bloqueamos XP/Vista que nunca suportam nenhum Python 3.x moderno.
MinVersion=6.1sp1        ; Windows 7 SP1 mínimo

; ── Arquitetura ────────────────────────────────────────────────────────────
#if IsWin64
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
#else
; Instalador x86 roda em qualquer Windows (32-bit nativo ou WOW64 em 64-bit)
ArchitecturesAllowed=x86 x64
#endif

[Files]
Source: "..\..\dist\python-embed\*"; DestDir: "{app}\python"; Flags: recursesubdirs ignoreversion
Source: "..\..\dist\service\*";      DestDir: "{app}\service"; Flags: recursesubdirs ignoreversion
Source: "..\..\dist\config-ui\*";    DestDir: "{app}\config-ui"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\PDV2Cloud";             Filename: "{app}\config-ui\PDV2Cloud Config.exe"; Comment: "Abrir PDV2Cloud Coletor"
Name: "{group}\Desinstalar PDV2Cloud"; Filename: "{uninstallexe}"
Name: "{autodesktop}\PDV2Cloud";       Filename: "{app}\config-ui\PDV2Cloud Config.exe"; Comment: "Abrir PDV2Cloud Coletor"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na Área de Trabalho"; GroupDescription: "Atalhos:"

[Run]
; Instalar pip no Python embeddable
Filename: "{app}\python\python.exe"; Parameters: "get-pip.py"; WorkingDir: "{app}\python"; StatusMsg: "Instalando pip..."; Flags: runhidden

; Instalar dependências Python
Filename: "{app}\python\python.exe"; Parameters: "-m pip install -r requirements.txt --no-warn-script-location"; WorkingDir: "{app}\service"; StatusMsg: "Instalando dependências Python..."; Flags: runhidden

; Criar estrutura de diretórios em ProgramData
Filename: "{sys}\cmd.exe"; Parameters: "/c if not exist ""{commonappdata}\PDV2Cloud\logs"" mkdir ""{commonappdata}\PDV2Cloud\logs"""; Flags: runhidden

; Registrar e iniciar o serviço Windows
Filename: "{app}\python\python.exe"; Parameters: "-m installer.service_installer install"; WorkingDir: "{app}"; StatusMsg: "Registrando serviço Windows..."; Flags: runhidden

; Abrir UI de configuração após instalação
Filename: "{app}\config-ui\PDV2Cloud Config.exe"; Description: "Abrir Assistente de Configuração"; Flags: postinstall nowait shellexec

[UninstallRun]
Filename: "{sys}\net.exe"; Parameters: "stop PDV2CloudAgent"; Flags: runhidden; RunOnceId: "StopService"
Filename: "{sys}\sc.exe";  Parameters: "delete PDV2CloudAgent"; Flags: runhidden; RunOnceId: "DeleteService"
Filename: "taskkill.exe";  Parameters: "/F /IM ""PDV2Cloud Config.exe"""; Flags: runhidden
Filename: "taskkill.exe";  Parameters: "/F /IM python.exe /FI ""WINDOWTITLE eq PDV2CloudAgent*"""; Flags: runhidden

[UninstallDelete]
Type: filesandordirs; Name: "{commonappdata}\PDV2Cloud"
Type: filesandordirs; Name: "{app}\python\Lib\site-packages"
Type: filesandordirs; Name: "{app}\python\Scripts"
Type: filesandordirs; Name: "{app}\service\__pycache__"
Type: files; Name: "{app}\*.log"
Type: files; Name: "{app}\*.tmp"
Type: files; Name: "{app}\*.pyc"
Type: files; Name: "{app}\*.pyo"
Type: files; Name: "{app}\version.txt"
Type: files; Name: "{tmp}\PDV2Cloud-*.exe"

[Code]

{ ── Verificação de OS no início da instalação ─────────────────────────── }
function IsWindows10OrLater(): Boolean;
var
  Version: TWindowsVersion;
begin
  GetWindowsVersionEx(Version);
  Result := (Version.Major >= 10);
end;

function IsWindows8OrLater(): Boolean;
var
  Version: TWindowsVersion;
begin
  GetWindowsVersionEx(Version);
  Result := (Version.Major > 6) or ((Version.Major = 6) and (Version.Minor >= 2));
end;

function IsWindows7SP1(): Boolean;
var
  Version: TWindowsVersion;
begin
  GetWindowsVersionEx(Version);
  { Major=6 Minor=1 ServicePackMajor>=1 }
  Result := (Version.Major = 6) and (Version.Minor = 1) and (Version.ServicePackMajor >= 1);
end;

procedure ShowOSWarningIfNeeded();
var
  Msg: String;
begin
  { Python 3.11 não suporta Windows 7/8/8.1; avisa o usuário }
  if not IsWindows8OrLater() then
  begin
    Msg := 'Atenção: Windows 7 SP1 detectado.' + #13#10 +
           'O PDV2Cloud requer recursos adicionais do sistema operacional.' + #13#10 + #13#10 +
           'Certifique-se de que as seguintes atualizações estão instaladas:' + #13#10 +
           '  • KB2533623 (Universal CRT)' + #13#10 +
           '  • KB3063858 (Visual C++ 2015 runtime patch)' + #13#10 + #13#10 +
           'A instalação continuará, mas o serviço pode não iniciar sem essas atualizações.';
    MsgBox(Msg, mbInformation, MB_OK);
  end;
end;

{ ── Verificação de arquitetura ─────────────────────────────────────────── }
function Is64BitOS(): Boolean;
begin
  Result := Is64BitInstallMode();
end;

function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
  UninstallString: String;
  UninstallExe: String;
begin
  Result := True;

  { Bloquear instalação x64 em OS 32-bit puro }
#if IsWin64
  if not Is64BitOS() then
  begin
    MsgBox(
      'Este instalador é para Windows 64-bit.' + #13#10 +
      'Seu sistema operacional é 32-bit.' + #13#10 + #13#10 +
      'Por favor, baixe a versão 32-bit do instalador (PDV2Cloud-Setup-x86.exe).',
      mbError, MB_OK
    );
    Result := False;
    Exit;
  end;
#endif

  ShowOSWarningIfNeeded();

  { Fechar processos em execução }
  Exec('taskkill.exe', '/F /IM "PDV2Cloud Config.exe"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM python.exe /FI "WINDOWTITLE eq PDV2CloudAgent*"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('net.exe', 'stop PDV2CloudAgent', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  { Desinstalar versão anterior se existir }
  if RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{#emit SetupSetting("AppId")}_is1', 'UninstallString', UninstallString) then
  begin
    if MsgBox(
      'Uma versão anterior do PDV2Cloud foi detectada.' + #13#10 +
      'Deseja desinstalá-la antes de continuar?' + #13#10 + #13#10 +
      'Recomendado: Sim',
      mbConfirmation, MB_YESNO
    ) = IDYES then
    begin
      UninstallExe := RemoveQuotes(UninstallString);
      if FileExists(UninstallExe) then
      begin
        Exec(UninstallExe, '/VERYSILENT /NORESTART /SUPPRESSMSGBOXES', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Sleep(2000);
        DelTree(ExpandConstant('{autopf}\PDV2Cloud'), True, True, True);
        DelTree(ExpandConstant('{commonappdata}\PDV2Cloud'), True, True, True);
        Exec('sc.exe', 'delete PDV2CloudAgent', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      end;
    end else
    begin
      MsgBox(
        'A instalação continuará, mas pode haver conflitos com a versão anterior.' + #13#10 +
        'Recomendamos desinstalar a versão anterior manualmente antes de continuar.',
        mbInformation, MB_OK
      );
    end;
  end;

  { Limpar serviço órfão }
  Exec('sc.exe', 'query PDV2CloudAgent', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if ResultCode = 0 then
  begin
    Exec('net.exe', 'stop PDV2CloudAgent', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('sc.exe', 'delete PDV2CloudAgent', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

{ ── Gravar version.txt e arch.txt pós-instalação ──────────────────────── }
procedure CurStepChanged(CurStep: TSetupStep);
var
  VersionFile: String;
  ArchFile: String;
begin
  if CurStep = ssPostInstall then
  begin
    VersionFile := ExpandConstant('{app}\version.txt');
    SaveStringToFile(VersionFile, '{#SetupSetting("AppVersion")}', False);

    { Grava a arquitetura para que o updater.py saiba qual installer baixar }
    ArchFile := ExpandConstant('{app}\arch.txt');
    SaveStringToFile(ArchFile, '{#Arch}', False);
  end;
end;
