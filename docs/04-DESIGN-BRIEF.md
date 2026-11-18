# 04 · Design Brief · SIWAK V2

| | |
|---|---|
| **Versi dokumen** | 1.0 · 2026-10-20 |
| **Mengacu pada** | [01-PRD](01-PRD.md) · [03-App Flow](03-APP-FLOW.md) |

Dokumen ini mengatur rupa SIWAK: warna, huruf, ukuran, tata letak, ilustrasi, gerak, dan istilah.
Angka-angka di sini wajib dipatuhi saat implementasi; perubahan dicatat di dokumen ini dulu.

---

## 1. Konteks pandang

| Aspek | Kondisi |
|---|---|
| Layar | TV 32–55 inci, 1080p (sebagian 720p), TV box Android murah |
| Jarak baca | 3–8 meter, sering dari samping |
| Cahaya | Terang siang hari, remang saat Subuh dan malam |
| Pembaca | Jamaah segala usia, termasuk lansia |
| Lama dilihat | Sekilas (2–3 detik) saat masuk masjid, lebih lama saat menunggu iqamah |

## 2. Prinsip

1. **Terbaca lebih dulu.** Jam, jadwal, dan hitung mundur harus terbaca dari 5 m sebelum hal lain dipikirkan.
2. **Tenang dan khusyuk.** Palet terbatas, gerak pelan, tidak ada kedip atau warna mencolok berlebihan.
3. **Satu sorotan.** Hanya waktu shalat berikutnya yang disorot kuningan. Kartu lain seragam.
4. **Khas SIWAK, tidak meniru.** Gagasan umum layar masjid boleh dipakai; tata letak, warna, dan aset harus milik sendiri.
5. **TV dan web satu keluarga.** Warna, istilah, dan ikon sama di aplikasi TV, admin web, dan situs.

## 3. Warna

### 3.1 Token inti

| Token | Nilai | Pemakaian |
|---|---|---|
| `zamrud` | `#0C5138` | Warna merek, tombol utama di web |
| `zamrud-gelap` | `#083B29` | Latar header web, bayangan |
| `kuningan` | `#A97E24` | Aksen di web (latar terang) |
| `kuningan-terang` | `#E0BA60` | Sorotan waktu berikutnya di TV |
| `krem` | `#F4D99A` | Teks aksen di atas latar gelap |
| `tv-latar` | `#06130D` | Latar dasar TV (tema bawaan SIWAK) |
| `tv-teks` | `#EEF5EF` | Teks utama di TV |
| `tv-teks-2` | `#C3DCCB` | Teks sekunder di TV |

### 3.2 Warna status (bukan aksen)

| Token | Nilai | Pemakaian |
|---|---|---|
| `online` | `#1C805A` | TV online |
| `offline` | `#A83A2C` | TV offline, tombol berbahaya |
| `peringatan` | `#A9791B` | Jam TV meleset, peringatan lain |
| `pengumuman` | `#A83A2C` (92% opasitas) | Banner pengumuman segera |

### 3.3 Tema

11 tema warna v1.2 tetap tersedia. Tata letak Galeri, Mutiara Hadits, dan panel informasi memakai
warna aksen dari tema aktif (`primaryAccent`) untuk sorotan, sehingga tidak bertabrakan dengan tema.

## 4. Huruf

| Tempat | Latin | Angka & kode | Arab |
|---|---|---|---|
| **TV** | Font sistem (Roboto), seperti v1.2 | Font sistem (ukuran jam sudah disetel di v1.2) | **Amiri**, dibundel |
| **Admin web & situs** | Plus Jakarta Sans (isi), Marcellus (judul & merek) | IBM Plex Mono | Amiri |

- Di TV hanya Amiri yang ditambahkan, agar ukuran APK kecil dan ukuran jam yang sudah disetel tidak berubah.
- Font web **disimpan di server sendiri**, tidak memuat dari Google Fonts, supaya alamat IP pengurus
  tidak terkirim ke pihak ketiga.
- Semua font di atas berlisensi SIL OFL 1.1; teks lisensinya disertakan di `NOTICE.md`.

## 5. Ukuran dan keterbacaan di TV

Ukuran dinyatakan dalam persen **tinggi layar** (1080p = 1080 px), sehingga sama di semua resolusi.

