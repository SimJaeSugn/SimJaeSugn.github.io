#define AppName      "AgenticERM"
#define AppVersion   "1.0.0"
#define AppPublisher "UXIS"
#define ElectronDir  "dist\win-unpacked"

[Setup]
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
DefaultDirName={autopf}\AgenticERM
DefaultGroupName=AgenticERM
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=AgenticERM_Desktop_Setup_{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#AppName}
; ── 설치 마법사 광고 이미지 ──────────────────────────────────────
; WizardImageFile: 환영/완료 페이지 좌측 대형(164x314), WizardSmallImageFile: 내부 페이지 우상단(55x58).
; 실제 광고로 교체하려면 동일 크기 24bit BMP 로 resources\ad.bmp / ad_small.bmp 덮어쓰기
; (재생성: python electron/resources/make_ad.py)
WizardStyle=modern
DisableWelcomePage=no
WizardImageFile=resources\ad.bmp
WizardSmallImageFile=resources\ad_small.bmp

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Files]
Source: "{#ElectronDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\AgenticERM";         Filename: "{app}\AgenticERM.exe"
Name: "{group}\AgenticERM 제거";    Filename: "{uninstallexe}"
Name: "{commondesktop}\AgenticERM"; Filename: "{app}\AgenticERM.exe"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Run]
Filename: "{app}\AgenticERM.exe"; Description: "AgenticERM 지금 실행"; Flags: postinstall nowait skipifsilent
