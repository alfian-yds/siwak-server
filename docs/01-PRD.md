# 01 · Product Requirements Document (PRD) · SIWAK V2

| | |
|---|---|
| **Produk** | SIWAK (Sistem Informasi Waktu Shalat) |
| **Versi dokumen** | 1.1 · 2026-11-16 |
| **Pemilik produk** | Alfian Yudisurya |
| **Status** | Disepakati untuk dikerjakan |
| **Dokumen terkait** | [02-TRD](02-TRD.md) · [03-App Flow](03-APP-FLOW.md) · [04-Design Brief](04-DESIGN-BRIEF.md) · [05-Backend Schema](05-BACKEND-SCHEMA.md) · [06-Implementation Plan](06-IMPLEMENTATION-PLAN.md) |

Dokumen ini menjawab **apa** yang dibangun dan **untuk siapa**. Cara membangunnya ada di TRD.
Setiap kebutuhan punya ID (mis. `F-TV-03`) agar bisa dirujuk di kode, commit, dan pengujian.


---

## 1. Latar belakang

SIWAK v1.x (rilis Agustus–Oktober 2026) adalah aplikasi Android TV mandiri yang menampilkan jam,
jadwal shalat Kemenag, tanggal Hijriah, cuaca, dan teks berjalan di layar masjid. Semua pengaturan
dilakukan dengan remote TV, satu per satu.

Masalah yang muncul:

1. Mengubah teks berjalan atau koreksi menit harus datang ke lokasi dan memakai remote.
2. Tidak ada cara mengetahui apakah TV di masjid menyala dan berjalan normal.
3. Satu pengelola ingin mendukung lebih dari satu masjid/musholla.
4. Masukan pengguna awal: tampilan perlu lebih variatif, dengan ilustrasi dan hadits, termasuk hadits fiqh
   masjid/musholla.
5. Kunci API cuaca tertanam di aplikasi dan terlihat di repositori publik.

## 2. Tujuan V2

| ID | Tujuan | Ukuran keberhasilan |
|---|---|---|
| G1 | Pengurus mengatur TV dari HP tanpa remote | 100% pengaturan v1.2 tersedia di admin web |
| G2 | Perubahan sampai ke TV dengan cepat | Perubahan tampil di TV ≤ 60 detik saat online |
| G3 | Layar tetap benar tanpa internet | Jadwal tetap tampil benar 7 hari tanpa koneksi |
| G4 | Banyak masjid dikelola dari satu tempat | Super admin melihat status semua TV di satu dasbor |
| G5 | Tampilan lebih kaya dan berciri khas | Tata letak Galeri dengan ilustrasi + hadits tersedia |
| G6 | Proyek open source yang rapi dan legal | Lisensi, kebijakan privasi, dan panduan pasang sendiri lengkap |

## 3. Bukan tujuan V2

- Aplikasi HP terpisah (admin web sudah responsif di HP).
- Streaming video atau siaran langsung Mekah/Madinah.
- Pembayaran, donasi online, atau fitur keuangan selain menampilkan laporan kas.
- Mengumpulkan data jamaah.
- Perangkat keras khusus (mini PC, Raspberry Pi). SIWAK berjalan di Android TV / TV box Android.

## 4. Pengguna

| Peran | Siapa | Kebutuhan utama |
|---|---|---|
| **Jamaah** | Orang yang melihat layar | Membaca jam, jadwal, hitung mundur, pengumuman dari jarak 3–8 m |
| **Super admin** | Pengelola SIWAK | Mengelola semua masjid dan pengguna, memverifikasi hadits pustaka pusat, memantau semua TV |
| **Admin masjid** | Takmir / ketua pengurus | Mengatur jadwal, suara, tampilan, konten, dan TV masjidnya |
| **Operator** | Remaja masjid / sekretaris | Mengubah teks berjalan, slide, panel informasi, pengumuman |
| **Pemasang** | Teknisi yang memasang TV | Menghubungkan TV ke masjid dengan cepat |
| **Organisasi lain** | Pihak yang memasang server sendiri | Menjalankan SIWAK di servernya sendiri dengan panduan jelas |

