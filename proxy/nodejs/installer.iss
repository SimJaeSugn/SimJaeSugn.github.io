#define AppName    "UXERManager 미들웨어"
#define AppVersion "1.0.0"
#define AppExe     "uxermanager.exe"
#define AppPublisher "UXIS"

[Setup]
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppId={{B3F2A1C4-7E8D-4F2B-9A3C-1D5E6F7A8B9C}
DefaultDirName={autopf}\UXERManager
DefaultGroupName=UXERManager
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=UXERManager_Setup_{#AppVersion}
SetupIconFile=
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#AppName}
CloseApplications=yes

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Files]
Source: "dist\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "start.vbs";      DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\UXERManager 시작";  Filename: "{app}\start.vbs"; Comment: "UXERManager 미들웨어를 트레이로 실행"
Name: "{group}\UXERManager 제거";  Filename: "{uninstallexe}"

[Run]
Filename: "{app}\start.vbs"; \
  Description: "UXERManager 미들웨어 지금 시작"; \
  Flags: postinstall nowait shellexec skipifsilent
