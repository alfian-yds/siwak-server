# 06 · Implementation Plan · SIWAK V2

| | |
|---|---|
| **Versi dokumen** | 1.2 · 2026-11-16 |
| **Mengacu pada** | Seluruh dokumen 01–05 |

Rencana kerja dibagi menjadi Tahap 0 sampai 3 lalu rilis 2.0. Setiap tugas punya nomor, pelaksana,
ukuran relatif (**S** kecil, **M** sedang, **L** besar), dan kriteria selesai.
Pelaksana: **C** = kode & dokumen, **A** = akun, server, uji di TV, dan keputusan.

Status ditandai langsung di dokumen ini: `[ ]` belum, `[~]` berjalan, `[x]` selesai.


---

## Aturan kerja

- **Definisi selesai** untuk setiap tugas kode:
  1. Kode berjalan dan lolos uji otomatis yang relevan.
  2. Dokumen yang terdampak (TRD, Backend Schema, App Flow) diperbarui di commit yang sama.
  3. Dependensi atau aset baru tercatat di `NOTICE.md` dan lolos kebijakan lisensi (TRD §3).
  4. Perubahan aplikasi TV sudah dicoba di emulator; perubahan tampilan juga dicoba di TV asli.
- **Cabang**: `main` selalu stabil. Pekerjaan di cabang `feat/<nama>`, digabung lewat pull request.
- **Commit**: Bahasa Indonesia, ringkas, tanpa baris atribusi alat bantu.
- **Rilis uji** aplikasi TV diunggah sebagai **pre-release** di GitHub. Fitur update di TV hanya membaca
  rilis terbaru yang bukan pre-release, jadi TV di masjid tidak ikut menerima versi uji.
- **Pengembangan lokal**: MariaDB 10.11 di kontainer Docker `siwak-mariadb` (port `127.0.0.1:3308`, khusus
  laptop; server produksi tetap tanpa Docker), API `npm run dev` di `localhost:8080`.
  Emulator TV memakai alamat server `http://10.0.2.2:8080` (lalu lintas tanpa HTTPS hanya diizinkan
  di build debug).

---

## Tahap 0 · Kebersihan legal & persiapan

Hasil: aplikasi TV **v1.3** bebas komponen bermasalah, dokumen legal terbit, akun dan server siap.

| # | Tugas | Pel. | Uk. | Kriteria selesai |
|---|---|---|---|---|
| [x] 0.1 | Hapus modul ACJU / MosqueClock backend (Sri Lanka) beserta `itextg` dan `jsoup` | C | M | `./gradlew :app:dependencies` tidak memuat `itextg` dan `jsoup`; jadwal dan tanggal Hijriah tetap benar di emulator |
| [x] 0.2 | Suara bip dan tik dipertahankan; sumber dan lisensinya dicatat di `NOTICE.md` | C | S | Tercatat di `NOTICE.md` |
| [x] 0.3 | Layar Tentang di TV: tautan Kebijakan Privasi, Syarat, Lisensi, dan atribusi "Data cuaca dari OpenWeather" | C | S | Teks tampil di layar Tentang |
| [x] 0.4 | Lengkapi `LICENSE`, `NOTICE.md`, `PRIVACY.md`, `TERMS.md` (kontak, lokasi server, tanggal berlaku) | A | S | Semua isian terisi |
| [x] 0.5 | SIWAK menjadi proyek mandiri: hapus nama institusi dari aplikasi dan dokumen | C | S | Tidak ada lagi nama institusi di aplikasi, README, dan dokumen |
| [ ] 0.6 | Buka issue di repo MosqueClock meminta konfirmasi lisensi MIT dan penambahan file LICENSE (teks disiapkan C) | A | S | Issue terbuka, tautannya dicatat di `NOTICE.md` |
| [ ] 0.7 | Rilis aplikasi TV **v1.3** | C + A | S | APK bertanda tangan terbit di GitHub Releases |
| [ ] 0.8 | Arahkan DNS `siwak.alfianys.id` (data A) ke IP VPS | A | S | `ping siwak.alfianys.id` menuju IP VPS |
| [x] 0.9 | Google Cloud Console: buat proyek, layar persetujuan OAuth (eksternal, nama SIWAK, domain siwak.alfianys.id, tautan privasi dan syarat), klien OAuth Web dengan alamat kembali `https://siwak.alfianys.id/auth/google/callback` dan `http://localhost:8080/auth/google/callback` | A (dipandu C) | S | Client ID dan Secret tersimpan aman, tidak dikirim lewat chat |
| [x] 0.10 | Buat kunci API OpenWeather **baru** khusus server | A | S | Kunci tersimpan aman |
| [x] 0.11 | VPS: MariaDB 10.11 dan PM2 6 sudah ada (dicek 2026-11-16); pastikan port 8090 kosong, Nginx dan certbot aktif | A (dipandu C) | S | `ss -ltn` tidak menunjukkan 8090; `nginx -v` dan `certbot --version` jalan |
| [x] 0.12 | Buat repositori publik `alfian-yds/siwak-server` | A | S | Repo ada; dokumen 01–06 dipindah ke `docs/` saat push pertama |
| [x] 0.13 | Tentukan email Google super admin pertama | A | S | email pemilik (diatur di `.env`, tidak dicatat di repo) |
| [x] 0.14 | MariaDB 10.11 untuk pengembangan (kontainer Docker `siwak-mariadb`) | C | S | Migrasi berjalan di basis data uji |

