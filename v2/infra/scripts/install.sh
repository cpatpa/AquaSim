#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}[done]${NC}"; }
fail() { echo -e "  ${RED}[FAILED]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}$1${NC}"; }
warn() { echo -e "${YELLOW}$1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo ""
echo -e "${CYAN}=============================================="
echo "  AquaSim Guided Installer"
echo -e "==============================================${NC}"
echo ""
echo "  This installer will set up AquaSim on a fresh"
echo "  Ubuntu server (22.04+) with all dependencies."
echo ""

# -----------------------------------------------------------------------
# Step 1: System prerequisites
# -----------------------------------------------------------------------
info "Step 1/8: Installing system prerequisites"
echo ""

export DEBIAN_FRONTEND=noninteractive

printf "  Checking for %-22s" "git..."
if command -v git &>/dev/null; then
    echo -e "${GREEN}[installed]${NC}"
else
    echo -e "${YELLOW}[installing]${NC}"
    sudo apt-get update -qq && sudo apt-get install -y -qq git || fail "Could not install git"
fi

printf "  Checking for %-22s" "curl..."
if command -v curl &>/dev/null; then
    echo -e "${GREEN}[installed]${NC}"
else
    echo -e "${YELLOW}[installing]${NC}"
    sudo apt-get update -qq && sudo apt-get install -y -qq curl || fail "Could not install curl"
fi

printf "  Checking for %-22s" "openssl..."
if command -v openssl &>/dev/null; then
    echo -e "${GREEN}[installed]${NC}"
else
    echo -e "${YELLOW}[installing]${NC}"
    sudo apt-get update -qq && sudo apt-get install -y -qq openssl || fail "Could not install openssl"
fi

printf "  Checking for %-22s" "ca-certificates..."
if dpkg -s ca-certificates &>/dev/null 2>&1; then
    echo -e "${GREEN}[installed]${NC}"
else
    echo -e "${YELLOW}[installing]${NC}"
    sudo apt-get update -qq && sudo apt-get install -y -qq ca-certificates gnupg || fail "Could not install ca-certificates"
fi

# Docker Engine (official repo)
printf "  Checking for %-22s" "docker..."
if command -v docker &>/dev/null; then
    echo -e "${GREEN}[installed]${NC}"
else
    echo -e "${YELLOW}[installing from official Docker repo]${NC}"

    # Remove any old conflicting packages
    for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do
        sudo apt-get remove -y -qq "$pkg" 2>/dev/null || true
    done

    # Set up Docker apt repository
    sudo install -m 0755 -d /etc/apt/keyrings
    if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        sudo chmod a+r /etc/apt/keyrings/docker.gpg
    fi

    CODENAME=$(. /etc/os-release && echo "$VERSION_CODENAME")
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $CODENAME stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin \
        || fail "Could not install Docker Engine"
    printf "  Docker Engine:    "; ok
fi

# Docker Compose plugin
printf "  Checking for %-22s" "docker compose..."
if docker compose version &>/dev/null 2>&1; then
    echo -e "${GREEN}[installed]${NC}"
else
    echo -e "${YELLOW}[installing]${NC}"
    sudo apt-get update -qq && sudo apt-get install -y -qq docker-compose-plugin \
        || fail "Could not install Docker Compose plugin"
fi

# Make sure Docker is running
printf "  Checking docker daemon...     "
if sudo systemctl is-active --quiet docker; then
    echo -e "${GREEN}[running]${NC}"
else
    sudo systemctl start docker
    sudo systemctl enable docker
    echo -e "${GREEN}[started]${NC}"
fi

# Add current user to docker group
if ! groups "$USER" | grep -q '\bdocker\b'; then
    sudo usermod -aG docker "$USER"
    warn "  Added $USER to docker group."
    warn "  You may need to log out and back in for group changes to take effect."
    warn "  The installer will use 'sudo docker' for the remainder of this session."
    echo ""
    DOCKER_CMD="sudo docker"
    COMPOSE_CMD="sudo docker compose"
else
    DOCKER_CMD="docker"
    COMPOSE_CMD="docker compose"
fi

echo ""

# -----------------------------------------------------------------------
# Step 2: Planned URL
# -----------------------------------------------------------------------
info "Step 2/8: Planned URL"
echo "  What URL will this instance be accessible at?"
echo "  Used for CORS, email links, WebAuthn origin, and share links."
echo ""
read -rp "  URL (e.g. https://aquasim.example.com): " APP_URL
APP_URL="${APP_URL:-https://localhost}"
APP_URL="${APP_URL%/}"
echo ""

# -----------------------------------------------------------------------
# Step 3: Generate self-signed certificates
# -----------------------------------------------------------------------
info "Step 3/8: Generate self-signed certificates"
echo "  These are used by nginx internally. Cloudflare handles public TLS."
bash "$SCRIPT_DIR/generate-certs.sh"
echo ""

# -----------------------------------------------------------------------
# Step 4: Cloudflare Tunnel
# -----------------------------------------------------------------------
info "Step 4/8: Cloudflare Tunnel (public access)"
echo ""
echo "  To expose AquaSim publicly without opening firewall ports:"
echo ""
echo "  1. Log in to Cloudflare Zero Trust dashboard:"
echo "     ${BOLD}https://one.dash.cloudflare.com${NC}"
echo ""
echo "  2. Go to: Networks > Tunnels > Create a tunnel"
echo "     - Choose 'Cloudflared' as the connector"
echo "     - Name the tunnel (e.g. 'aquasim')"
echo ""
echo "  3. Copy the tunnel token (starts with 'eyJ...')"
echo ""
echo "  4. After the installer finishes, add a Public Hostname:"
echo "     - Subdomain: e.g. 'aquasim'"
echo "     - Domain: your Cloudflare domain"
echo "     - Service Type: HTTPS"
echo "     - URL: nginx:443"
echo "     - Under 'Additional application settings > TLS':"
echo "       set 'No TLS Verify' to ON (self-signed cert)"
echo ""
read -rp "  Tunnel token (leave blank to skip, LAN-only access): " TUNNEL_TOKEN
TUNNEL_TOKEN="${TUNNEL_TOKEN:-}"

if [ -z "$TUNNEL_TOKEN" ]; then
    warn "  Skipping Cloudflare Tunnel. AquaSim will only be accessible on the local network."
fi
echo ""

# -----------------------------------------------------------------------
# Step 5: Email configuration
# -----------------------------------------------------------------------
info "Step 5/8: Email configuration"
echo "  Email is used for password reset. Without it, password reset is disabled."
echo ""
echo "  [1] SMTP (Gmail, Mailgun, SendGrid, self-hosted, etc.)"
echo "  [2] Skip (password reset will be disabled)"
echo ""
read -rp "  Choice [1/2]: " EMAIL_CHOICE
EMAIL_CHOICE="${EMAIL_CHOICE:-2}"

SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""

if [ "$EMAIL_CHOICE" = "1" ]; then
    echo ""
    echo "  Common SMTP settings:"
    echo "    Gmail:    smtp.gmail.com:587 (use App Password)"
    echo "    Mailgun:  smtp.mailgun.org:587"
    echo "    SendGrid: smtp.sendgrid.net:587"
    echo ""
    read -rp "  SMTP Host: " SMTP_HOST
    read -rp "  SMTP Port [587]: " SMTP_PORT
    SMTP_PORT="${SMTP_PORT:-587}"
    read -rp "  SMTP User: " SMTP_USER
    read -rsp "  SMTP Password: " SMTP_PASS
    echo ""
    read -rp "  From address (e.g. AquaSim <noreply@example.com>): " SMTP_FROM
fi
echo ""

# -----------------------------------------------------------------------
# Step 6: Generate secrets
# -----------------------------------------------------------------------
info "Step 6/8: Generate secrets"

DB_PASSWORD=$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)
printf "  DB password:      "; echo -e "${GREEN}[generated]${NC}"

