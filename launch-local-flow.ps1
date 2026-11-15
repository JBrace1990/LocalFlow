$ErrorActionPreference = 'Stop'
$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 4180
$UiPort = 5173
$AppVersion = (Get-Content -LiteralPath (Join-Path $AppDir 'package.json') -Raw | ConvertFrom-Json).version
$ServerBuild = (Get-FileHash -LiteralPath (Join-Path $AppDir 'server.js') -Algorithm SHA256).Hash.Substring(0,16).ToLowerInvariant()
$LogDir = Join-Path $env:LOCALAPPDATA 'Local Flow\logs'
$DataDir = Join-Path $env:LOCALAPPDATA 'Local Flow\data'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

function Find-Node {
  $found = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($found) { return $found.Source }
  foreach ($candidate in @((Join-Path $env:ProgramFiles 'nodejs\node.exe'),(Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'))) { if (Test-Path -LiteralPath $candidate) { return $candidate } }
  throw 'Node.js 20 or newer is required. Run install-local-flow.ps1.'
}
function Test-LocalEndpoint([string]$Url) { try { $r=Invoke-WebRequest -Uri $Url -TimeoutSec 1 -UseBasicParsing; return $r.StatusCode -ge 200 -and $r.StatusCode -lt 500 } catch { return $false } }
function Test-PortFree([int]$Candidate) { $client=[Net.Sockets.TcpClient]::new();try{$client.Connect('127.0.0.1',$Candidate);return $false}catch{return $true}finally{$client.Dispose()} }
function Start-LocalFlowService([string]$Url,[string]$Script,[string]$Name,[string]$Node,[string[]]$ExtraArgs=@()) {
  if (Test-LocalEndpoint $Url) { return }
  $log=Join-Path $LogDir "$Name.log"
  Start-Process -FilePath $Node -ArgumentList (@($Script)+$ExtraArgs) -WorkingDirectory $AppDir -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err"
}

$Node = Find-Node
$Major = [int](& $Node -p 'Number(process.versions.node.split(".")[0])')
if ($Major -lt 20) { throw 'Node.js 20 or newer is required.' }
$env:LOCAL_FLOW_DATA_DIR=$DataDir
if ((Test-LocalEndpoint "http://127.0.0.1:$Port/api/health")) {
  try{$Health=Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2;if($Health.version -ne $AppVersion -or $Health.serverBuild -ne $ServerBuild){while(-not (Test-PortFree $Port)){$Port++}}}catch{while(-not (Test-PortFree $Port)){$Port++}}
}elseif(-not (Test-PortFree $Port)){while(-not (Test-PortFree $Port)){$Port++}}
$env:LOCAL_FLOW_PORT="$Port"
$env:PORT="$Port"
Start-LocalFlowService "http://127.0.0.1:$Port/api/health" (Join-Path $AppDir 'server.js') 'api' $Node
$Deadline=(Get-Date).AddSeconds(45)
while (-not (Test-LocalEndpoint "http://127.0.0.1:$Port/api/health")) { if ((Get-Date) -gt $Deadline) { throw 'Local Flow API did not start. Review the log in %LOCALAPPDATA%\Local Flow\logs.' }; Start-Sleep -Milliseconds 500 }
$Static=Test-Path -LiteralPath (Join-Path $AppDir 'dist\index.html')
$UseVite= -not $Static -and $Port -eq 4180 -and -not (Test-LocalEndpoint "http://127.0.0.1:$UiPort")
if ($UseVite) { Start-LocalFlowService "http://127.0.0.1:$UiPort" (Join-Path $AppDir 'node_modules\vite\bin\vite.js') 'ui' $Node @('--host','127.0.0.1') }
$AppUrl=if($UseVite){"http://127.0.0.1:$UiPort/"}else{"http://127.0.0.1:$Port/"}
$Deadline=(Get-Date).AddSeconds(30)
while (-not (Test-LocalEndpoint $AppUrl)) { if ((Get-Date) -gt $Deadline) { throw 'Local Flow interface did not start.' }; Start-Sleep -Milliseconds 500 }
$Browser=Get-Command msedge.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
if (-not $Browser) { $ProgramFilesX86=[Environment]::GetEnvironmentVariable('ProgramFiles(x86)');foreach($candidate in @((Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),(Join-Path $ProgramFilesX86 'Microsoft\Edge\Application\msedge.exe'))){if(Test-Path -LiteralPath $candidate){$Browser=$candidate;break}} }
if ($Browser) { Start-Process -FilePath $Browser -ArgumentList @("--app=$AppUrl",'--no-first-run','--user-data-dir='+ (Join-Path $env:LOCALAPPDATA 'Local Flow\BrowserProfile')) } else { Start-Process $AppUrl }
$BackendStatus='Automatic ComfyUI start is not configured.'
try {
  $ComfyLaunch=Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$Port/api/launcher/start" -ContentType 'application/json' -Body '{}' -TimeoutSec 4
  if($ComfyLaunch.started){$Deadline=(Get-Date).AddSeconds(25);$Ready=$false;while((Get-Date)-lt $Deadline){if(Test-LocalEndpoint "$($ComfyLaunch.comfyUrl.TrimEnd('/'))/system_stats"){$Ready=$true;break};Start-Sleep -Seconds 2};$BackendStatus=if($Ready){'ComfyUI is ready.'}else{'ComfyUI is still starting or did not become ready. Local Flow is open; check model files and GPU memory if it does not come online.'}}
  else{$BackendStatus=$ComfyLaunch.reason}
}catch{$BackendStatus="ComfyUI auto-start failed: $($_.Exception.Message)"}
if($BackendStatus -notmatch 'ready|Already running|No ComfyUI launch command configured|Automatic start disabled'){
  Add-Content -LiteralPath (Join-Path $LogDir 'launcher.log') -Value "$(Get-Date -Format s) $BackendStatus"
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("Local Flow has opened.`n`n$BackendStatus`n`nYou can configure ComfyUI under Studio Settings.",'Local Flow · backend status','OK','Information') | Out-Null
}