---

## Tahap 1 · Fondasi online

Hasil: TV bisa dihubungkan ke siwak.alfianys.id dan seluruh pengaturan jadwal, suara, tampilan, serta
teks berjalan bisa diubah dari HP.
Rilis uji: server `2.0.0-alpha`, aplikasi TV `2.0.0-alpha` (pre-release).

### Server

| # | Tugas | Pel. | Uk. | Kriteria selesai |
|---|---|---|---|---|
| [x] 1.1 | Kerangka repo: `api`, `admin-web`, `site`, `deploy`; CI lint, cek tipe, uji, cek lisensi | C | M | CI hijau pada pull request pertama |
| [x] 1.2 | Skema database dan migrasi untuk tabel Tahap 1 (Schema §3.1–3.3, `running_texts`, `weather_cache`, `app_state`, `activity_logs`) | C | M | Migrasi berjalan di database kosong |
| [x] 1.3 | Login Google (OIDC + PKCE), sesi, CSRF, super admin pertama dari `SUPERADMIN_EMAIL` | C | M | Email terdaftar bisa masuk; email lain melihat pesan "belum terdaftar" |
| [x] 1.4 | Halaman **Pengguna** dan **Masjid** (super admin) | C | M | Tambah/ubah/nonaktifkan pengguna; tambah/arsip masjid |
| [x] 1.5 | API dan halaman **Jadwal**, **Suara**, **Tampilan** sesuai Schema §4 | C | L | Semua field §4 bisa diubah; nilai di luar batas ditolak dengan pesan jelas |
| [x] 1.6 | **Hubungkan TV**: API pairing + halaman dengan ketik kode dan Scan QR | C | M | Alur App Flow §4.3 berjalan dari HP |
| [x] 1.7 | API TV: heartbeat, bundle (pengaturan + teks berjalan), cuaca + pekerjaan cuaca 30 menit | C | M | Uji integrasi heartbeat → bundle lolos |
| [x] 1.7a | **Pemantauan & perintah jarak jauh** (server + web): status tampil/latar belakang, `device_commands`, tombol Buka SIWAK / Sinkron sekarang / Mulai ulang, pekerjaan kedaluwarsa | C | M | Sesuai TRD §7.4 dan App Flow §4.10a; uji integrasi perintah pending → delivered → done |
| [x] 1.8 | **PIN TV**: dibuat saat terhubung, lihat 30 detik, buat baru, tercatat di log | C | S | Sesuai App Flow §4.9 |
| [x] 1.9 | **Teks berjalan**: tambah, ubah, urut, aktif, tanggal mulai/selesai | C | S | Sesuai App Flow §4.5 |
| [x] 1.10 | Situs: halaman depan, `/privasi`, `/syarat` dari `PRIVACY.md` dan `TERMS.md` | C | S | Halaman tampil di siwak.alfianys.id |
| [x] 1.11 | Pemasangan: `ecosystem.config.cjs` (PM2), `deploy.sh`, `backup.sh`, contoh Nginx, `.env.example`, panduan membuat basis data dan pengguna MariaDB | C | M | Mengikuti panduan di VPS bersih, server langsung jalan |
| [x] 1.12 | Pasang di VPS: buat basis data `siwak`, isi `.env`, `pm2 start`, tambah blok Nginx, certbot | A (dipandu C) | S | `https://siwak.alfianys.id/healthz` menjawab `ok` |

### Aplikasi TV

