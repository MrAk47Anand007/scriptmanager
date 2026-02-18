#!/usr/bin/env bash
# =============================================================================
#  ScriptManager — One-line installer for Linux & macOS
#  Usage:  sudo bash install.sh
#          bash install.sh          (will sudo individual commands as needed)
# =============================================================================
set -e

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }
step()    { echo -e "\n${BOLD}▶ $*${RESET}"; }

# ── Banner ───────────────────────────────────────────────────────────────────
echo -e "${CYAN}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║       ScriptManager Installer        ║"
echo "  ║   github.com/MrAk47Anand007/         ║"
echo "  ║            scriptmanager             ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${RESET}"

# ── Config ───────────────────────────────────────────────────────────────────
INSTALL_DIR="${INSTALL_DIR:-/opt/scriptmanager}"
SERVICE_USER="${SERVICE_USER:-scriptmanager}"
PORT="${PORT:-3000}"
REPO_URL="https://github.com/MrAk47Anand007/scriptmanager.git"
NODE_MIN_MAJOR=18

# ── Helper: run as root ───────────────────────────────────────────────────────
_sudo() {
  if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

# ── 1. OS detection ───────────────────────────────────────────────────────────
step "Detecting operating system"
OS="$(uname -s)"
case "$OS" in
  Linux*)  PLATFORM=linux ;;
  Darwin*) PLATFORM=macos ;;
  *)       error "Unsupported OS: $OS" ;;
esac
info "Platform: $PLATFORM"

# ── 2. Check / install Node.js ────────────────────────────────────────────────
step "Checking Node.js (>= $NODE_MIN_MAJOR required)"

install_node() {
  info "Installing Node.js via NodeSource (Node 20 LTS)..."
  if [[ "$PLATFORM" == "linux" ]]; then
    # Detect distro
    if command -v apt-get &>/dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | _sudo bash -
      _sudo apt-get install -y nodejs
    elif command -v dnf &>/dev/null; then
      curl -fsSL https://rpm.nodesource.com/setup_20.x | _sudo bash -
      _sudo dnf install -y nodejs
    elif command -v yum &>/dev/null; then
      curl -fsSL https://rpm.nodesource.com/setup_20.x | _sudo bash -
      _sudo yum install -y nodejs
    elif command -v pacman &>/dev/null; then
      _sudo pacman -Sy --noconfirm nodejs npm
    else
      error "Cannot detect package manager. Install Node.js 18+ manually: https://nodejs.org"
    fi
  elif [[ "$PLATFORM" == "macos" ]]; then
    if command -v brew &>/dev/null; then
      brew install node@20
    else
      error "Homebrew not found. Install it first: https://brew.sh  or install Node.js manually: https://nodejs.org"
    fi
  fi
}

if command -v node &>/dev/null; then
  NODE_MAJOR=$(node -e "process.stdout.write(String(process.version.split('.')[0].replace('v','')))")
  if [[ "$NODE_MAJOR" -ge "$NODE_MIN_MAJOR" ]]; then
    success "Node.js $(node --version) found"
  else
    warn "Node.js $NODE_MAJOR is too old (need $NODE_MIN_MAJOR+). Installing newer version..."
    install_node
  fi
else
  warn "Node.js not found. Installing..."
  install_node
fi

# Verify npm
command -v npm &>/dev/null || error "npm not found after Node install. Please install manually."
success "npm $(npm --version) ready"

# ── 3. Check Git ──────────────────────────────────────────────────────────────
step "Checking Git"
if ! command -v git &>/dev/null; then
  warn "Git not found — installing..."
  if [[ "$PLATFORM" == "linux" ]]; then
    if   command -v apt-get &>/dev/null; then _sudo apt-get install -y git
    elif command -v dnf     &>/dev/null; then _sudo dnf install -y git
    elif command -v yum     &>/dev/null; then _sudo yum install -y git
    elif command -v pacman  &>/dev/null; then _sudo pacman -Sy --noconfirm git
    fi
  elif [[ "$PLATFORM" == "macos" ]]; then
    brew install git
  fi
fi
success "Git $(git --version | awk '{print $3}') found"

# ── 4. Create service user (Linux only) ──────────────────────────────────────
if [[ "$PLATFORM" == "linux" ]]; then
  step "Creating service user '$SERVICE_USER'"
  if id "$SERVICE_USER" &>/dev/null; then
    info "User '$SERVICE_USER' already exists — skipping"
  else
    _sudo useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
    success "User '$SERVICE_USER' created"
  fi
fi

# ── 5. Clone / update repository ──────────────────────────────────────────────
step "Setting up application in $INSTALL_DIR"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Repository already exists — pulling latest changes..."
  _sudo git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning repository..."
  _sudo git clone "$REPO_URL" "$INSTALL_DIR"
fi
success "Repository ready at $INSTALL_DIR"

# ── 6. Fix ownership ─────────────────────────────────────────────────────────
if [[ "$PLATFORM" == "linux" ]]; then
  _sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
fi

# ── 7. Create runtime directories ─────────────────────────────────────────────
step "Creating runtime directories"
for dir in "$INSTALL_DIR/data" "$INSTALL_DIR/user_scripts" "$INSTALL_DIR/builds"; do
  _sudo mkdir -p "$dir"
  [[ "$PLATFORM" == "linux" ]] && _sudo chown "$SERVICE_USER:$SERVICE_USER" "$dir"
  success "  $dir"
