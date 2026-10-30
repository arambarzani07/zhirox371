; ZHIROX371 Windows offline isolated trial — NOT CERTIFIED FOR REAL SALES.
; Inno Setup per-user installer. Contains no real database, passwords or market records.
#define AppVersion "48.1.0"
[Setup]
AppId={{9D40D1C7-4AD0-487E-96B8-6482EA8ACB47}
AppName=ZHIROX371 Offline Windows TRIAL - NOT FOR SALES
AppVersion={#AppVersion}
AppPublisher=ZHIROX371 development
DefaultDirName={localappdata}\ZHIROX371-Offline-TRIAL
DefaultGroupName=ZHIROX371 Offline TRIAL
OutputDir=..\artifacts
OutputBaseFilename=ZHIROX371-Offline-Windows-TRIAL-Setup
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=ZHIROX371 Offline TRIAL (not approved for sales)
SetupLogging=yes
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
[Files]
Source: "..\ZHIROX371-Windows-OFFLINE-TRIAL\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autoprograms}\ZHIROX371 Trial - Read Instructions"; Filename: "{app}\README-OFFLINE-TRIAL.txt"
Name: "{autoprograms}\ZHIROX371 Trial - Start Test Service"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -File ""{app}\windows\Start-ZHIROX-Trial.ps1"""; WorkingDir: "{app}"
Name: "{autodesktop}\ZHIROX371 Trial Instructions"; Filename: "{app}\README-OFFLINE-TRIAL.txt"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Create trial instructions shortcut"; GroupDescription: "Optional shortcuts:"
[Run]
Filename: "{app}\README-OFFLINE-TRIAL.txt"; Description: "Open OFFLINE TRIAL safety and setup instructions"; Flags: postinstall shellexec skipifsilent
