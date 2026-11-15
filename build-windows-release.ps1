$ErrorActionPreference = 'Stop'
$Root = if($PSScriptRoot){$PSScriptRoot}else{(Get-Location).Path}
$NodePath=$env:LOCAL_FLOW_NODE
if(-not $NodePath){$Node=Get-Command node.exe -ErrorAction SilentlyContinue;if($Node){$NodePath=$Node.Source}}
if (-not $NodePath) { throw 'Node.js 20 or newer is required to build the release ZIP.' }
$Major = [int](& $NodePath -p 'Number(process.versions.node.split(".")[0])')
if ($Major -lt 20) { throw 'Node.js 20 or newer is required.' }
$Npm=$env:LOCAL_FLOW_NPM
if(-not $Npm){$Npm=Join-Path (Split-Path -Parent $NodePath) 'node_modules\npm\bin\npm-cli.js'}
if(-not(Test-Path -LiteralPath $Npm)){throw 'npm was not found alongside Node.js.'}
Push-Location $Root
try {
  & $NodePath $Npm install
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed. Check network access and the lockfile.' }
  & $NodePath $Npm run build
  if ($LASTEXITCODE -ne 0) { throw 'The production build failed.' }
} finally { Pop-Location }

$Version = (Get-Content (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json).version
$ReleaseDir=Join-Path $Root 'release'
$Stage = Join-Path $ReleaseDir "Local-Flow-$Version-Windows"
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
if (Test-Path -LiteralPath $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Stage | Out-Null
Get-ChildItem -LiteralPath $Root -Force | Where-Object { $_.Name -notin @('.git','node_modules','dist','data','release','package-lock.json') } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $Stage -Recurse -Force }
Copy-Item -LiteralPath (Join-Path $Root 'dist') -Destination $Stage -Recurse -Force
$Zip = Join-Path $ReleaseDir "Local-Flow-$Version-Windows.zip"
if (Test-Path -LiteralPath $Zip) { Remove-Item -LiteralPath $Zip -Force }
Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $Zip -CompressionLevel Optimal
Write-Host "Windows release package created: $Zip"