JWT_SECRET=$(openssl rand -base64 48 | tr -d '=/+' | head -c 48)
printf "  JWT secret:       "; echo -e "${GREEN}[generated]${NC}"

SAVE_SIGNING_KEY=$(openssl rand -base64 48 | tr -d '=/+' | head -c 48)
printf "  Save signing key: "; echo -e "${GREEN}[generated]${NC}"

GITHUB_WEBHOOK_SECRET=$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)
printf "  Webhook secret:   "; echo -e "${GREEN}[generated]${NC}"

GIT_COMMIT=$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo "dev")
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > "$PROJECT_DIR/.env" << ENVEOF
APP_URL=$APP_URL
CORS_ORIGIN=$APP_URL
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
SAVE_SIGNING_KEY=$SAVE_SIGNING_KEY
TUNNEL_TOKEN=$TUNNEL_TOKEN
GITHUB_WEBHOOK_SECRET=$GITHUB_WEBHOOK_SECRET
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_FROM=$SMTP_FROM
GIT_COMMIT=$GIT_COMMIT
BUILD_TIME=$BUILD_TIME
ENVEOF

chmod 600 "$PROJECT_DIR/.env"
printf "  Writing .env:     "; ok
echo ""

# -----------------------------------------------------------------------
# Step 7: Build and start
# -----------------------------------------------------------------------
info "Step 7/8: Build and start"

