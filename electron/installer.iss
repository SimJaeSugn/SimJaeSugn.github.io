#define AppName      "AgenticERM"
; 버전 단일 원천: electron/package.json — build-desktop.ps1 이 /DAppVersion= 으로 주입.
; /D 없이 직접 iscc 호출 시 빌드된 exe 메타데이터(ProductVersion)에서 파생(둘 다 package.json 유래).
#ifndef AppVersion
  #define ExeFile AddBackslash(SourcePath) + "dist\win-unpacked\AgenticERM.exe"
  #if FileExists(ExeFile)
    ; electron-builder 가 스탬프한 버전은 4자리(예: 1.2.0.0) — package.json 표기(1.2.0)에 맞춰 3자리로 트림
    #define VerMajor
    #define VerMinor
    #define VerRev
    #define VerBuild
    #expr GetVersionComponents(ExeFile, VerMajor, VerMinor, VerRev, VerBuild)
    #define AppVersion Str(VerMajor) + "." + Str(VerMinor) + "." + Str(VerRev)
  #else
    #pragma error "AppVersion 미지정 + win-unpacked 없음 — 2단계(npm run build:win) 먼저 실행하거나 /DAppVersion= 으로 호출"
  #endif
#endif
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
SetupIconFile=resources\icon.ico
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
// 내부 페이지(설치위치선택·준비완료·설치중) 하단 빈 공간에 AgenticERM 광고 배너 표시.
var
  AdSel, AdReady, AdInst: TBitmapImage;

function NewBanner(Page: TWinControl; bmp: string; ALeft, AWidth, AHeight, ATop: Integer): TBitmapImage;
begin
  Result := TBitmapImage.Create(WizardForm);
  Result.Parent := Page;
  Result.Bitmap.LoadFromFile(bmp);
  Result.Stretch := True;
  Result.Left := ALeft;
  Result.Width := AWidth;
  Result.Height := AHeight;
  Result.Top := ATop;
end;

procedure InitializeWizard;
var
  bmp: string;
  bh, x, w: Integer;
begin
  ExtractTemporaryFile('ad_banner.bmp');
  bmp := ExpandConstant('{tmp}\ad_banner.bmp');
  bh := ScaleY(90);
  x := WizardForm.ReadyMemo.Left;     // 내부 페이지 공통 좌측 인셋
  w := WizardForm.ReadyMemo.Width;

  // 설치 위치 선택 — 하단 빈 공간
  AdSel := NewBanner(WizardForm.SelectDirPage, bmp, x, w, bh,
    WizardForm.SelectDirPage.ClientHeight - bh - ScaleY(8));

  // 설치 준비 완료 — 요약 메모를 줄여 그 아래
  WizardForm.ReadyMemo.Height := WizardForm.ReadyMemo.Height - (bh + ScaleY(10));
  AdReady := NewBanner(WizardForm.ReadyPage, bmp, x, w, bh,
    WizardForm.ReadyMemo.Top + WizardForm.ReadyMemo.Height + ScaleY(10));

  // 설치 중 — 진행바 아래
  AdInst := NewBanner(WizardForm.InstallingPage, bmp, x, w, bh,
    WizardForm.InstallingPage.ClientHeight - bh - ScaleY(8));
end;
