# =============================================================================
#  ScriptManager — One-click installer for Windows
#  Usage: Right-click → "Run with PowerShell"  (or run as Administrator)
#         PowerShell -ExecutionPolicy Bypass -File install.ps1
# =============================================================================
#Requires -Version 5.1
param(
    [string]$InstallDir = "C:\ScriptManager",
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/MrAk47Anand007/scriptmanager.git"
$NodeMinMajor = 18

# ── Colours / helpers ─────────────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "`n▶ $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Write-Info  { param($msg) Write-Host "  [INFO] $msg" -ForegroundColor Gray }
function Write-Warn  { param($msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "  [ERR]  $msg" -ForegroundColor Red; exit 1 }

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║       ScriptManager Installer        ║" -ForegroundColor Cyan
Write-Host "  ║       Windows Edition (PowerShell)   ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Elevation check ───────────────────────────────────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warn "Not running as Administrator. Relaunching with elevation..."
    $args2 = "-ExecutionPolicy Bypass -File `"$PSCommandPath`" -InstallDir `"$InstallDir`" -Port $Port"
    Start-Process powershell -Verb RunAs -ArgumentList $args2
    exit
}
Write-Ok "Running as Administrator"

# ── 1. Check / install Node.js ────────────────────────────────────────────────
Write-Step "Checking Node.js (>= $NodeMinMajor required)"

$nodeOk = $false
try {
    $nodeVer = (node --version 2>$null)
    if ($nodeVer -match "v(\d+)") {
        $major = [int]$Matches[1]
        if ($major -ge $NodeMinMajor) {
            Write-Ok "Node.js $nodeVer found"
            $nodeOk = $true
        } else {
            Write-Warn "Node.js $major is too old — need $NodeMinMajor+"
        }
    }
} catch { }

if (-not $nodeOk) {
    Write-Info "Downloading Node.js 20 LTS installer..."
    $nodeInstaller = "$env:TEMP\node-installer.msi"
    $nodeUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller -UseBasicParsing
    Write-Info "Installing Node.js silently (this takes ~1 minute)..."
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart"
    Remove-Item $nodeInstaller -Force -ErrorAction SilentlyContinue

    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-Ok "Node.js installed"
}

# Verify npm
try { $npmVer = npm --version 2>$null; Write-Ok "npm $npmVer ready" }
catch { Write-Fail "npm not found. Please install Node.js manually from https://nodejs.org" }

# ── 2. Check / install Git ────────────────────────────────────────────────────
Write-Step "Checking Git"
$gitOk = $false
try { git --version | Out-Null; $gitOk = $true; Write-Ok "Git found" } catch { }

if (-not $gitOk) {
    Write-Info "Downloading Git for Windows..."
    $gitInstaller = "$env:TEMP\git-installer.exe"
    $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.47.0.windows.2/Git-2.47.0.2-64-bit.exe"
    Invoke-WebRequest -Uri $gitUrl -OutFile $gitInstaller -UseBasicParsing
    Write-Info "Installing Git silently..."
    Start-Process $gitInstaller -Wait -ArgumentList "/VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS"
    Remove-Item $gitInstaller -Force -ErrorAction SilentlyContinue

    $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-Ok "Git installed"
}

# ── 3. Install Build Tools (for node-pty) ────────────────────────────────────
Write-Step "Installing Windows Build Tools (for node-pty native module)"
Write-Info "Checking for Visual C++ Build Tools..."
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasBuildTools = (Test-Path $vsWhere) -and (& $vsWhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 2>$null)

if (-not $hasBuildTools) {
    Write-Info "Installing Build Tools via npm (windows-build-tools)..."
    npm install --global --production windows-build-tools 2>&1 | Out-Null
    Write-Ok "Build Tools installed"
} else {
    Write-Ok "Visual C++ Build Tools already present"
}

# ── 4. Clone / update repo ────────────────────────────────────────────────────
Write-Step "Setting up application in $InstallDir"
if (Test-Path "$InstallDir\.git") {
    Write-Info "Repository already exists — pulling latest..."
    git -C $InstallDir pull --ff-only
} else {
    Write-Info "Cloning repository..."
    git clone $RepoUrl $InstallDir
}
Write-Ok "Repository ready at $InstallDir"

# ── 5. Create runtime directories ─────────────────────────────────────────────
Write-Step "Creating runtime directories"
foreach ($sub in @("data", "user_scripts", "builds")) {
    $path = Join-Path $InstallDir $sub
    if (-not (Test-Path $path)) { New-Item -ItemType Directory -Path $path | Out-Null }
    Write-Ok "  $path"
}

# ── 6. Write .env ─────────────────────────────────────────────────────────────
Write-Step "Writing .env configuration"
$envFile = Join-Path $InstallDir ".env"
if (-not (Test-Path $envFile)) {
    $secret = -join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
    @"
DATABASE_URL="file:./data/scriptmanager.db"
SCRIPTS_DIR="./user_scripts"
BUILDS_DIR="./builds"
PORT=$Port
SESSION_SECRET="$secret"
"@ | Set-Content -Path $envFile -Encoding UTF8
    Write-Ok ".env created with random SESSION_SECRET"
} else {
    Write-Warn ".env already exists — not overwriting (keeping your settings)"
}

# ── 7. npm install ────────────────────────────────────────────────────────────
Write-Step "Installing npm dependencies (this may take a few minutes)"
Push-Location $InstallDir
npm install --omit=dev
if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed" }
Write-Ok "Dependencies installed"

# ── 8. Prisma generate + migrate ──────────────────────────────────────────────
Write-Step "Setting up database"
npm run db:generate
if ($LASTEXITCODE -ne 0) { Write-Fail "Prisma generate failed" }
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Write-Fail "Prisma migrate failed" }
Write-Ok "Database ready"