| # | Tugas | Pel. | Uk. | Kriteria selesai |
|---|---|---|---|---|
| [x] 1.13 | `ServerStore`, `SiwakApi`, `ServerSyncManager` (heartbeat 60 dtk, bundle, terapkan atomik) | C | L | Mengubah koreksi menit di web mengubah jadwal di emulator ≤ 60 detik |
| [x] 1.14 | Pemetaan pengaturan server ke `AppSettings` (Schema §4.1) | C | M | Uji unit pemetaan lolos untuk semua field |
| [x] 1.15 | Layar **Hubungkan** (kode + QR), **Masukkan PIN**, **Pengaturan terbatas**, alamat server, lepas | C | M | Alur App Flow §2.2–2.5 berjalan |
| [x] 1.16 | Cuaca dari server untuk TV terhubung | C | S | Cuaca tampil tanpa kunci API di TV |
| [x] 1.16a | TV: heartbeat dari layanan latar (tetap jalan saat SIWAK tertutup), lapor tampil/latar belakang + izin, jalankan perintah, opsi Selalu kembali ke SIWAK | C | M | Di emulator Android 10+: buka aplikasi lain → web menunjukkan "latar belakang" ≤ 60 detik → Buka SIWAK → SIWAK kembali tampil |
| [ ] 1.17 | Uji lapangan di masjid uji coba (daftar periksa Tahap 1 di bawah) | A | M | Semua butir daftar periksa lulus |

**Daftar periksa Tahap 1 (di TV asli)**

- [ ] TV v1.3 diperbarui ke 2.0-alpha tanpa kehilangan pengaturan, berjalan di mode mandiri.
- [ ] Hubungkan TV dengan ketik kode, lalu ulangi dengan Scan QR.
- [ ] Ubah koreksi Subuh +2 menit di HP → TV berubah ≤ 60 detik → suara bip tepat pada waktu baru.
- [ ] Ubah teks berjalan → tampil ≤ 60 detik.
- [ ] Cabut kabel internet 1 jam → jadwal dan teks tetap tampil → pasang lagi → sinkron sendiri.
- [ ] Lupa PIN → lihat dari web → masuk pengaturan di TV.
- [ ] Lepas TV dari web → TV kembali ke mode mandiri dengan pengaturan terakhir.
- [ ] Buka aplikasi lain di TV → web menunjukkan "SIWAK di latar belakang" → tekan Buka SIWAK → SIWAK tampil lagi.

---

## Tahap 2 · Konten & tampilan baru

Hasil: tata letak Galeri dengan ilustrasi, hadits, dan panel informasi; pustaka hadits dengan verifikasi.
Rilis uji: `2.0.0-beta`.

| # | Tugas | Pel. | Uk. | Kriteria selesai |
|---|---|---|---|---|
| [x] 2.1 | Tabel `media`, `content_items`, `slides`; unggah media (WebP, hapus EXIF, cek jenis berkas) | C | M | Unggahan > 5 MB atau berkas palsu ditolak |
| [x] 2.2 | Pustaka pusat + antrean verifikasi + hadits masjid + "Ajukan ke pustaka pusat" | C | M | Alur App Flow §4.8 berjalan |
| [x] 2.3 | Masukkan 12 draf hadits dari rancangan ke pustaka pusat berstatus draf | C | S | Tampil di antrean verifikasi |
| [ ] 2.4 | Verifikasi 12 draf hadits | A | M | Status `verified` atau diperbaiki |
| [x] 2.5 | Slide + jadwal tayang; 4 jenis panel informasi | C | M | Sesuai App Flow §4.6 |
| [x] 2.6 | Pratinjau tampilan TV di admin web | C | M | Pratinjau sama dengan hasil di TV untuk data yang sama |
| [x] 2.7 | TV: Room skema 6, cache media dengan verifikasi `sha256` | C | M | Media terhapus bila tak dirujuk; berkas rusak diunduh ulang |
| [x] 2.8 | TV: `IllustrationRenderer` (4 periode, 3 siluet, fase bulan) | C | L | Sesuai Design Brief §7; fase bulan benar untuk tanggal 1, 7, 14, 21, 27 |
| [x] 2.9 | TV: tata letak **Galeri**, **Mutiara Hadits**, **panel informasi**, font Amiri | C | L | Sesuai Design Brief §5–6 |
| [x] 2.10 | TV: `ScreenPriorityResolver` sesuai App Flow §3 | C | M | Uji unit untuk setiap baris tabel prioritas lolos |
| [~] 2.11 | TV: audio adzan/iqamah kustom dari server | C | S | Audio unggahan web berbunyi pada waktunya |
| [ ] 2.12 | Uji keterbacaan dari 5 m dan uji di TV box 2 GB | A | M | Daftar periksa Tahap 2 lulus |

**Daftar periksa Tahap 2**