## 5. Keputusan yang sudah terkunci

| Topik | Keputusan |
|---|---|
| Identitas | SIWAK adalah proyek open source mandiri, tanpa afiliasi institusi |
| Cakupan | Rencana V2, V3, V4 lama digabung menjadi satu rilis V2 |
| Server | VPS milik pengembang di Indonesia (Jawa Barat): Node.js dengan PM2, MariaDB, Nginx; tanpa Docker |
| Domain | `siwak.alfianys.id`: halaman proyek di `/`, admin di `/admin`, API di `/api/v1` |
| Login | Akun Google; hanya email yang didaftarkan super admin |
| Menghubungkan TV | Kode 8 digit, ditampilkan juga sebagai QR; pengurus harus login dulu, lalu mengetik kode atau scan QR dari dalam admin web |
| Layar konten | Slide, info, dan hadits sebagai satu daftar; bisa di panel samping, layar penuh berkala, atau keduanya; mati = tampilan v1.x |
| Kunci API cuaca | Hanya di server; server mengambil cuaca per lokasi |
| Hadits | Admin masjid boleh menambah hadits untuk masjidnya (langsung tayang di masjid itu); pustaka pusat hanya berisi hadits yang diverifikasi super admin |
| Ilustrasi | Vektor yang digambar dengan kode, milik proyek, lisensi CC BY 4.0 |
| Repositori | `alfian-yds/siwak` (aplikasi TV) dan `alfian-yds/siwak-server` (server, admin web, halaman proyek) |
| Panel informasi | Masuk V2 (Tahap 2): kas masjid, petugas Jumat, agenda kajian, hitung mundur hari besar Islam |

## 6. Kebutuhan fungsional

Prioritas: **W** = wajib untuk rilis 2.0 · **S** = sebaiknya ada · **O** = opsional.

### 6.1 Aplikasi TV (`F-TV`)

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F-TV-01 | TV yang belum terhubung berjalan dalam **mode mandiri**, persis seperti v1.2 | W |
| F-TV-02 | Menu "Hubungkan ke server" menampilkan kode 8 digit dan QR berisi kode yang sama; kode berlaku 10 menit lalu diperbarui | W |
| F-TV-03 | Setelah terhubung, TV sinkron dengan server tiap 60 detik dan hanya mengunduh data yang berubah | W |
| F-TV-04 | Semua data hasil sinkron (pengaturan, konten, gambar, audio, cuaca terakhir) disimpan di TV dan dipakai saat offline | W |
| F-TV-05 | Jadwal shalat tetap dihitung di TV (AlAdhan + cadangan 7 hari); tidak bergantung server | W |
| F-TV-06 | ~~Menu pengaturan dikunci PIN~~ dihapus di rc.3; diganti daftar izin aplikasi agar perintah jarak jauh berjalan | W |
| F-TV-07 | TV melapor ke server: versi aplikasi, versi data, waktu, status sehat | W |
| F-TV-08 | Tata letak **Galeri**: panel slide (hadits, ilustrasi, panel informasi) di samping jam | W |
| F-TV-09 | Ilustrasi berganti mengikuti waktu: fajar, siang, senja, malam; bulan mengikuti tanggal Hijriah | S |
| F-TV-10 | Layar **Mutiara Hadits** penuh, berkala, frekuensi diatur dari web | S |
| F-TV-11 | **Banner pengumuman segera** tampil di atas layar apa pun, hilang saat masa tayang habis | W |
| F-TV-12 | Slide dan Mutiara Hadits **tidak tampil** saat hitung mundur adzan/iqamah, layar masuk waktu shalat, dan layar Jumat | W |
| F-TV-13 | Isian "Alamat server" di menu lanjutan (terkunci PIN), bawaan `https://siwak.alfianys.id` | W |
| F-TV-14 | TV yang dilepas dari web kembali ke mode mandiri dengan pengaturan terakhir | W |
| F-TV-15 | Atribusi "Data cuaca dari OpenWeather" tampil di layar Tentang | W |
| F-TV-16 | TV melaporkan selisih jamnya terhadap jam server; dasbor memberi peringatan bila meleset lebih dari 60 detik | S |
| F-TV-17 | Pengaturan di TV yang terhubung terbatas pada: info koneksi, alamat server, tes suara, lepas dari server, tentang. Pengaturan lain hanya dari admin web | W |
| F-TV-18 | TV melaporkan apakah SIWAK **sedang tampil di layar** atau berada di latar belakang (sejak kapan), serta apakah izin "Tampil di atas aplikasi lain" sudah diberikan | W |
| F-TV-19 | TV menjalankan **perintah jarak jauh** dari admin web: **Buka SIWAK**, **Sinkron sekarang**, **Mulai ulang SIWAK**, lalu melaporkan hasilnya | W |
| F-TV-20 | Opsi **Selalu kembali ke SIWAK**: bila SIWAK berada di latar belakang lebih dari N menit, TV membukanya lagi otomatis (bawaan: mati) | S |

