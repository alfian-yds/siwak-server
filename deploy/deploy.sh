#!/usr/bin/env bash
# Memperbarui server SIWAK ke versi terbaru di branch main.
# Jalankan dari mana saja: bash ~/siwak-server/deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Node 22+ (lihat .nvmrc). Bila nvm terpasang, pakai Node dari nvm tanpa mengubah Node bawaan sistem.
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  set +u
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use --silent >/dev/null
  set -u
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Butuh Node 22 atau lebih baru (sekarang $(node -v)). Pasang dengan: nvm install 22" >&2
  exit 1
fi
export SIWAK_NODE="$(command -v node)"

echo "==> Mengambil kode terbaru"
git pull --ff-only

echo "==> Memasang dependensi"
# --include=dev: TypeScript dan Vite dibutuhkan untuk membangun, walau NODE_ENV=production.
npm ci --include=dev

echo "==> Membangun"
npm run build

echo "==> Menjalankan migrasi basis data"
npm run db:migrate

echo "==> Memuat ulang proses"
if pm2 describe siwak > /dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.cjs --update-env
else
  pm2 start deploy/ecosystem.config.cjs
  pm2 save
fi

echo "==> Selesai. Cek: curl -s http://127.0.0.1:8090/healthz"
