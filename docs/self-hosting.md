# Memasang server SIWAK di VPS

Panduan ini membawa server SIWAK dari VPS kosong sampai `https://<domain>/healthz` menjawab `ok`.
Contoh memakai domain `siwak.alfianys.id`; ganti dengan domain Anda bila memasang server sendiri.
Server berjalan **tanpa Docker**: Node.js + PM2 di belakang Nginx, basis data MariaDB.

Perkiraan waktu: 30–45 menit.

> **Server yang sudah menjalankan aplikasi lain** (Node lama, PM2, MariaDB, Nginx, dan certbot sudah
> ada): cukup clone repo ke folder pengguna biasa, pasang Node 22 lewat `nvm install 22` (Node bawaan
> sistem tidak berubah), isi `.env`, lalu jalankan `sudo bash deploy/setup-root.sh` (basis data,
> situs Nginx, HTTPS) dan `bash deploy/deploy.sh` (build, migrasi, PM2). `deploy.sh` otomatis memakai
> Node dari nvm sesuai `.nvmrc` hanya untuk proses SIWAK. Langkah 6 (mulai otomatis) dan 8 (cadangan)
> tetap berlaku.

## 0. Prasyarat

| Kebutuhan | Cek dengan | Catatan |
|---|---|---|
| Linux (Ubuntu/Debian) dengan akses `sudo` | | |
| Node.js **22.9 atau lebih baru** | `node -v` | Bila lebih lama, perbarui lewat [NodeSource](https://github.com/nodesource/distributions) atau `nvm` |
| MariaDB 10.11 | `mariadb --version` | Hanya mendengarkan `127.0.0.1` |
| PM2 | `pm2 --version` | `sudo npm install -g pm2` |
| Nginx dan certbot | `nginx -v`, `certbot --version` | `sudo apt install nginx certbot python3-certbot-nginx` |
| Port 8090 kosong | `ss -ltn \| grep 8090` | Tidak ada keluaran berarti kosong |
| DNS | `ping siwak.alfianys.id` | Data **A** domain mengarah ke IP VPS |
| Klien OAuth Google | Google Cloud Console | Alamat kembali `https://siwak.alfianys.id/auth/google/callback` sudah terdaftar |
| Kunci OpenWeather khusus server | openweathermap.org | |

## 1. Pengguna dan folder

Aplikasi berjalan dengan pengguna Linux biasa `siwak`, bukan root.

```bash
sudo adduser --disabled-password --gecos "" siwak
sudo mkdir -p /opt/siwak-server /var/lib/siwak/media /var/backups/siwak
sudo chown -R siwak:siwak /opt/siwak-server /var/lib/siwak /var/backups/siwak
```

## 2. Basis data

Buat sandi acak untuk pengguna basis data, simpan sementara di catatan aman Anda:

```bash
openssl rand -base64 24 | tr -d '/+='
```

Lalu di konsol MariaDB (`sudo mariadb`), ganti `SANDI` dengan sandi tadi:

```sql
CREATE DATABASE siwak CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'siwak'@'localhost' IDENTIFIED BY 'SANDI';
GRANT ALL PRIVILEGES ON siwak.* TO 'siwak'@'localhost';
FLUSH PRIVILEGES;
```

Pengguna `siwak` hanya punya hak atas basis data `siwak`, tidak atas basis data aplikasi lain.

## 3. Kode

```bash
sudo -iu siwak
git clone https://github.com/alfian-yds/siwak-server.git /opt/siwak-server
cd /opt/siwak-server
```

Semua langkah berikutnya dijalankan sebagai pengguna `siwak`, kecuali yang memakai `sudo`.

## 4. Konfigurasi `.env`

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

| Nama | Nilai untuk server produksi |
|---|---|
| `SIWAK_PUBLIC_URL` | `https://siwak.alfianys.id` |
| `HOST` | `127.0.0.1` |
| `PORT` | `8090` |
| `DATABASE_URL` | `mysql://siwak:SANDI@127.0.0.1:3306/siwak` |
| `MEDIA_DIR` | `/var/lib/siwak/media` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Dari Google Cloud Console |
| `OPENWEATHER_API_KEY` | Kunci khusus server |
| `SESSION_SECRET` | Acak, lihat perintah di bawah |
| `PIN_ENCRYPTION_KEY` | Acak, lihat perintah di bawah |
| `SUPERADMIN_EMAIL` | Email Google super admin pertama |
| `GITHUB_REPO` | `alfian-yds/siwak` |

Buat dua rahasia acak (jalankan dua kali, satu untuk masing-masing):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> `PIN_ENCRYPTION_KEY` masih wajib diisi demi kompatibilitas, walaupun sejak 2.0.0-rc.3 PIN TV tidak
> lagi dipakai. Simpan salinan `.env` di tempat aman di luar VPS.

Server menolak berjalan bila ada isian yang kosong atau salah, dan menyebut nama isiannya.

## 5. Pasang, buat tabel, jalankan

```bash
bash deploy/deploy.sh
```

Skrip ini memasang dependensi, membangun admin web dan server, menjalankan migrasi basis data, lalu
menjalankan proses `siwak` di PM2. Saat pertama kali jalan, server membuat akun super admin dari
`SUPERADMIN_EMAIL`.

Cek:

```bash
curl -s http://127.0.0.1:8090/healthz
# {"status":"ok","db":"ok"}
pm2 logs siwak --lines 30
```

## 6. Mulai otomatis dan rotasi log

```bash
pm2 startup        # salin dan jalankan perintah sudo yang dicetaknya
pm2 save
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 5
```

## 7. Nginx dan HTTPS

```bash
exit   # kembali ke pengguna dengan sudo
sudo cp /opt/siwak-server/deploy/nginx.conf.example /etc/nginx/sites-available/siwak
sudo ln -s /etc/nginx/sites-available/siwak /etc/nginx/sites-enabled/siwak
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d siwak.alfianys.id
```

certbot menambahkan blok HTTPS dan pengalihan HTTP ke HTTPS. Blok Nginx aplikasi lain tidak berubah.

Cek dari laptop: buka `https://siwak.alfianys.id/healthz`, lalu `https://siwak.alfianys.id/admin`
dan masuk dengan email super admin.

## 8. Cadangan harian

Sebagai pengguna `siwak`, simpan kredensial basis data agar `mariadb-dump` tidak meminta sandi:

```bash
sudo -iu siwak
cat > ~/.my.cnf <<'EOF'
[client]
user=siwak
password=SANDI
EOF
chmod 600 ~/.my.cnf
bash /opt/siwak-server/deploy/backup.sh     # uji sekali
crontab -e
```

Tambahkan baris berikut di crontab (setiap hari pukul 02.30):

```
30 2 * * * bash /opt/siwak-server/deploy/backup.sh >> /var/backups/siwak/backup.log 2>&1
```

Cadangan disimpan 30 hari di `/var/backups/siwak`. Sebaiknya salin juga secara berkala ke luar VPS.

## 9. Memperbarui server

```bash
sudo -iu siwak
bash /opt/siwak-server/deploy/deploy.sh
```

TV tetap berjalan selama pembaruan; yang terputus hanya admin web selama beberapa detik.

## 9a. Uji beban (opsional, setelah server berjalan)

Mensimulasikan 200 TV yang mengirim heartbeat tiap 60 detik, langsung ke Node (tanpa Nginx):

```bash
cd /opt/siwak-server && npm run load-test -- --tvs 200 --rounds 3 --spread 60
```

Skrip membuat masjid sementara "Uji beban …" berisi 200 TV di basis data, lalu menghapusnya lagi
di akhir (juga bila dihentikan dengan Ctrl+C). Hasil yang diharapkan: `p95 tersebar < 200 ms`
tanpa galat. Tambahkan `--burst` untuk melihat kasus terburuk saat semua TV mengirim serentak
(hanya sebagai informasi). Sebaiknya jalankan di luar jam ramai.

## 10. Bila ada masalah

| Gejala | Periksa |
|---|---|
| `502 Bad Gateway` | `pm2 status` dan `pm2 logs siwak`; pastikan `PORT=8090` di `.env` |
| Server berhenti dengan "Konfigurasi .env tidak lengkap atau salah" | Isian yang disebut di pesan itu |
| `healthz` menjawab `"db":"unreachable"` | `DATABASE_URL`, sandi, dan `sudo systemctl status mariadb` |
| Google menampilkan `redirect_uri_mismatch` | Alamat kembali di Google Cloud Console harus persis `https://siwak.alfianys.id/auth/google/callback` |
| Masuk berhasil tetapi langsung keluar lagi | `SIWAK_PUBLIC_URL` harus `https://...`; cookie sesi hanya dikirim lewat HTTPS |
| Cuaca tidak muncul di TV | `OPENWEATHER_API_KEY`; kunci baru OpenWeather bisa butuh beberapa jam sebelum aktif |
