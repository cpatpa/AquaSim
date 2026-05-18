#!/bin/bash
set -e

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
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

# -----------------------------------------------------------------------
# Step 1: System prerequisites
# -----------------------------------------------------------------------
info "Step 1/8: System prerequisites"

check_cmd() {
    local cmd=$1
    local pkg=$2
    printf "  Checking for %-20s" "$cmd..."
    if command -v "$cmd" &>/dev/null; then
        echo -e "${GREEN}[installed]${NC}"
    else
        echo -e "${YELLOW}[installing]${NC}"
        sudo apt-get update -qq && sudo apt-get install -y -qq "$pkg" || fail "Could not install $pkg"
    fi
}

check_cmd "docker" "docker.io"
check_cmd "git" "git"
check_cmd "openssl" "openssl"
check_cmd "curl" "curl"

printf "  Checking for %-20s" "docker compose..."
if docker compose version &>/dev/null; then
    echo -e "${GREEN}[installed]${NC}"
else
    echo -e "${YELLOW}[installing]${NC}"
    sudo apt-get update -qq && sudo apt-get install -y -qq docker-compose-plugin || fail "Could not install docker compose"
fi

if ! groups "$USER" | grep -q docker; then
    warn "  Adding $USER to docker group (you may need to log out and back in)..."
    sudo usermod -aG docker "$USER"
fi

echo ""

# -----------------------------------------------------------------------
# Step 2: Planned URL
# -----------------------------------------------------------------------
info "Step 2/8: Planned URL"
echo "  What URL will this instance be accessible at?"
echo "  This is used for CORS, email links, and WebAuthn origin."
echo ""
read -rp "  URL (e.g. https://aquasim.example.com): " APP_URL
APP_URL="${APP_URL:-https://localhost}"
APP_URL="${APP_URL%/}"
echo ""

# -----------------------------------------------------------------------
# Step 3: Generate self-signed certificates
# -----------------------------------------------------------------------
info "Step 3/8: Generate self-signed certificates"
bash "$SCRIPT_DIR/generate-certs.sh"
echo ""

# -----------------------------------------------------------------------
# Step 4: Cloudflare Tunnel
# -----------------------------------------------------------------------
info "Step 4/8: Cloudflare Tunnel"
echo "  To set up public access via Cloudflare:"
echo "  1. Go to Cloudflare Zero Trust > Networks > Tunnels"
echo "  2. Create a tunnel and copy the token"
echo ""
read -rp "  Tunnel token (leave blank to skip): " TUNNEL_TOKEN
TUNNEL_TOKEN="${TUNNEL_TOKEN:-}"
echo ""

# -----------------------------------------------------------------------
# Step 5: Email configuration
# -----------------------------------------------------------------------
info "Step 5/8: Email configuration"
echo "  Email is required for password reset functionality."
echo ""
echo "  [1] SMTP (self-hosted or external)"
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

GITHUB_WEBHOOK_SECRET=$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)
printf "  Webhook secret:   "; echo -e "${GREEN}[generated]${NC}"

cat > "$PROJECT_DIR/.env" << ENVEOF
APP_URL=$APP_URL
CORS_ORIGIN=$APP_URL
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
TUNNEL_TOKEN=$TUNNEL_TOKEN
GITHUB_WEBHOOK_SECRET=$GITHUB_WEBHOOK_SECRET
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_FROM=$SMTP_FROM
GIT_COMMIT=$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo "dev")
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ENVEOF

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

echo "  Building containers (this may take a few minutes)..."
docker compose $COMPOSE_PROFILES build \
    --build-arg GIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo dev)" \
    --build-arg BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "  Starting services..."
docker compose $COMPOSE_PROFILES up -d

echo "  Waiting for health check..."
RETRIES=30
until curl -skf http://localhost:3000/api/health &>/dev/null || [ $RETRIES -eq 0 ]; do
    RETRIES=$((RETRIES - 1))
    sleep 2
done

if [ $RETRIES -eq 0 ]; then
    warn "  Health check did not pass within 60 seconds."
    warn "  Check logs with: docker compose logs app"
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
    read -rsp "  Password: " ADMIN_PASSWORD
    echo ""
    read -rsp "  Confirm password: " ADMIN_CONFIRM
    echo ""
    if [ "$ADMIN_PASSWORD" = "$ADMIN_CONFIRM" ]; then
        break
    else
        warn "  Passwords do not match. Try again."
    fi
done

REGISTER_RESPONSE=$(curl -sk -X POST "http://localhost:3000/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USERNAME\",\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"_bootstrapAdmin\":true}" \
    -w "\n%{http_code}" 2>/dev/null)

HTTP_CODE=$(echo "$REGISTER_RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    printf "  Admin account:    "; ok
else
    BODY=$(echo "$REGISTER_RESPONSE" | head -n -1)
    warn "  Admin creation returned HTTP $HTTP_CODE: $BODY"
    warn "  You can create the admin account manually later."
fi

# -----------------------------------------------------------------------
# Set up backup cron
# -----------------------------------------------------------------------
if ! crontab -l 2>/dev/null | grep -q "aquasim.*backup"; then
    (crontab -l 2>/dev/null; echo "0 3 * * * $SCRIPT_DIR/backup.sh >> /var/log/aquasim-backup.log 2>&1") | crontab -
    echo "  Daily backup cron job installed (03:00)."
fi

echo ""
echo -e "${CYAN}=============================================="
echo "  AquaSim deployed successfully!"
echo "=============================================="
echo ""
echo "  Local:    https://localhost"
if [ -n "$TUNNEL_TOKEN" ]; then
echo "  Public:   $APP_URL"
fi
echo "  Admin:    $APP_URL/admin"
echo "  Build:    $(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo dev)"
echo ""
echo "  Webhook:  $APP_URL/api/webhooks/github-deploy"
echo "  Secret:   $GITHUB_WEBHOOK_SECRET"
echo ""
echo "  Useful commands:"
echo "    docker compose logs -f app    View app logs"
echo "    docker compose restart        Restart all services"
echo "    bash infra/scripts/backup.sh  Manual backup"
echo -e "==============================================${NC}"
echo ""