done

# ── 8. Write .env ─────────────────────────────────────────────────────────────
step "Writing .env configuration"
SESSION_SECRET=$(node -e "require('crypto').randomBytes(32).toString('hex').split('').join('')" 2>/dev/null \
  || openssl rand -hex 32 2>/dev/null \
  || cat /proc/sys/kernel/random/uuid 2>/dev/null \
  || echo "change-me-$(date +%s)")

ENV_FILE="$INSTALL_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  _sudo tee "$ENV_FILE" > /dev/null <<EOF
DATABASE_URL="file:./data/scriptmanager.db"
SCRIPTS_DIR="./user_scripts"
BUILDS_DIR="./builds"
PORT=$PORT
SESSION_SECRET="$SESSION_SECRET"
EOF
  [[ "$PLATFORM" == "linux" ]] && _sudo chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"
  _sudo chmod 600 "$ENV_FILE"
  success ".env created with random SESSION_SECRET"
else
  warn ".env already exists — not overwriting (keeping your settings)"
fi

# ── 9. Install npm dependencies ───────────────────────────────────────────────
step "Installing npm dependencies (this may take a few minutes)"
if [[ "$PLATFORM" == "linux" ]]; then
  _sudo -u "$SERVICE_USER" bash -c "cd '$INSTALL_DIR' && npm install --omit=dev 2>&1" \
    || _sudo bash -c "cd '$INSTALL_DIR' && npm install --omit=dev 2>&1"
else
  (cd "$INSTALL_DIR" && npm install --omit=dev)
fi
success "Dependencies installed"

# ── 10. Generate Prisma client & run migrations ───────────────────────────────
step "Setting up database"
if [[ "$PLATFORM" == "linux" ]]; then
  _sudo -u "$SERVICE_USER" bash -c "cd '$INSTALL_DIR' && npm run db:generate 2>&1" \
    || bash -c "cd '$INSTALL_DIR' && npm run db:generate 2>&1"
  _sudo -u "$SERVICE_USER" bash -c "cd '$INSTALL_DIR' && npx prisma migrate deploy 2>&1" \
    || bash -c "cd '$INSTALL_DIR' && npx prisma migrate deploy 2>&1"
else
  (cd "$INSTALL_DIR" && npm run db:generate)
  (cd "$INSTALL_DIR" && npx prisma migrate deploy)
fi
success "Database ready"

# ── 11. Build Next.js app ─────────────────────────────────────────────────────
step "Building the application (this takes 1-3 minutes)"
if [[ "$PLATFORM" == "linux" ]]; then
  _sudo -u "$SERVICE_USER" bash -c "cd '$INSTALL_DIR' && npm run build 2>&1" \
    || bash -c "cd '$INSTALL_DIR' && npm run build 2>&1"
else
  (cd "$INSTALL_DIR" && npm run build)
fi
success "Build complete"

# ── 12. Install systemd service (Linux) ───────────────────────────────────────
if [[ "$PLATFORM" == "linux" ]] && command -v systemctl &>/dev/null; then
  step "Installing systemd service"
  NODE_BIN=$(command -v node)
  NPM_BIN=$(command -v npm)

  _sudo tee /etc/systemd/system/scriptmanager.service > /dev/null <<EOF
[Unit]
Description=ScriptManager
Documentation=https://github.com/MrAk47Anand007/scriptmanager
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$NPM_BIN start
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=scriptmanager

[Install]
WantedBy=multi-user.target
EOF

  _sudo systemctl daemon-reload
  _sudo systemctl enable scriptmanager
  _sudo systemctl restart scriptmanager
  success "systemd service installed and started"

# ── 12b. launchd plist (macOS) ────────────────────────────────────────────────
elif [[ "$PLATFORM" == "macos" ]]; then
  step "Installing launchd service"
  PLIST="$HOME/Library/LaunchAgents/com.scriptmanager.app.plist"
  NODE_BIN=$(command -v node)
  NPM_BIN=$(command -v npm)

  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.scriptmanager.app</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NPM_BIN</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$INSTALL_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:$(dirname "$NODE_BIN")</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/scriptmanager.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/scriptmanager.err</string>
</dict>
</plist>
EOF

  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  success "launchd service installed and started"
fi

# ── 13. Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  ScriptManager installed successfully!   ${RESET}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════${RESET}"
echo ""
echo -e "  ${BOLD}URL:${RESET}        http://localhost:$PORT"
echo -e "  ${BOLD}Install dir:${RESET} $INSTALL_DIR"
echo -e "  ${BOLD}Data dir:${RESET}   $INSTALL_DIR/data"
echo ""
if [[ "$PLATFORM" == "linux" ]] && command -v systemctl &>/dev/null; then
echo -e "  ${CYAN}Useful commands:${RESET}"
echo -e "    systemctl status scriptmanager    # check status"
echo -e "    journalctl -u scriptmanager -f    # live logs"
echo -e "    systemctl restart scriptmanager   # restart"
elif [[ "$PLATFORM" == "macos" ]]; then
echo -e "  ${CYAN}Useful commands:${RESET}"
echo -e "    launchctl list | grep scriptmanager   # check status"
echo -e "    tail -f /tmp/scriptmanager.log        # live logs"
fi
echo ""
echo -e "  Open your browser at ${CYAN}http://localhost:$PORT${RESET} to finish setup."
echo -e "  On first login you will be prompted to set your password."
echo ""