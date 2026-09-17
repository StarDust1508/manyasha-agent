param(
  [string]$Prefix = ""
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PackageRoot = Split-Path -Parent $ScriptRoot
$DataRoot = if ($env:MANYASHA_DATA_DIR) { $env:MANYASHA_DATA_DIR } else { Join-Path $env:LOCALAPPDATA "Manyasha" }
$InstallRoot = if ($Prefix) { $Prefix } elseif ($env:MANYASHA_INSTALL_PREFIX) { $env:MANYASHA_INSTALL_PREFIX } else { Join-Path $DataRoot "app" }

if (-not $InstallRoot -or $InstallRoot -eq [System.IO.Path]::GetPathRoot($InstallRoot) -or $InstallRoot -eq $HOME) {
  throw "Отказ: небезопасный путь установки"
}

foreach ($Command in @("node", "uv", "git")) {
  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) { throw "Нужна команда $Command" }
}
$NodeMajor = [int]((node -p "Number(process.versions.node.split('.')[0])").Trim())
if ($NodeMajor -lt 22) { throw "Нужен Node.js 22 или новее" }

foreach ($Relative in @("src", "scripts", "bin", "config", ".runtime")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $InstallRoot $Relative) | Out-Null
}
Copy-Item (Join-Path $PackageRoot "src\*.mjs") (Join-Path $InstallRoot "src") -Force
Copy-Item (Join-Path $PackageRoot "scripts\navy-key.mjs") (Join-Path $InstallRoot "scripts") -Force
Copy-Item (Join-Path $PackageRoot "scripts\pinned-hermes.mjs") (Join-Path $InstallRoot "scripts") -Force
Copy-Item (Join-Path $PackageRoot "bin\manyasha.cmd") (Join-Path $InstallRoot "bin") -Force
Copy-Item (Join-Path $PackageRoot "bin\manyasha-hermes.cmd") (Join-Path $InstallRoot "bin") -Force
Copy-Item (Join-Path $PackageRoot "package.json") $InstallRoot -Force
Copy-Item (Join-Path $PackageRoot "upstream.lock.json") $InstallRoot -Force
Copy-Item (Join-Path $PackageRoot "README.md") $InstallRoot -Force

$Python = Join-Path $InstallRoot ".runtime\hermes-venv\Scripts\python.exe"
if (-not (Test-Path $Python)) { uv venv (Join-Path $InstallRoot ".runtime\hermes-venv") --python 3.11 }
$HermesCheckout = Join-Path $InstallRoot "vendor\hermes-agent"
if (-not (Test-Path (Join-Path $HermesCheckout ".git"))) {
  if (Test-Path $HermesCheckout) { throw "Путь основы занят неизвестными файлами" }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $HermesCheckout) | Out-Null
  $HermesSource = if ($env:MANYASHA_HERMES_SOURCE) { $env:MANYASHA_HERMES_SOURCE } else { "https://github.com/NousResearch/hermes-agent.git" }
  git clone --no-hardlinks $HermesSource $HermesCheckout
}
git -C $HermesCheckout checkout --detach 5eb99eb2844b22ebb723711b8e6a0bbb80bb5f04
$PinnedCommit = (git -C $HermesCheckout rev-parse HEAD).Trim()
if ($PinnedCommit -ne "5eb99eb2844b22ebb723711b8e6a0bbb80bb5f04") { throw "Не совпал закреплённый commit Hermes" }
$BundledWeb = Join-Path $PackageRoot "runtime-assets\hermes-web"
if (Test-Path (Join-Path $BundledWeb "index.html")) {
  $HermesWeb = Join-Path $HermesCheckout "hermes_cli\web_dist"
  New-Item -ItemType Directory -Force -Path $HermesWeb | Out-Null
  Copy-Item (Join-Path $BundledWeb "*") $HermesWeb -Recurse -Force
}
uv pip install --python $Python -e $HermesCheckout

$ProfileRoot = Join-Path $DataRoot "hermes-profile"
New-Item -ItemType Directory -Force -Path $ProfileRoot | Out-Null
$ConfigPath = Join-Path $ProfileRoot "config.yaml"
if (-not (Test-Path $ConfigPath)) { Copy-Item (Join-Path $PackageRoot "config\hermes-config.yaml") $ConfigPath }

node (Join-Path $InstallRoot "src\cli.mjs") setup
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
$BinPath = Join-Path $InstallRoot "bin"
if (-not (($UserPath -split ';') -contains $BinPath)) {
  $NextPath = if ($UserPath) { "$UserPath;$BinPath" } else { $BinPath }
  [Environment]::SetEnvironmentVariable("Path", $NextPath, "User")
}
Write-Host "Маняша установлена: $InstallRoot"
Write-Host "Команда: $BinPath\manyasha.cmd"
Write-Host "Откройте новый PowerShell и выполните: manyasha gui"
