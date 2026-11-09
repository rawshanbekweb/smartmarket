#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 22.04/24.04 VPS. Run as root after reading it.
#
# Installs Docker, creates the unprivileged `deploy` user GitHub Actions logs in as,
# turns off SSH password login, enables the firewall (22/80/443), fail2ban and
# automatic security updates, and prepares /opt/smartmarket.
#
# IMPORTANT: your own SSH public key must already be in /root/.ssh/authorized_keys,
# otherwise disabling password login locks you out.
set -euo pipefail

DEPLOY_USER=deploy
APP_DIR=/opt/smartmarket

if [ ! -s /root/.ssh/authorized_keys ]; then
  echo "No SSH key in /root/.ssh/authorized_keys — add yours first (ssh-copy-id root@server)." >&2
  exit 1
fi

apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl ufw fail2ban unattended-upgrades

# Docker Engine + compose plugin (official convenience script)
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/backups" "$APP_DIR/db-init"

sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh 2>/dev/null || systemctl reload sshd

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades
timedatectl set-timezone Asia/Tashkent

echo
echo "Done. Next:"
echo "  1. add the GitHub Actions deploy PUBLIC key to /home/$DEPLOY_USER/.ssh/authorized_keys"
echo "  2. create $APP_DIR/.env from infrastructure/deploy/.env.production.example (chmod 600, owner $DEPLOY_USER)"
echo "  3. run the Deploy workflow on GitHub"
