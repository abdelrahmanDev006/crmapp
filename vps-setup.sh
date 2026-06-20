#!/bin/bash
set -e

# Update and install basic tools
apt-get update
apt-get install -y curl wget git build-essential nginx postgresql postgresql-contrib

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2
npm install -g pm2

# Configure PostgreSQL
# Set postgres user password and create database
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE crm_app;" || true

echo "Setup completed successfully."
