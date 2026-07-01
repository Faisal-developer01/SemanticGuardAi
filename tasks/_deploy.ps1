$ErrorActionPreference = 'Stop'
$env:Path = "$env:ProgramFiles\Microsoft SDKs\Azure\CLI2\wbin;" + $env:Path

$rg   = 'SemanticGuard-Ai'
$app  = 'SemanticGuardAi'
$root = (Resolve-Path "$PSScriptRoot\..").Path
$stage = Join-Path $env:TEMP 'sgai_deploy'
$zip   = Join-Path $env:TEMP 'sgai_deploy.zip'

Write-Output "=== Staging from $root ==="
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

$exclude = @('__pycache__', '.venv', '.pytest_cache', 'instance', 'var')
robocopy "$root\backend" "$stage\backend" /E /XD $exclude /XF '*.pyc' 'dev.sqlite3' | Out-Null
robocopy "$root\dist" "$stage\dist" /E | Out-Null
Copy-Item "$root\requirements.txt" "$stage\requirements.txt" -Force
Copy-Item "$root\startup.sh" "$stage\startup.sh" -Force

# Strip secrets / container-only files from staging
Remove-Item "$stage\backend\.env" -Force -ErrorAction SilentlyContinue
Remove-Item "$stage\backend\Dockerfile", "$stage\backend\.dockerignore", "$stage\backend\docker-entrypoint.sh" -Force -ErrorAction SilentlyContinue

# Normalize startup.sh to LF
$sh = Get-Content "$stage\startup.sh" -Raw
[System.IO.File]::WriteAllText("$stage\startup.sh", ($sh -replace "`r`n", "`n"))

Write-Output "=== Zipping ==="
if (Test-Path $zip) { Remove-Item $zip -Force }

# Build the zip with forward-slash entry names so Linux/Oryx recognizes
# directories (Windows Compress-Archive uses backslashes, which Oryx treats
# as flat filenames and breaks the backend/ folder structure).
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$fs = [System.IO.File]::Open($zip, [System.IO.FileMode]::Create)
$archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
$stageFull = (Resolve-Path $stage).Path
Get-ChildItem -Path $stage -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($stageFull.Length + 1) -replace '\\', '/'
    $entry = $archive.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
    $es = $entry.Open()
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    $es.Write($bytes, 0, $bytes.Length)
    $es.Close()
}
$archive.Dispose()
$fs.Close()
Write-Output ("ZIP size: " + (Get-Item $zip).Length + " bytes")

Write-Output "=== Deploying (Oryx build) ==="
az webapp deploy -g $rg -n $app --src-path $zip --type zip --async true --only-show-errors 2>&1 | Out-String | Write-Output
Write-Output "DEPLOY_TRIGGERED"