- [ ] Galeri terbaca dari 5 m; teks Arab tampil benar (tidak terpotong, harakat lengkap).
- [ ] Ilustrasi berganti sesuai periode; bulan cocok dengan tanggal Hijriah.
- [ ] Slide tidak tampil saat hitung mundur adzan/iqamah, layar shalat, dan layar Jumat.
- [ ] Panel Petugas Jumat muncul lebih sering pada Kamis sore sampai Jumat siang.
- [ ] Transisi slide halus di TV box 2 GB.

---

## Tahap 3 · Multi-masjid & pemantauan

Hasil: banyak masjid dan TV terpantau dari satu dasbor; pengumuman segera.
Rilis uji: `2.0.0-rc`.

| # | Tugas | Pel. | Uk. | Kriteria selesai |
|---|---|---|---|---|
| [x] 3.1 | Peran per masjid, pemilih masjid untuk pengguna dengan beberapa masjid | C | M | Operator tidak bisa membuka halaman Jadwal (ditolak server) |
| [x] 3.2 | Dasbor semua TV, deteksi offline 5 menit, peringatan selisih jam > 60 detik, riwayat kejadian | C | M | TV yang dimatikan menjadi merah ≤ 6 menit |
| [x] 3.3 | Halaman log aktivitas | C | S | Setiap perubahan pengaturan tercatat dengan nilai lama dan baru |
| [x] 3.4 | **Pengumuman segera**: server dan banner di TV | C | M | Sesuai App Flow §3.2 dan §4.7 |
| [x] 3.5 | Pekerjaan retensi data | C | S | Sesuai Backend Schema §3.6 |
| [x] 3.6 | Uji beban: simulasi 200 TV mengirim heartbeat (`npm run load-test`) | C | S | Heartbeat p95 < 200 ms di VPS. VPS (2 vCPU, 2 GB, bersama aplikasi lain): p95 23,9 ms tanpa galat; 200 TV serentak p95 1,5 s (informasi) |

---

## Rilis 2.0

| # | Tugas | Pel. | Uk. | Kriteria selesai |
|---|---|---|---|---|
| [ ] R.1 | Uji lapangan 2 minggu di minimal 2 masjid/musholla | A | L | Tidak ada galat berat terbuka |
| [~] R.2 | Panduan pengurus (`site/panduan`) dan panduan pasang sendiri (`docs/self-hosting.md`) | C | M | Orang lain bisa memasang server hanya dari panduan. Panduan pengurus selesai (`/panduan`); panduan pasang sendiri diuji saat memasang VPS |
| [x] R.3 | Hapus kunci OpenWeather lama dari kode aplikasi TV | C | S | Tidak ada kunci API di repo `siwak` (masih ada di riwayat git, karena itu R.6) |
| [ ] R.4 | Rilis aplikasi TV **2.0.0** dan server **2.0.0** | C + A | S | Terbit di GitHub Releases; server terpasang di VPS lewat `deploy.sh` |
| [~] R.5 | Perbarui README kedua repo, `NOTICE.md`, tanggal berlaku Privasi/Syarat | C | S | Dokumen sesuai versi rilis. Diperbarui untuk 2.0.0-rc.1; diperiksa lagi saat rilis 2.0.0 |
| [ ] R.6 | Setelah sebagian besar TV memakai 2.0: umumkan, lalu nonaktifkan kunci OpenWeather lama | A | S | Kunci lama tidak aktif di akun OpenWeather |

> Catatan R.6: TV yang masih v1.x akan kehilangan cuaca setelah kunci lama dinonaktifkan.
> Jadwal dan fitur lain tetap berjalan. Pengurus cukup memperbarui aplikasi.

---

## Risiko pelaksanaan

| Risiko | Tanda | Langkah |
|---|---|---|
| Lingkup Tahap 2 membengkak | Tahap 2 jauh lebih lama dari Tahap 1 | Tunda panel informasi (prioritas S) ke 2.1 |
| VPS kekurangan sumber daya | Memori > 80% setelah SIWAK jalan | Batasi memori proses lewat PM2 (`max_memory_restart`); pertimbangkan VPS terpisah |
| TV box terlalu lambat untuk ilustrasi | Transisi patah-patah | Sederhanakan lapisan ilustrasi atau render sekali ke bitmap per periode |
| Akses ke VPS terbatas | Deploy tertunda | C menyiapkan perintah lengkap; A menjalankannya |

## Riwayat dokumen