# ── 9. Build Next.js ─────────────────────────────────────────────────────────
Write-Step "Building the application (this takes 1-3 minutes)"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Fail "Next.js build failed" }
Write-Ok "Build complete"
Pop-Location

# ── 10. Install Windows Service via NSSM ─────────────────────────────────────
Write-Step "Installing as a Windows Service"
$nssmPath = "$env:ProgramFiles\nssm\nssm.exe"

if (-not (Test-Path $nssmPath)) {
    Write-Info "Downloading NSSM (service manager)..."
    $nssmZip = "$env:TEMP\nssm.zip"
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip -UseBasicParsing
    Expand-Archive -Path $nssmZip -DestinationPath "$env:TEMP\nssm_extract" -Force
    New-Item -ItemType Directory -Path "$env:ProgramFiles\nssm" -Force | Out-Null
    Copy-Item "$env:TEMP\nssm_extract\nssm-2.24\win64\nssm.exe" -Destination $nssmPath -Force
    Remove-Item $nssmZip, "$env:TEMP\nssm_extract" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Ok "NSSM installed"
}

$npmPath = (Get-Command npm).Source
$serviceName = "ScriptManager"

# Remove existing service if present
$existing = sc.exe query $serviceName 2>$null
if ($existing -match "SERVICE_NAME") {
    Write-Info "Removing existing service..."
    & $nssmPath stop $serviceName 2>$null
    & $nssmPath remove $serviceName confirm 2>$null
}

& $nssmPath install $serviceName $npmPath
& $nssmPath set $serviceName AppParameters "start"
& $nssmPath set $serviceName AppDirectory $InstallDir
& $nssmPath set $serviceName AppEnvironmentExtra "NODE_ENV=production"
& $nssmPath set $serviceName DisplayName "ScriptManager"
& $nssmPath set $serviceName Description "Self-hosted script manager"
& $nssmPath set $serviceName Start SERVICE_AUTO_START
& $nssmPath set $serviceName AppStdout "$InstallDir\logs\service.log"
& $nssmPath set $serviceName AppStderr "$InstallDir\logs\service-error.log"

New-Item -ItemType Directory -Path "$InstallDir\logs" -Force | Out-Null
Start-Service $serviceName
Write-Ok "Windows Service '$serviceName' installed and started"

# ── 11. Firewall rule ─────────────────────────────────────────────────────────
Write-Step "Adding Windows Firewall rule (port $Port)"
$ruleName = "ScriptManager HTTP"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) { Remove-NetFirewallRule -DisplayName $ruleName }
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
Write-Ok "Firewall rule added for port $Port"

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ══════════════════════════════════════════" -ForegroundColor Green
Write-Host "   ScriptManager installed successfully!" -ForegroundColor Green
Write-Host "  ══════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  URL:         http://localhost:$Port" -ForegroundColor White
Write-Host "  Install dir: $InstallDir" -ForegroundColor White
Write-Host "  Service:     ScriptManager (auto-starts with Windows)" -ForegroundColor White
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor Cyan
Write-Host "    Get-Service ScriptManager          # check status"
Write-Host "    Restart-Service ScriptManager      # restart"
Write-Host "    Stop-Service ScriptManager         # stop"
Write-Host "    Get-Content $InstallDir\logs\service.log -Tail 50  # logs"
Write-Host ""
Write-Host "  Open your browser at http://localhost:$Port to finish setup." -ForegroundColor Cyan
Write-Host "  On first login you will be prompted to set your password." -ForegroundColor Cyan
Write-Host ""