cd "$PROJECT_DIR"

COMPOSE_PROFILES=""
if [ -n "$TUNNEL_TOKEN" ]; then
    COMPOSE_PROFILES="--profile tunnel"
fi

echo "  Building containers (this may take a few minutes on first run)..."
$COMPOSE_CMD $COMPOSE_PROFILES build \
    --build-arg GIT_COMMIT="$GIT_COMMIT" \
    --build-arg BUILD_TIME="$BUILD_TIME" \
    || fail "Docker build failed. Check the output above."

echo "  Starting services..."
$COMPOSE_CMD $COMPOSE_PROFILES up -d \
    || fail "Failed to start services."

echo "  Waiting for services to start (migrations, nginx, etc.)..."
RETRIES=40
until curl -skf https://localhost/api/health &>/dev/null || [ $RETRIES -eq 0 ]; do
    RETRIES=$((RETRIES - 1))
    sleep 3
done

if [ $RETRIES -eq 0 ]; then
    warn "  Health check did not pass within 2 minutes."
    warn "  Check logs with: $COMPOSE_CMD logs app"
    echo ""
    warn "  Common issues:"
    warn "    - Database migrations still running (wait and retry)"
    warn "    - Run '$COMPOSE_CMD logs app db nginx' for details"
else
    printf "  Health check:     "; ok
fi
echo ""

# -----------------------------------------------------------------------
# Step 8: Bootstrap admin account
# -----------------------------------------------------------------------
info "Step 8/8: Bootstrap admin account"
echo "  Create the initial administrator account."
echo ""

read -rp "  Username: " ADMIN_USERNAME
read -rp "  Email: " ADMIN_EMAIL