| Tanggal | Perubahan |
|---|---|
| 2026-10-20 | Versi pertama dokumen 01–06 |
| 2026-11-16 | Fitur pemantauan & perintah jarak jauh (F-TV-18–20, F-ADM-18): tugas 1.7a dan 1.16a |
| 2026-11-17 | Tahap 2: 2.1–2.3 dan 2.5–2.10 selesai dan diuji di emulator (Galeri, ilustrasi, Mutiara Hadits, panel informasi); 2.11 audio kustom sudah dipetakan, belum diuji dengan berkas audio asli; penyimpanan konten TV memakai berkas JSON (Schema §7) |
| 2026-11-18 | 2.0.0-rc.2: alur UX diperbaiki dari uji coba pengguna. Web: menu bergrup, beranda masjid berisi masalah + tombol perbaikan, langkah awal, yang tampil di TV; status penerapan per TV setelah menyimpan; pratinjau dengan jam dan jadwal asli sesuai tata letak; Slide & info menandai panel yang tampil; daftar hadits yang tayang; Pustaka menampilkan jumlah per status. TV: layar sambutan, penjelasan izin, konfirmasi terhubung, penanda server tidak terjangkau, perintah Tampilkan Mutiara, laporan penerapan segera |
| 2026-11-18 | 2.0.0-rc.3: layar konten (mati = tampilan v1.x; panel samping dan/atau layar penuh berkala, durasi diatur), slide tidak lagi tertahan, pengumuman di bawah menutupi teks berjalan, jam analog dihapus dan jam digital memenuhi kotaknya, tata letak Galeri baru (cuaca satu baris), logo resmi, web mode terang/gelap dengan kredit pengembang, pratinjau sesuai layar TV (tema, latar, cuaca, layar adzan/iqamah/shalat/layar penuh), PIN TV dihapus, daftar izin aplikasi, pengaturan TV online lengkap (tentang & pembaruan) dan urutan pengaturan mengikuti menu web, sorotan fokus remote yang jelas |
| 2026-11-18 | 2.0.0-rc.4: bahasa awam di web dan TV (tanpa istilah teknis), pengaturan cara tampil slide & hadits pindah ke menu Konten, urutan dan nama pengaturan Jadwal/Suara/Tampilan sama di web, TV mandiri, dan TV terhubung, TV terhubung menampilkan ringkasan pengaturan dari web, daftar izin aplikasi sama di kedua mode dan mengikuti warna tema, tes suara di mode mandiri, pengaturan TV mengikuti pilihan bahasa aplikasi, web lebih lebar dan responsif, halaman depan baru dengan mode terang, panduan singkat diperbarui |
| 2026-11-18 | 2.0.0-rc.5: konten Informasi (judul + isi teks) dan tombol Tambah info bergaya pilihan, hadits otomatis bisa dimatikan, pengaturan lama tampil hadits/layar penuh/gambar latar dirapikan ke menu Slide dan Hadits, Beranda pemantauan (waktu shalat berikutnya, jadwal hari ini, status TV besar), ikon flat di web dan TV menggantikan emoji, menu samping bisa diciutkan, slide layar penuh dengan tulisan 1,8×, warna galeri ikut tema, bip lewat jalur media dan tes suara sesuai jenis, navigasi remote baris demi baris dan izin baterai Android TV, slide ganda dicegah, pesan galat TV ramah awam, aset web aman saat deploy |
| 2026-11-19 | 2.0.0 (stabil): pengumuman bergiliran setelah selesai bergulir, teks berjalan pendek tetap berjalan, hadits otomatis diacak harian dan semua mendapat giliran, jam TV disamakan dengan server untuk masa tayang pengumuman, buku panduan lengkap bergambar (online dan PDF), README diperbarui |
| 2026-11-17 | Server 2.0.0-rc.1 terpasang di https://siwak.alfianys.id (PM2 + Node 22 dari nvm khusus SIWAK, Nginx + HTTPS, cadangan harian 02.30); uji beban VPS lulus |
| 2026-11-17 | Rilis uji 2.0.0-rc.1: panduan pengurus, kunci OpenWeather lama dihapus dari aplikasi, Privasi diperbarui, pembanding versi pembaruan otomatis mengenal pra-rilis |
| 2026-11-17 | Tahap 3: 3.1–3.5 selesai (peran per masjid & pemilih masjid, dasbor semua TV, riwayat kejadian, log aktivitas, pengumuman segera + banner TV, retensi termasuk media); uji beban 200 TV lulus lokal (p95 23 ms), menunggu pengukuran di VPS |
| 2026-11-17 | 1.5–1.11 dan 1.13–1.16a selesai; diuji di emulator Android TV 14: hubungkan, koreksi menit ≤ 2 menit, latar belakang terdeteksi, Buka SIWAK, lepas TV |