| Unsur | Minimal | Contoh di 1080p |
|---|---|---|
| Jam utama (Galeri) | 18% | 194 px |
| Waktu pada kartu jadwal | 7% | 76 px |
| Nama waktu pada kartu | 4,5% | 49 px |
| Hitung mundur "Berikutnya" | 6% | 65 px |
| Teks berjalan | 4% | 43 px |
| Teks Arab hadits (maks. 2 baris) | 4,5% | 49 px |
| Terjemah hadits (maks. 4 baris) | 3,3% | 36 px |
| Label kecil (kategori, sumber) | 2,2% | 24 px |

Aturan tambahan:

- **Area aman**: semua teks dan unsur penting berada di dalam margin 5% dari setiap tepi layar,
  karena sebagian TV memotong tepi gambar (overscan).
- **Kontras** teks minimal 4,5 : 1. Teks di atas ilustrasi wajib di atas gradien gelap (0% → 82%)
  atau panel kaca dengan latar minimal 55% opasitas.
- Konten yang melebihi batas baris **tidak boleh dikecilkan otomatis**. Admin web membatasi panjangnya
  (terjemah ≤ 600 karakter) dan pratinjau menunjukkan bila teks terpotong.
- Warna tidak boleh menjadi satu-satunya penanda. Waktu berikutnya disorot warna **dan** bingkai.

## 6. Tata letak TV

### 6.1 Bar Bawah (v1.2)

Tidak berubah.

### 6.2 Galeri (baru)

```
┌───────────────────────────────────────────────────────────┐
│ ┌──────────────────────────────┐  ┌──────────────────────┐ │
│ │                              │  │ logo  Nama masjid    │ │
│ │   PANEL SLIDE (58%)          │  │ 11:18:42  (jam)      │ │
│ │   ilustrasi + hadits /       │  │ tanggal M · tanggal H│ │
│ │   panel informasi            │  │ cuaca                │ │
│ │                              │  │ ┌ Berikutnya ──────┐ │ │
│ │                              │  │ │ Adzan Dzuhur −09:18│ │ │
│ └──────────────────────────────┘  └──────────────────────┘ │
│ [Subuh][Terbit][Dzuhur*][Ashar][Maghrib][Isya]  (kartu)    │
│ ● teks berjalan ...........................................│
└───────────────────────────────────────────────────────────┘
```

- Kolom: panel slide 58%, kolom kanan 42%; jarak antarbagian 1% tinggi layar.
- Kartu waktu: 5–7 kartu sesuai pengaturan Imsak/Terbit, lebar sama, hanya kartu berikutnya disorot.
- Di dalam panel slide hadits: label kategori di kiri atas; teks Arab, terjemah, dan sumber di bawah,
  di atas gradien gelap; titik penanda urutan slide di kanan bawah.

### 6.3 Mutiara Hadits

Ilustrasi periode memenuhi layar. Panel kaca di tengah (lebar maks. 78%) berisi label kategori,
teks Arab, terjemah, dan sumber. Jam kecil di pojok kanan atas; chip waktu shalat berikutnya di kanan bawah.

### 6.4 Banner pengumuman

Lebar penuh di dalam area aman, menempel di atas, latar `pengumuman`, label "PENGUMUMAN" di kiri,
teks maks. 2 baris. Masuk dengan geser turun 300 ms.

### 6.5 Panel informasi

Panel kaca di tengah slide. Label jenis panel (huruf kapital, renggang) di atas, judul, lalu baris
berisi nama di kiri dan nilai rata kanan. Baris total (mis. saldo akhir) disorot warna aksen.

## 7. Sistem ilustrasi

Ilustrasi digambar oleh kode (Compose Canvas di TV, SVG di web) dari lapisan berikut:

| Lapisan | Isi |
|---|---|
| Langit | Gradien vertikal per periode |
| Benda langit | Matahari (posisi mengikuti jam) atau bulan (bentuk mengikuti tanggal Hijriah) |
| Bintang | Titik kecil, hanya periode Fajar dan Malam |
| Siluet | Tiga varian: masjid kubah dengan dua menara; masjid beratap tumpang khas Jawa; musholla sederhana |
| Jendela | Cahaya hangat di jendela, hanya Senja dan Malam |
| Ornamen | Motif bintang delapan (khatam), opasitas 6–8% |

Palet langit per periode:

