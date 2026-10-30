; ZHIROX371 Windows offline isolated trial — NOT CERTIFIED FOR REAL SALES.
; Inno Setup per-user installer. Contains no real database, passwords or market records.
#define AppVersion "53.0.0-rc1"
[Setup]
AppId={{2C55115E-C2D2-4F0C-9DE8-5B5F4905AD53}
AppName=ZHIROX371 Windows RELEASE CANDIDATE - NOT FOR SALES
AppVersion={#AppVersion}
AppPublisher=ZHIROX371 development
DefaultDirName={localappdata}\ZHIROX371-RC-V53-TEST
DefaultGroupName=ZHIROX371 RC-V53 TEST
OutputDir=..\artifacts
OutputBaseFilename=ZHIROX371-Windows-RC-V53-NOT-FOR-SALES-Setup
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=ZHIROX371 RC V53 LAB - NOT FOR SALES
SetupLogging=yes
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
[Files]
Source: "..\ZHIROX371-Windows-OFFLINE-TRIAL\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autoprograms}\ZHIROX371 Trial - Read Instructions"; Filename: "{app}\README-OFFLINE-TRIAL.txt"
Name: "{autoprograms}\ZHIROX371 Trial - Start Test Service"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -File ""{app}\windows\Start-ZHIROX-Trial.ps1"""; WorkingDir: "{app}"
Name: "{autoprograms}\ZHIROX371 Trial - Start V49 Sync Test"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -File ""{app}\windows\Start-ZHIROX-AutoSync-TRIAL.ps1"""; WorkingDir: "{app}"
Name: "{autoprograms}\ZHIROX371 RC V53 - Verify Package Integrity"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -File ""{app}\windows\Inspect-ZHIROX-RC-V53.ps1"""; WorkingDir: "{app}"
Name: "{autodesktop}\ZHIROX371 Trial Instructions"; Filename: "{app}\README-OFFLINE-TRIAL.txt"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Create trial instructions shortcut"; GroupDescription: "Optional shortcuts:"
[Run]
Filename: "{app}\README-OFFLINE-TRIAL.txt"; Description: "Open OFFLINE TRIAL safety and setup instructions"; Flags: postinstall shellexec skipifsilent
