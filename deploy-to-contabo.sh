#!/bin/bash
set -euo pipefail

: "${DEPLOY_SERVER:?Set DEPLOY_SERVER, for example 203.0.113.10}"
: "${DATABASE_URL:?Set DATABASE_URL for the remote backend}"
: "${JWT_SECRET:?Set JWT_SECRET for the remote backend}"
: "${ALLOWED_ORIGINS:?Set ALLOWED_ORIGINS for the production frontend origin}"

DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_HOST="${DEPLOY_USER}@${DEPLOY_SERVER}"
APP_ROOT="${APP_ROOT:-/var/www/crmapp}"
BACKUP_SQL="${BACKUP_SQL:-}"
FRONTEND_DIST="${FRONTEND_DIST:-frontend/dist}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-$DEPLOY_SERVER}"
ENABLE_LETSENCRYPT="${ENABLE_LETSENCRYPT:-false}"
ACCESS_SCHEME="http"
SSH_OPTS=(
  -o LogLevel=ERROR
  -o IPQoS=none
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=30
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=5
)

ssh_cmd=(ssh "${SSH_OPTS[@]}")
scp_cmd=(scp "${SSH_OPTS[@]}")

if [[ -n "${DEPLOY_SSH_PASSWORD:-}" ]]; then
  ssh_cmd=(sshpass -p "$DEPLOY_SSH_PASSWORD" ssh "${SSH_OPTS[@]}")
  scp_cmd=(sshpass -p "$DEPLOY_SSH_PASSWORD" scp "${SSH_OPTS[@]}")
fi

if [[ "$ENABLE_LETSENCRYPT" == "true" ]]; then
  : "${CERTBOT_EMAIL:?Set CERTBOT_EMAIL when ENABLE_LETSENCRYPT=true}"

  if [[ "$DEPLOY_DOMAIN" =~ ^[0-9.]+$ ]]; then
    echo "DEPLOY_DOMAIN must be a real domain name when ENABLE_LETSENCRYPT=true."
    exit 1
  fi
fi

remote_cmd() {
  "${ssh_cmd[@]}" "$DEPLOY_HOST" "$1"
}

remote_scp() {
  "${scp_cmd[@]}" "$1" "$DEPLOY_HOST:$2"
}

remote_write() {
  local remote_path="$1"
  "${ssh_cmd[@]}" "$DEPLOY_HOST" "cat > '$remote_path'"
}

echo "=== Step 1: Creating directories ==="
remote_cmd "mkdir -p '$APP_ROOT/backend' '$APP_ROOT/frontend'"
echo "Done."

if [[ -n "$BACKUP_SQL" ]]; then
  echo "=== Step 2: Uploading and restoring database backup ==="
  remote_scp "$BACKUP_SQL" "/tmp/crmapp_backup.sql"
  remote_cmd "sudo -u postgres psql -c 'DROP DATABASE IF EXISTS crm_app;' && sudo -u postgres psql -c 'CREATE DATABASE crm_app;' && sudo -u postgres psql crm_app < /tmp/crmapp_backup.sql"
  echo "Done."
else
  echo "=== Step 2: Skipping database restore (BACKUP_SQL not set) ==="
fi

echo "=== Step 3: Uploading backend ==="
tar czf /tmp/backend.tar.gz --exclude='node_modules' --exclude='.env' backend/
remote_scp "/tmp/backend.tar.gz" "/tmp/backend.tar.gz"
remote_cmd "cd '$APP_ROOT' && rm -rf backend && tar xzf /tmp/backend.tar.gz"
echo "Done."

echo "=== Step 4: Uploading frontend dist ==="
if [[ ! -d "$FRONTEND_DIST" ]]; then
  echo "Missing frontend dist directory: $FRONTEND_DIST"
  echo "Run: cd frontend && npm run build"
  exit 1
fi
tar czf /tmp/frontend.tar.gz "$FRONTEND_DIST"
remote_scp "/tmp/frontend.tar.gz" "/tmp/frontend.tar.gz"
remote_cmd "cd '$APP_ROOT' && rm -rf frontend && tar xzf /tmp/frontend.tar.gz"
echo "Done."

echo "=== Step 5: Creating backend .env ==="
remote_write "$APP_ROOT/backend/.env" <<ENVEOF
DATABASE_URL=${DATABASE_URL}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=${JWT_EXPIRES_IN:-1d}
PORT=${PORT:-5000}
NODE_ENV=production
CORS_CREDENTIALS=${CORS_CREDENTIALS:-true}
TRUST_PROXY=${TRUST_PROXY:-1}
JSON_BODY_LIMIT=${JSON_BODY_LIMIT:-1mb}
REJECTED_RETRY_DAYS=${REJECTED_RETRY_DAYS:-28}
WORK_TIMEZONE=${WORK_TIMEZONE:-Africa/Cairo}
ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
AUTH_COOKIE_NAME=${AUTH_COOKIE_NAME:-crm_access_token}
AUTH_COOKIE_SAME_SITE=${AUTH_COOKIE_SAME_SITE:-lax}
AUTH_COOKIE_SECURE=${AUTH_COOKIE_SECURE:-true}
AUTH_COOKIE_MAX_AGE_HOURS=${AUTH_COOKIE_MAX_AGE_HOURS:-24}
AUTH_RATE_LIMIT_WINDOW_MINUTES=${AUTH_RATE_LIMIT_WINDOW_MINUTES:-15}
AUTH_RATE_LIMIT_MAX=${AUTH_RATE_LIMIT_MAX:-50}
ENVEOF
echo "Done."

echo "=== Step 6: Installing backend dependencies ==="
remote_cmd "cd '$APP_ROOT/backend' && npm ci && npm run prisma:generate && npm run security:validate-env && npm run data:check-duplicates && npm run db:migrate:deploy && npm prune --omit=dev"
echo "Done."

echo "=== Step 7: Starting backend with PM2 ==="
remote_cmd "cd '$APP_ROOT/backend' && pm2 delete crm-backend 2>/dev/null || true && pm2 start src/server.js --name crm-backend && pm2 save && pm2 startup systemd -u '$DEPLOY_USER' --hp \"\$(eval echo ~$DEPLOY_USER)\" 2>/dev/null || true"
echo "Done."

echo "=== Step 8: Configuring Nginx ==="
remote_write "/etc/nginx/sites-available/crmapp" <<NGINXEOF
server {
    listen 80;
    server_name ${DEPLOY_DOMAIN};

    root ${APP_ROOT}/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        client_max_body_size 10m;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
    }
}
NGINXEOF
remote_cmd "ln -sf /etc/nginx/sites-available/crmapp /etc/nginx/sites-enabled/crmapp && rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl restart nginx"

if [[ "$ENABLE_LETSENCRYPT" == "true" ]]; then
  echo "=== Step 9: Enabling HTTPS with Let's Encrypt ==="
  remote_cmd "apt-get update && apt-get install -y certbot python3-certbot-nginx && certbot --nginx -d '$DEPLOY_DOMAIN' --non-interactive --agree-tos -m '$CERTBOT_EMAIL' --redirect && systemctl reload nginx"
  ACCESS_SCHEME="https"
fi
echo "Done."

echo ""
echo "============================================"
echo "  DEPLOYMENT COMPLETE"
echo "  Access your CRM at: ${ACCESS_SCHEME}://${DEPLOY_DOMAIN}"
echo "============================================"
