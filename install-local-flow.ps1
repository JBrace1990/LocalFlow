$ErrorActionPreference = 'Stop'
$InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\Local Flow'
$StartMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$ShortcutPath = Join-Path $StartMenuDir 'Local Flow.lnk'
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Local Flow.lnk'
$RepoSource = Split-Path -Parent $MyInvocation.MyCommand.Path

function Find-Node {
  $found = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($found) { return $found.Source }
  foreach ($candidate in @((Join-Path $env:ProgramFiles 'nodejs\node.exe'),(Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'))) { if (Test-Path -LiteralPath $candidate) { return $candidate } }
  return $null
}

if (-not (Test-Path -LiteralPath (Join-Path $RepoSource 'package.json'))) { throw 'Run this installer from the Local Flow source or release folder.' }
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Get-ChildItem -LiteralPath $RepoSource -Force | Where-Object { $_.Name -notin @('.git','node_modules','dist','data') } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $InstallDir -Recurse -Force }

$HasPrebuiltRelease = Test-Path -LiteralPath (Join-Path $RepoSource 'dist\index.html')
if ($HasPrebuiltRelease) {
  Copy-Item -LiteralPath (Join-Path $RepoSource 'dist') -Destination $InstallDir -Recurse -Force
} else {
  $NodePath = Find-Node
  if (-not $NodePath) {
    $Winget=Get-Command winget.exe -ErrorAction SilentlyContinue
    if($Winget){& $Winget.Source install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements;if($LASTEXITCODE -ne 0){throw 'Node.js could not be installed automatically. Install Node.js 20 or newer from nodejs.org, then rerun.'};$env:Path="$env:ProgramFiles\nodejs;$env:LOCALAPPDATA\Programs\nodejs;$env:Path";$NodePath=Find-Node}
    if(-not $NodePath){Start-Process 'https://nodejs.org/en/download';throw 'This source checkout needs Node.js 20 or newer. Install it, then rerun the installer.'}
  }
  $NodeMajor = [int](& $NodePath -p 'Number(process.versions.node.split(".")[0])')
  if ($NodeMajor -lt 20) { throw 'Node.js 20 or newer is required.' }
  $NodeHome = Split-Path -Parent $NodePath
  $Npm = Join-Path $NodeHome 'node_modules\npm\bin\npm-cli.js'
  if (-not (Test-Path -LiteralPath $Npm)) { throw 'npm was not found alongside Node.js.' }
  Push-Location $InstallDir
  try {
    & $NodePath $Npm install
    if ($LASTEXITCODE -ne 0) { throw 'Could not install Local Flow dependencies.' }
    & $NodePath (Join-Path $InstallDir 'node_modules\vite\bin\vite.js') build
    if ($LASTEXITCODE -ne 0) { throw 'Could not build the Local Flow interface.' }
  } finally { Pop-Location }
}

New-Item -ItemType Directory -Force -Path $StartMenuDir | Out-Null
$Shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = 'powershell.exe'
$Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $InstallDir 'launch-local-flow.ps1') + '"'
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.Description = 'Start Local Flow and its configured local services'
$Shortcut.Save()
Copy-Item -LiteralPath $ShortcutPath -Destination $DesktopShortcut -Force
Write-Host "Installed Local Flow to $InstallDir"
Write-Host 'Start Menu and Desktop shortcuts are ready.'
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $InstallDir 'launch-local-flow.ps1'))
