# SIWAK Server

Server, admin web, dan situs untuk **SIWAK** (Sistem Informasi Waktu Shalat), aplikasi Android TV
jam dan jadwal shalat untuk masjid dan musholla. Aplikasi TV ada di
[alfian-yds/siwak](https://github.com/alfian-yds/siwak).

Server ini membuat TV bisa diatur dari HP. Pengurus masuk dengan akun Google, menghubungkan TV dengan
kode 8 angka atau QR, lalu mengatur jadwal, suara, tampilan, teks berjalan, slide info masjid, dan hadits.
Pengurus juga bisa mengirim pengumuman segera, melihat pratinjau layar TV, memantau semua TV (ONLINE,
PERLU DICEK, OFFLINE), serta membuka atau memulai ulang SIWAK dari jauh. TV tetap menghitung jadwal
shalat sendiri dan tetap berjalan saat internet putus.

Layanan resmi: <https://siwak.alfianys.id> ·
**[Coba demo](https://siwak.alfianys.id/demo)** ·
**[Buku panduan (PDF)](https://siwak.alfianys.id/panduan.pdf)** ·
[Panduan online](https://siwak.alfianys.id/panduan)

![Beranda website pengurus](site/panduan/web-beranda.jpg)

## Isi

- **Situs publik:** halaman depan (dengan demo layar TV dan video pengenalan), demo interaktif di `/demo`
  (`admin-web/demo.html`, data contoh dari `/api/public/demo`), buku panduan (`site/panduan.md`, gambar di `site/panduan/`, versi PDF
  `site/panduan.pdf`), Kebijakan Privasi, dan Syarat Penggunaan.
- **Website pengurus** (`admin-web/`, disajikan di `/admin`): Beranda, Konten (pengumuman, teks berjalan,
  slide, hadits), Pengaturan (jadwal, suara, tampilan, riwayat perubahan), dan Pratinjau. Super admin
  mengelola masjid, pengguna, kumpulan hadits, dan semua TV.
- **API** (`api/`): API pengurus dan API perangkat untuk TV (penyambungan, heartbeat, bundle pengaturan
  dan konten, media, perintah jarak jauh).

## Teknologi

Node.js 22+, TypeScript, Fastify, Drizzle ORM, MariaDB 10.11. Admin web: React + Vite, disajikan
oleh server yang sama di `/admin`. Di server dijalankan dengan PM2 di belakang Nginx.

## Menjalankan di komputer sendiri

Prasyarat: Node.js 22.9 atau lebih baru dan MariaDB 10.11. Cara termudah di laptop adalah Docker
(server produksi tidak memakai Docker):

```bash
docker run -d --name siwak-mariadb -p 127.0.0.1:3308:3306 \
  -e MARIADB_ROOT_PASSWORD=sandi-root -e MARIADB_DATABASE=siwak \
  -e MARIADB_USER=siwak -e MARIADB_PASSWORD=sandi-anda \
  -v siwak-mariadb-data:/var/lib/mysql --restart unless-stopped \
  mariadb:10.11 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
```

Dengan Docker, `DATABASE_URL=mysql://siwak:sandi-anda@127.0.0.1:3308/siwak` dan langkah 1 di bawah
bisa dilewati.

```bash
# 1. Tanpa Docker: buat basis data (sekali saja) di konsol MariaDB:
#    CREATE DATABASE siwak CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
#    CREATE USER 'siwak'@'localhost' IDENTIFIED BY 'sandi-anda';
#    GRANT ALL PRIVILEGES ON siwak.* TO 'siwak'@'localhost';

# 2. Konfigurasi
cp .env.example .env        # lalu isi nilainya

# 3. Pasang, buat tabel, jalankan
npm install
npm run db:migrate:dev -w api
npm run build -w admin-web   # bangun admin web sekali
npm run dev
```

Server berjalan di <http://localhost:8080>. Cek dengan <http://localhost:8080/healthz>, lalu buka
<http://localhost:8080/admin> untuk masuk dengan email `SUPERADMIN_EMAIL`.

Saat mengubah tampilan admin web, jalankan juga `npm run dev:web` lalu buka
<http://localhost:5173/admin/>. Halaman ini memuat ulang otomatis dan meneruskan API ke port 8080.
Masuk tetap lewat port 8080 lebih dulu; cookie sesi berlaku untuk kedua port.

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Menjalankan server dengan muat-ulang otomatis |
| `npm run dev:web` | Menjalankan admin web dengan muat-ulang otomatis (port 5173) |
| `npm run build` | Membangun admin web dan server untuk produksi |
| `npm test` | Menjalankan pengujian |
| `npm run typecheck` | Pemeriksaan tipe TypeScript |
| `npm run db:generate` | Membuat berkas migrasi dari perubahan `api/src/db/schema.ts` |
| `npm run panduan:pdf` | Membuat ulang buku panduan `site/panduan.pdf` dari `site/panduan.md` (butuh Edge/Chrome dan poppler) |
| `npm run license:check` | Memastikan semua dependensi berlisensi yang diizinkan |
| `npm run license:list` | Mencetak daftar lisensi semua paket produksi |
| `npm run load-test` | Uji beban heartbeat ke server yang berjalan (lihat [panduan](docs/self-hosting.md)) |

## Memasang di VPS

Ikuti [docs/self-hosting.md](docs/self-hosting.md): dari VPS kosong sampai HTTPS aktif, termasuk
basis data, `.env`, PM2, Nginx, certbot, dan cadangan harian. Berkas pendukungnya ada di
[`deploy/`](deploy).

## Dokumen proyek

Kebutuhan, desain teknis, alur, dan skema basis data ada di [`docs/`](docs/README.md).

## Lisensi

MIT. Lihat [LICENSE](LICENSE) dan [NOTICE.md](NOTICE.md).
Dikembangkan oleh Alfian Yudisurya.

Pertanyaan, saran, dan laporan masalah: [GitHub Issues](https://github.com/alfian-yds/siwak-server/issues).
