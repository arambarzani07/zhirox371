; ZHIROX371 Windows offline isolated trial — NOT CERTIFIED FOR REAL SALES.
; Inno Setup per-user installer. Contains no real database, passwords or market records.
#define AppVersion "55.0.0-rc1"
[Setup]
AppId={{CAEF4112-1DD4-4A47-82D1-9F4D12147255}
AppName=ZHIROX371 Offline Desktop V55 - PREVIEW ONLY
AppVersion={#AppVersion}
AppPublisher=ZHIROX371 development
DefaultDirName={localappdata}\ZHIROX371-Desktop-V55-PREVIEW
DefaultGroupName=ZHIROX371 Desktop V55
OutputDir=..\artifacts
OutputBaseFilename=ZHIROX371-V55-Offline-App-Setup
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=ZHIROX371 V55 Offline Preview (not approved for sales)
SetupLogging=yes
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
[Files]
Source: "..\ZHIROX371-Windows-OFFLINE-TRIAL\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autoprograms}\ZHIROX371 Offline"; Filename: "{app}\ZHIROX371.exe"; WorkingDir: "{app}"
Name: "{autoprograms}\ZHIROX371 Trial - Read Instructions"; Filename: "{app}\README-OFFLINE-TRIAL.txt"
Name: "{autoprograms}\ZHIROX371 Trial - Start Test Service"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -File ""{app}\windows\Start-ZHIROX-Trial.ps1"""; WorkingDir: "{app}"
Name: "{autoprograms}\ZHIROX371 Trial - Start V49 Sync Test"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -File ""{app}\windows\Start-ZHIROX-AutoSync-TRIAL.ps1"""; WorkingDir: "{app}"
Name: "{autoprograms}\ZHIROX371 RC V53 - Verify Package Integrity"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -File ""{app}\windows\Inspect-ZHIROX-RC-V53.ps1"""; WorkingDir: "{app}"
Name: "{autoprograms}\ZHIROX371 RC V54 - TEST ONE Verified Receipt"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -File ""{app}\windows\Start-ZHIROX-Print-V54.ps1"""; WorkingDir: "{app}"
Name: "{autodesktop}\ZHIROX371 Offline"; Filename: "{app}\ZHIROX371.exe"; WorkingDir: "{app}"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Create ZHIROX371 Offline desktop app shortcut"; GroupDescription: "Optional shortcuts:"
[Run]
Filename: "{app}\ZHIROX371.exe"; Description: "Open ZHIROX371 Offline Desktop (preview only, no real sales)"; Flags: postinstall nowait skipifsilent