while true; do
    read -rsp "  Password (min 8 chars): " ADMIN_PASSWORD
    echo ""
    if [ ${#ADMIN_PASSWORD} -lt 8 ]; then
        warn "  Password must be at least 8 characters."
        continue
    fi
    read -rsp "  Confirm password: " ADMIN_CONFIRM
    echo ""
    if [ "$ADMIN_PASSWORD" = "$ADMIN_CONFIRM" ]; then
        break
    else
        warn "  Passwords do not match. Try again."
    fi
done

REGISTER_RESPONSE=$(curl -sk -X POST "https://localhost/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USERNAME\",\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"_bootstrapAdmin\":true}" \
    -w "\n%{http_code}" 2>/dev/null) || true

HTTP_CODE=$(echo "$REGISTER_RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    printf "  Admin account:    "; ok
else
    BODY=$(echo "$REGISTER_RESPONSE" | head -n -1)
    warn "  Admin creation returned HTTP $HTTP_CODE: $BODY"
    warn "  If the app is still starting, wait a minute and run:"
    warn "    curl -sk -X POST https://localhost/api/auth/register \\"
    warn "      -H 'Content-Type: application/json' \\"
    warn "      -d '{\"username\":\"$ADMIN_USERNAME\",\"email\":\"$ADMIN_EMAIL\",\"password\":\"YOUR_PASSWORD\",\"_bootstrapAdmin\":true}'"
fi

# -----------------------------------------------------------------------
# Set up daily backup cron
# -----------------------------------------------------------------------
if ! crontab -l 2>/dev/null | grep -q "aquasim.*backup"; then
    (crontab -l 2>/dev/null; echo "0 3 * * * cd $PROJECT_DIR && $COMPOSE_CMD exec -T db pg_dump -U aquasim aquasim | gzip > /var/backups/aquasim/aquasim_\$(date +\\%Y\\%m\\%d).sql.gz 2>/dev/null") | crontab -
    sudo mkdir -p /var/backups/aquasim
    echo "  Daily backup cron installed (03:00 daily)."
fi

# -----------------------------------------------------------------------
# Final output
# -----------------------------------------------------------------------
echo ""
echo ""
echo -e "${CYAN}=============================================="
echo -e "  ${BOLD}AquaSim deployed successfully!${NC}"
echo -e "${CYAN}==============================================${NC}"
echo ""
echo -e "  ${BOLD}Access${NC}"
echo "  Local (LAN):   https://$(hostname -I | awk '{print $1}')"
echo "  Local:          https://localhost"
if [ -n "$TUNNEL_TOKEN" ]; then
echo "  Public:         $APP_URL"
fi
echo "  Admin console:  $APP_URL/admin"
echo "  Build:          $GIT_COMMIT ($BUILD_TIME)"
echo ""

if [ -n "$TUNNEL_TOKEN" ]; then
    echo -e "${CYAN}----------------------------------------------${NC}"
    echo -e "  ${BOLD}Cloudflare Tunnel Setup (finish this now)${NC}"
    echo -e "${CYAN}----------------------------------------------${NC}"
    echo ""
    echo "  The tunnel connector is running. You still need to"
    echo "  configure the public hostname in Cloudflare:"
    echo ""
    echo "  1. Go to ${BOLD}https://one.dash.cloudflare.com${NC}"
    echo "  2. Navigate to: Networks > Tunnels"
    echo "  3. Click on your tunnel > Public Hostname tab"
    echo "  4. Add a public hostname:"
    echo ""
    echo "     Subdomain:     $(echo "$APP_URL" | sed 's|https://||' | cut -d. -f1)"
    echo "     Domain:        $(echo "$APP_URL" | sed 's|https://||' | cut -d. -f2-)"
    echo "     Type:          HTTPS"
    echo "     URL:           nginx:443"
    echo ""
    echo "  5. Under 'Additional application settings' > TLS:"
    echo "     - Set ${BOLD}No TLS Verify${NC} to ${GREEN}ON${NC}"
    echo "       (Required because nginx uses a self-signed certificate)"
    echo ""
    echo "  6. Save. Your site will be live at:"
    echo "     ${BOLD}$APP_URL${NC}"
    echo ""
else
    echo -e "${CYAN}----------------------------------------------${NC}"
    echo -e "  ${BOLD}Cloudflare Tunnel (not configured)${NC}"
    echo -e "${CYAN}----------------------------------------------${NC}"
    echo ""
    echo "  AquaSim is only accessible on the local network."
    echo "  To add public access later:"
    echo ""
    echo "  1. Create a tunnel at https://one.dash.cloudflare.com"
    echo "     (Networks > Tunnels > Create)"
    echo "  2. Copy the tunnel token"
    echo "  3. Add it to $PROJECT_DIR/.env:"
    echo "     TUNNEL_TOKEN=eyJ..."
    echo "  4. Restart with the tunnel profile:"
    echo "     cd $PROJECT_DIR"
    echo "     docker compose --profile tunnel up -d"
    echo "  5. Add a Public Hostname in Cloudflare dashboard:"
    echo "     Type: HTTPS / URL: nginx:443"
    echo "     TLS > No TLS Verify: ON"
    echo ""
fi

echo -e "${CYAN}----------------------------------------------${NC}"
echo -e "  ${BOLD}GitHub Webhook (auto-deploy on push)${NC}"
echo -e "${CYAN}----------------------------------------------${NC}"
echo ""
echo "  Endpoint: $APP_URL/api/webhooks/github-deploy"
echo "  Secret:   $GITHUB_WEBHOOK_SECRET"
echo ""
echo "  In your GitHub repo: Settings > Webhooks > Add webhook"
echo "  Payload URL:   $APP_URL/api/webhooks/github-deploy"
echo "  Content type:  application/json"
echo "  Secret:        $GITHUB_WEBHOOK_SECRET"
echo "  Events:        Just the push event"
echo ""

echo -e "${CYAN}----------------------------------------------${NC}"
echo -e "  ${BOLD}Useful commands${NC}"
echo -e "${CYAN}----------------------------------------------${NC}"
echo ""
echo "  View logs:      docker compose logs -f app"
echo "  Restart:        docker compose restart"
echo "  Rebuild:        bash deploy.sh"
echo "  Manual backup:  bash infra/scripts/backup.sh"
echo "  Stop all:       docker compose --profile tunnel down"
echo ""
echo -e "${CYAN}==============================================${NC}"
echo ""
