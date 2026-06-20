#!/bin/bash
set -e

SERVER="167.86.121.94"
PASS='ew4Gp2p?oFnw6Wix'
SSH_OPTS="-o LogLevel=ERROR -o IPQoS=none -o StrictHostKeyChecking=no -o ConnectTimeout=30 -o ServerAliveInterval=30 -o ServerAliveCountMax=5"

remote_cmd() {
    sshpass -p "$PASS" ssh $SSH_OPTS root@$SERVER "$1"
}

remote_scp() {
    sshpass -p "$PASS" scp $SSH_OPTS "$1" "root@$SERVER:$2"
}

echo "=== Step 1: Creating directories ==="
remote_cmd "mkdir -p /var/www/crmapp/backend /var/www/crmapp/frontend"
echo "Done."

echo "=== Step 2: Uploading database backup ==="
remote_scp "/home/abdelrahman/Desktop/crmapp_backup.sql" "/tmp/crmapp_backup.sql"
echo "Done."

echo "=== Step 3: Restoring database ==="
remote_cmd "sudo -u postgres psql -c 'DROP DATABASE IF EXISTS crm_app;' && sudo -u postgres psql -c 'CREATE DATABASE crm_app;' && sudo -u postgres psql crm_app < /tmp/crmapp_backup.sql"
echo "Done."

echo "=== Step 4: Uploading backend ==="
cd /home/abdelrahman/crmapp
tar czf /tmp/backend.tar.gz --exclude='node_modules' --exclude='.env' backend/
remote_scp "/tmp/backend.tar.gz" "/tmp/backend.tar.gz"
remote_cmd "cd /var/www/crmapp && rm -rf backend && tar xzf /tmp/backend.tar.gz"
echo "Done."

echo "=== Step 5: Uploading frontend dist ==="
tar czf /tmp/frontend.tar.gz frontend/dist/
remote_scp "/tmp/frontend.tar.gz" "/tmp/frontend.tar.gz"
remote_cmd "cd /var/www/crmapp && rm -rf frontend && tar xzf /tmp/frontend.tar.gz"
echo "Done."

echo "=== Step 6: Creating backend .env ==="
remote_cmd "cat > /var/www/crmapp/backend/.env << 'ENVEOF'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crm_app?schema=public
JWT_SECRET=j4SBxV4GHvdul5AJFoiydAxc4yEf9JQvHbGrbCksfOUmXDNZsrSfppz/BVqiyZHq
JWT_EXPIRES_IN=1d
PORT=5000
NODE_ENV=production
CORS_CREDENTIALS=true
TRUST_PROXY=true
JSON_BODY_LIMIT=1mb
REJECTED_RETRY_DAYS=28
WORK_TIMEZONE=Africa/Cairo
ENVEOF"
echo "Done."

echo "=== Step 7: Installing backend dependencies ==="
remote_cmd "cd /var/www/crmapp/backend && npm install --production && npx prisma generate"
echo "Done."

echo "=== Step 8: Starting backend with PM2 ==="
remote_cmd "cd /var/www/crmapp/backend && pm2 delete crm-backend 2>/dev/null || true && pm2 start src/server.js --name crm-backend && pm2 save && pm2 startup systemd -u root --hp /root 2>/dev/null || true"
echo "Done."

echo "=== Step 9: Configuring Nginx ==="
remote_cmd "cat > /etc/nginx/sites-available/crmapp << 'NGINXEOF'
server {
    listen 80;
    server_name 167.86.121.94;

    # Frontend
    root /var/www/crmapp/frontend/dist;
    index index.html;

    # API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        client_max_body_size 10m;
    }

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/crmapp /etc/nginx/sites-enabled/crmapp
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx"
echo "Done."

echo ""
echo "============================================"
echo "  DEPLOYMENT COMPLETE!"
echo "  Access your CRM at: http://167.86.121.94"
echo "============================================"