| Periode | Atas | Tengah | Bawah | Siluet |
|---|---|---|---|---|
| Fajar | `#1B2A55` | `#A9587D` | `#F2B47C` | `#130F24` |
| Siang | `#2F6F9F` | `#8FC0DB` | `#EFE1BD` | `#123A2B` |
| Senja | `#2B1F4F` | `#B9566C` | `#F0A75E` | `#1A0F1D` |
| Malam | `#06162A` | `#0D3550` | `#124A3C` | `#04100B` |

Aturan:

- Tidak memakai foto atau gambar milik pihak lain, dan tidak menampilkan makhluk bernyawa.
- Varian siluet dipilih per masjid di pengaturan Tampilan; bawaan: kubah dengan dua menara.
- Foto masjid yang diunggah pengurus menggantikan lapisan langit dan siluet, tetapi gradien gelap
  untuk keterbacaan teks tetap dipasang.
- Rujukan SVG tiap periode disimpan di `siwak-server/content/illustrations/` untuk pratinjau web.

## 8. Gerak

| Peristiwa | Gerak |
|---|---|
| Ganti slide | Pudar silang 800 ms |
| Masuk/keluar Mutiara Hadits | Pudar 600 ms |
| Banner pengumuman | Geser turun 300 ms saat masuk, pudar 300 ms saat keluar |
| Hitung mundur | Angka balik (flip) v1.2 dipertahankan |
| Mode istirahat malam | Redup bertahap 2 detik |

Tidak ada kedip, guncang, atau animasi berulang yang menarik perhatian dari shalat.

## 9. Admin web

- **Mulai dari HP**: dirancang untuk lebar 360 px, satu kolom; di laptop menjadi dua kolom.
- Target sentuh minimal 44 × 44 px.
- Koreksi menit memakai kontrol `−  +2  +` dengan tombol besar, bukan isian teks.
- Tombol utama berwarna `zamrud`; tombol berbahaya (Lepas TV, Hapus) berwarna `offline` dan selalu
  meminta konfirmasi di halaman.
- Mengikuti mode terang/gelap sistem.
- Status TV memakai titik warna **dan** teks ("Online", "Offline sejak 09:12").

## 10. Gaya bahasa

- Bahasa Indonesia baku yang santun dan ringkas. Sapaan "Anda".
- Tombol menyebut hasilnya: "Simpan", "Hubungkan", "Kirim pengumuman", bukan "OK" atau "Submit".
- Pesan galat menyebut apa yang salah dan apa yang harus dilakukan (lihat App Flow §5).

### Istilah baku

| Pakai | Jangan pakai |
|---|---|
| Adzan | Azan, Adhan |
| Iqamah | Iqomah, Ikamah |
| Subuh, Dzuhur, Ashar, Maghrib, Isya | Shubuh, Zuhur, Asar, Magrib, Isyak |
| Imsak, Terbit | Imsyak, Syuruq |
| Jumat | Jum'at |
| Hijriah | Hijriyah, Hijri |
| Teks berjalan | Running text (boleh di dokumen teknis) |
| Hubungkan TV / Lepas TV | Pairing / Unpair (boleh di dokumen teknis) |
| Mode mandiri | Offline mode, standalone |
| Pengumuman segera | Broadcast, notifikasi |
| Pustaka pusat | Library global |

## 11. Pembeda dari referensi

| Aspek | Yang lazim di layar masjid | SIWAK |
|---|---|---|
| Warna | Blok warna cerah berbeda tiap waktu shalat | Palet zamrud-kuningan; hanya waktu berikutnya disorot |
| Gambar | Foto masjid terkenal atau kaligrafi statis | Ilustrasi vektor yang berganti mengikuti waktu |
| Jam | Angka besar berwarna di pojok | Jam besar menyatu dengan kolom kanan |
| Ornamen | Bingkai polos | Motif bintang delapan tipis dan panel kaca |
| Isi pesan | Teks berjalan dan panel informasi | Hadits terverifikasi + panel informasi bergiliran |
| Perangkat | Mini PC / Raspberry Pi | Android TV / TV box biasa |

## 12. Aset dan lisensi

| Aset | Lisensi |
|---|---|
| Ilustrasi SIWAK | CC BY 4.0 |
| Font Amiri, Plus Jakarta Sans, Marcellus, IBM Plex Mono | SIL OFL 1.1 |
| Ikon Material | Apache 2.0 |
| Nama dan logo SIWAK | Tidak termasuk lisensi terbuka |
| Suara bip | Pixabay Content License (lihat `NOTICE.md`) |
| Suara tik-tik | MIT, bawaan MosqueClock |
