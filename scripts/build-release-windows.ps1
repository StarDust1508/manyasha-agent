param(
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PackageRoot = Split-Path -Parent $ScriptRoot
if (-not $OutputDir) { $OutputDir = Join-Path $PackageRoot "dist" }
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)
$StageDir = Join-Path $OutputDir "Manyasha-0.2.0-windows"
$Archive = Join-Path $OutputDir "Manyasha-0.2.0-windows.zip"
if ($OutputDir -eq [System.IO.Path]::GetPathRoot($OutputDir) -or $OutputDir -eq $HOME) { throw "Отказ: небезопасная папка выпуска" }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Remove-Item -LiteralPath $StageDir -Recurse -Force -ErrorAction SilentlyContinue
foreach ($Relative in @("src", "scripts", "bin", "config", "docs", "runtime-assets\hermes-web")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $StageDir $Relative) | Out-Null
}
Copy-Item (Join-Path $PackageRoot "src\*.mjs") (Join-Path $StageDir "src") -Force
foreach ($Name in @("navy-key.mjs", "pinned-hermes.mjs", "install-windows.ps1")) { Copy-Item (Join-Path $PackageRoot "scripts\$Name") (Join-Path $StageDir "scripts") -Force }
foreach ($Name in @("manyasha.cmd", "manyasha-hermes.cmd")) { Copy-Item (Join-Path $PackageRoot "bin\$Name") (Join-Path $StageDir "bin") -Force }
Copy-Item (Join-Path $PackageRoot "config\hermes-config.yaml") (Join-Path $StageDir "config") -Force
foreach ($Name in @("package.json", "upstream.lock.json", "README.md", "THIRD_PARTY_NOTICES.md", "SECURITY.md")) { Copy-Item (Join-Path $PackageRoot $Name) $StageDir -Force }
Copy-Item (Join-Path $PackageRoot "docs\*") (Join-Path $StageDir "docs") -Recurse -Force
$WebRoot = Join-Path $PackageRoot "vendor\hermes-agent\hermes_cli\web_dist"
if (-not (Test-Path (Join-Path $WebRoot "index.html"))) { throw "Сначала соберите проверенный Hermes Web UI" }
Copy-Item (Join-Path $WebRoot "*") (Join-Path $StageDir "runtime-assets\hermes-web") -Recurse -Force
Remove-Item -LiteralPath $Archive -Force -ErrorAction SilentlyContinue
Compress-Archive -Path $StageDir -DestinationPath $Archive -CompressionLevel Optimal
$Hash = (Get-FileHash -Algorithm SHA256 -Path $Archive).Hash.ToLowerInvariant()
Set-Content -Path "$Archive.sha256" -Value "$Hash  $(Split-Path -Leaf $Archive)" -Encoding ascii
Write-Output $Archive