### 6.2 Admin web (`F-ADM`)

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F-ADM-01 | Masuk dengan Google; email yang tidak terdaftar ditolak dengan pesan jelas | W |
| F-ADM-02 | Menu **Hubungkan TV**: ketik kode 8 digit atau tombol "Scan QR" (kamera HP); pilih masjid dan nama TV | W |
| F-ADM-03 | Pengaturan **Lokasi & jadwal**: kota/kabupaten atau koordinat, metode, koreksi ± menit per waktu, jadwal manual, tampil/sembunyi Imsak & Terbit, penyesuaian Hijriah | W |
| F-ADM-04 | Pengaturan **Adzan & iqamah**: jeda iqamah per waktu, menit hitung mundur, lama layar masuk waktu, layar Jumat dan durasinya, bayan malam Jumat | W |
| F-ADM-05 | Pengaturan **Suara**: bip / tik-tik / audio kustom untuk adzan dan iqamah, unggah file audio | W |
| F-ADM-06 | Pengaturan **Tampilan**: tata letak, tema, jenis dan format jam, ukuran jam, mode istirahat malam, logo, foto latar | W |
| F-ADM-07 | **Teks berjalan**: tambah, ubah, urutkan, aktif/nonaktif, tanggal mulai dan selesai | W |
| F-ADM-08 | **Slide**: pilih dari pustaka atau unggah, atur urutan, durasi, hari dan jam tayang | W |
| F-ADM-09 | **Panel informasi**: kas masjid, petugas Jumat, agenda kajian, hitung mundur hari besar Islam | S |
| F-ADM-10 | **Pengumuman segera**: isi, sasaran (satu TV / semua TV masjid), masa tayang | W |
| F-ADM-11 | **Pratinjau** tampilan TV di browser sebelum menyimpan | S |
| F-ADM-12 | **Status TV**: online/offline, sejak kapan, versi aplikasi, sinkron terakhir | W |
| F-ADM-13 | ~~PIN TV~~ dihapus di rc.3 | W |
| F-ADM-14 | **Lepas TV** dari masjid | W |
| F-ADM-15 | **Hadits masjid**: tambah, ubah, hapus; opsi "Ajukan ke pustaka pusat" | W |
| F-ADM-16 | Seluruh halaman nyaman dipakai di layar HP 360 px | W |
| F-ADM-17 | Setiap perubahan tercatat di log aktivitas | W |
| F-ADM-18 | **Pemantauan jarak jauh**: status online/offline dan "SIWAK tampil / di latar belakang sejak …" per TV, tombol **Buka SIWAK**, **Sinkron sekarang**, **Mulai ulang SIWAK**, beserta status perintah (menunggu, terkirim, berhasil, gagal) | W |

### 6.3 Super admin (`F-SA`)

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F-SA-01 | Halaman **Pengguna**: tambah email Google, tetapkan peran per masjid, nonaktifkan | W |
| F-SA-02 | Halaman **Masjid**: tambah, ubah, arsipkan masjid | W |
| F-SA-03 | **Dasbor semua TV** di semua masjid, bisa disaring yang offline | W |
| F-SA-04 | **Verifikasi hadits**: setujui atau kembalikan dengan catatan | W |
| F-SA-05 | Mengelola **pustaka pusat**: hadits dan ilustrasi untuk semua masjid | W |
| F-SA-06 | Melihat **log aktivitas** semua masjid | S |

