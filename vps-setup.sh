#!/bin/bash
set -e

: "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD before running this script}"
POSTGRES_DB="${POSTGRES_DB:-crm_app}"

if [[ ! "$POSTGRES_DB" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "POSTGRES_DB contains invalid characters."
  exit 1
fi

# Update and install basic tools
apt-get update
apt-get install -y curl wget git build-essential nginx postgresql postgresql-contrib certbot python3-certbot-nginx

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2
npm install -g pm2

# Configure PostgreSQL
# Set postgres user password and create database
sudo -u postgres psql --set=postgres_password="$POSTGRES_PASSWORD" -c "ALTER USER postgres PASSWORD :'postgres_password';"
sudo -u postgres psql -c "CREATE DATABASE ${POSTGRES_DB};" || true

echo "Setup completed successfully."
