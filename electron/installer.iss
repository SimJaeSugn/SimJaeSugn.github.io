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
; 내부 페이지(준비완료·설치중) 하단 배너 — 설치에 포함하지 않고 setup 임시폴더로만 추출
Source: "resources\ad_banner.bmp"; Flags: dontcopy

[Icons]
Name: "{group}\AgenticERM";         Filename: "{app}\AgenticERM.exe"
Name: "{group}\AgenticERM 제거";    Filename: "{uninstallexe}"
Name: "{commondesktop}\AgenticERM"; Filename: "{app}\AgenticERM.exe"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Run]
Filename: "{app}\AgenticERM.exe"; Description: "AgenticERM 지금 실행"; Flags: postinstall nowait skipifsilent

[Code]
// 설치 준비 완료(wpReady)·설치 중(wpInstalling) 페이지 하단 빈 공간에 광고 배너 표시.
var
  AdReady, AdInstalling: TBitmapImage;

procedure InitializeWizard;
var
  bmp: string;
  bh: Integer;
begin
  ExtractTemporaryFile('ad_banner.bmp');
  bmp := ExpandConstant('{tmp}\ad_banner.bmp');
  bh := ScaleY(90);

  // ── 설치 준비 완료: 요약 메모 높이를 줄여 하단에 배너 공간 확보 ──
  WizardForm.ReadyMemo.Height := WizardForm.ReadyMemo.Height - (bh + ScaleY(10));
  AdReady := TBitmapImage.Create(WizardForm);
  AdReady.Parent := WizardForm.ReadyPage;
  AdReady.Bitmap.LoadFromFile(bmp);
  AdReady.Stretch := True;
  AdReady.Left := WizardForm.ReadyMemo.Left;
  AdReady.Width := WizardForm.ReadyMemo.Width;
  AdReady.Height := bh;
  AdReady.Top := WizardForm.ReadyMemo.Top + WizardForm.ReadyMemo.Height + ScaleY(10);

  // ── 설치 중: 진행바 아래 빈 공간에 배너 ──
  AdInstalling := TBitmapImage.Create(WizardForm);
  AdInstalling.Parent := WizardForm.InstallingPage;
  AdInstalling.Bitmap.LoadFromFile(bmp);
  AdInstalling.Stretch := True;
  AdInstalling.Left := WizardForm.ProgressGauge.Left;
  AdInstalling.Width := WizardForm.ProgressGauge.Width;
  AdInstalling.Height := bh;
  AdInstalling.Top := WizardForm.InstallingPage.ClientHeight - bh - ScaleY(8);
end;