### 6.4 Halaman proyek (`F-WEB`)

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F-WEB-01 | Halaman depan `siwak.alfianys.id`: tentang SIWAK, tangkapan layar, tautan unduh APK terbaru, tautan GitHub | W |
| F-WEB-02 | Halaman `/privasi` dan `/syarat` berisi Kebijakan Privasi dan Syarat Penggunaan | W |
| F-WEB-03 | Halaman panduan singkat: memasang APK, menghubungkan TV | S |

## 7. Kebutuhan non-fungsional

| ID | Kebutuhan |
|---|---|
| NF-01 | **Offline-first**: tanpa internet, TV tetap menampilkan jadwal benar ≥ 7 hari dan konten terakhir |
| NF-02 | **Waktu sampai**: perubahan dari web tampil di TV ≤ 60 detik (TV online) |
| NF-03 | **Perangkat**: berjalan lancar di TV box Android dengan RAM 2 GB; minSdk tetap 21 (Android 5.0) |
| NF-04 | **Keterbacaan**: jam, jadwal, dan hitung mundur terbaca dari 5 m di TV 43 inci (rincian di Design Brief) |
| NF-05 | **Ketersediaan server**: target 99% per bulan; server mati tidak mengganggu jam dan jadwal |
| NF-06 | **Keamanan**: HTTPS, akses dibatasi peran, kunci perangkat bisa dicabut, rahasia hanya di `.env` |
| NF-07 | **Privasi**: tidak ada data jamaah; mematuhi UU No. 27 Tahun 2022 (PDP) |
| NF-08 | **Bahasa**: Indonesia (utama) dan Inggris pada aplikasi TV; admin web berbahasa Indonesia |
| NF-09 | **Kompatibilitas mundur**: TV v1.x tetap berjalan; update ke v2 tidak menghapus pengaturan |
| NF-10 | **Pasang sendiri**: organisasi lain bisa menjalankan server di VPS Linux dengan Node.js, MariaDB, dan PM2 mengikuti panduan |
| NF-11 | **Legal**: lisensi seluruh komponen tercantum di `NOTICE.md`; tidak ada komponen ber-lisensi copyleft kuat (GPL/AGPL) di aplikasi |

## 8. Asumsi dan batasan

- Masjid punya Wi-Fi, meski tidak selalu stabil.
- Satu VPS cukup untuk ratusan TV (sinkron tiap 60 detik, data kecil).
- Akun OpenWeather gratis cukup karena cuaca diambil per lokasi, bukan per TV.
- Pengembang utama satu orang, jadi cakupan dibagi tiga tahap.

## 9. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Hadits salah tayang | Kepercayaan jamaah turun | Pustaka pusat wajib verifikasi; hadits masjid jadi tanggung jawab admin masjid (Syarat Penggunaan) |
| Jadwal berbeda dari jadwal resmi | Keluhan jamaah | Koreksi menit, penafian di README dan Syarat Penggunaan |
| Server/VPS mati | Konten tidak bisa diubah | TV tetap jalan offline; cadangan harian |
| Kode pairing ditebak orang | TV terhubung ke pihak lain | 8 digit, masa berlaku 10 menit, batas percobaan, wajib login |
| SIWAK tertutup di TV tanpa ada yang tahu | Jadwal tidak tampil | Status "di latar belakang" di web, tombol Buka SIWAK, opsi Selalu kembali ke SIWAK, mulai otomatis saat TV menyala |
| Komponen berlisensi bermasalah | Tuntutan hukum | Tahap 0 menghapus iText; daftar lisensi di NOTICE; pemeriksaan lisensi tiap menambah dependensi |

## 10. Pertanyaan terbuka

| # | Pertanyaan | Pemilik |
|---|---|---|
| Q1 | Email Google untuk super admin pertama | Pemilik produk |

Terjawab 2026-10-20: kontak resmi tercantum di Kebijakan Privasi; server di Indonesia (Jawa Barat);
SIWAK berdiri sendiri tanpa nama institusi.
