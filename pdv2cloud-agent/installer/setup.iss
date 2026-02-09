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

[Files]
Source: "..\..\dist\python-embed\*"; DestDir: "{app}\python"; Flags: recursesubdirs
Source: "..\..\dist\service\*"; DestDir: "{app}\service"; Flags: recursesubdirs
Source: "..\..\dist\config-ui\*"; DestDir: "{app}\config-ui"; Flags: recursesubdirs

[Run]
Filename: "{app}\python\python.exe"; Parameters: "get-pip.py"; WorkingDir: "{app}\python"
Filename: "{app}\python\python.exe"; Parameters: "-m pip install -r service\requirements.txt"; WorkingDir: "{app}\service"
Filename: "{app}\python\python.exe"; Parameters: "installer\install.py"; WorkingDir: "{app}\service"
Filename: "{app}\python\python.exe"; Parameters: "installer\service_installer.py install"; WorkingDir: "{app}\service"
Filename: "{app}\config-ui\PDV2Cloud Config.exe"; Description: "Abrir configuracao"; Flags: postinstall nowait

[UninstallRun]
Filename: "{app}\python\python.exe"; Parameters: "installer\service_installer.py remove"; WorkingDir: "{app}\service"
