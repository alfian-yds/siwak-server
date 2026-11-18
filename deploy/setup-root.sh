#!/usr/bin/env bash
# Langkah sekali jalan yang butuh hak root, untuk server yang sudah punya MariaDB, Nginx, dan certbot.
# Jalankan setelah .env diisi (DATABASE_URL dan SIWAK_PUBLIC_URL dibaca dari sana):
#   sudo bash ~/siwak-server/deploy/setup-root.sh
# Yang dilakukan:
#   1. Membuat basis data dan pengguna MariaDB sesuai DATABASE_URL (sandi tidak ditampilkan).
#   2. Memasang situs Nginx untuk domain di SIWAK_PUBLIC_URL, meneruskan ke HOST:PORT di .env.
#   3. Meminta sertifikat HTTPS dengan certbot dan mengalihkan HTTP ke HTTPS.
# Aman dijalankan ulang. Situs Nginx lain tidak diubah.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Jalankan dengan sudo." >&2; exit 1; fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
[ -f "$ENV_FILE" ] || { echo "Tidak ada $ENV_FILE" >&2; exit 1; }

get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '\r'; }
DB_URL="$(get DATABASE_URL)"
PUBLIC_URL="$(get SIWAK_PUBLIC_URL)"
PORT="$(get PORT)"
DOMAIN="$(echo "$PUBLIC_URL" | sed -E 's#^https?://##; s#/.*$##')"

# mysql://pengguna:sandi@host:port/basisdata
DB_USER="$(echo "$DB_URL" | sed -E 's#^mysql://([^:]+):.*#\1#')"
DB_PASS="$(echo "$DB_URL" | sed -E 's#^mysql://[^:]+:([^@]+)@.*#\1#')"
DB_NAME="$(echo "$DB_URL" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')"
for v in DB_USER DB_PASS DB_NAME DOMAIN PORT; do
  [ -n "${!v}" ] || { echo "Nilai $v kosong; periksa .env" >&2; exit 1; }
done
case "$DB_USER$DB_NAME" in *[!A-Za-z0-9_]*) echo "Nama pengguna/basis data hanya boleh huruf, angka, garis bawah." >&2; exit 1;; esac

echo "==> MariaDB: basis data '$DB_NAME' dan pengguna '$DB_USER'@'localhost'"
mariadb <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '${DB_PASS//\'/\'\'}';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '${DB_PASS//\'/\'\'}';
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '${DB_PASS//\'/\'\'}';
ALTER USER '$DB_USER'@'127.0.0.1' IDENTIFIED BY '${DB_PASS//\'/\'\'}';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

echo "==> Nginx: situs $DOMAIN -> 127.0.0.1:$PORT"
SITE="/etc/nginx/sites-available/siwak"
if [ ! -f "$SITE" ]; then
  sed -e "s#server_name siwak.alfianys.id;#server_name $DOMAIN;#" \
      -e "s#proxy_pass http://127.0.0.1:8090;#proxy_pass http://127.0.0.1:$PORT;#" \
      "$ROOT/deploy/nginx.conf.example" > "$SITE"
else
  echo "    $SITE sudah ada, tidak ditimpa"
fi
ln -sf "$SITE" /etc/nginx/sites-enabled/siwak
nginx -t
systemctl reload nginx

echo "==> HTTPS: certbot untuk $DOMAIN"
certbot --nginx -d "$DOMAIN" --non-interactive --redirect --keep-until-expiring
nginx -t
systemctl reload nginx

echo "==> Selesai. Cek: curl -I https://$DOMAIN/healthz"
