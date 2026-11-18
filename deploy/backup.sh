#!/usr/bin/env bash
# Cadangan harian basis data dan media SIWAK. Menyimpan 30 hari terakhir.
# Kredensial MariaDB dibaca dari berkas MY_CNF (bawaan ~/.my.cnf), izin 600:
#   [client]
#   user=siwak
#   password=...
# Pasang di cron, contoh pukul 02:30:
#   30 2 * * * bash /opt/siwak-server/deploy/backup.sh >> /var/log/siwak-backup.log 2>&1
# Di server bersama, pakai berkas terpisah agar login mysql pengguna lain tidak berubah:
#   30 2 * * * MY_CNF=~/.siwak-my.cnf BACKUP_DIR=~/backups/siwak MEDIA_DIR=~/siwak-data/media bash ~/siwak-server/deploy/backup.sh
set -euo pipefail
umask 077 # cadangan berisi data pengurus: hanya pemilik yang boleh membaca

BACKUP_DIR="${BACKUP_DIR:-/var/backups/siwak}"
MEDIA_DIR="${MEDIA_DIR:-/var/lib/siwak/media}"
STAMP="$(date +%Y%m%d-%H%M)"

mkdir -p "$BACKUP_DIR"
MY_CNF="${MY_CNF:-$HOME/.my.cnf}"
mariadb-dump --defaults-extra-file="$MY_CNF" --single-transaction --routines siwak | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"
if [ -d "$MEDIA_DIR" ]; then
  tar -czf "$BACKUP_DIR/media-$STAMP.tar.gz" -C "$MEDIA_DIR" .
fi
find "$BACKUP_DIR" -type f -mtime +30 -delete

echo "$(date -Is) cadangan selesai: $BACKUP_DIR"
