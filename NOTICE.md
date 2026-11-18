# Pemberitahuan Pihak Ketiga

Kode sumber server SIWAK berlisensi MIT (lihat [LICENSE](LICENSE)). Dokumen ini mencantumkan
komponen dan layanan pihak lain yang dipakai beserta lisensinya.

## Pustaka perangkat lunak

### Server (`api/`, dipakai saat server berjalan)

| Komponen | Lisensi |
|---|---|
| Fastify, @fastify/cookie, @fastify/formbody, @fastify/helmet, @fastify/rate-limit, @fastify/static, helmet | MIT |
| Drizzle ORM | Apache License 2.0 |
| mysql2 | MIT |
| Zod | MIT |
| openid-client | MIT |
| marked (Markdown untuk halaman Privasi/Syarat) | MIT |
| @fastify/multipart, file-type, music-metadata, jimp, @jimp/core | MIT |
| @jsquash/webp, wasm-feature-detect | Apache License 2.0 |
| libwebp (di dalam @jsquash/webp, codec WebP WebAssembly), Copyright (c) 2010 Google Inc. | BSD-3-Clause |

### Admin web (`admin-web/`, dibundel ke dalam berkas yang dikirim ke browser)

| Komponen | Lisensi |
|---|---|
| React, React DOM | MIT |
| React Router | MIT |
| TanStack Query | MIT |
| ZXing untuk browser (`@zxing/browser`), pemindai QR | MIT |
| ZXing (`@zxing/library`), pembaca QR | Apache License 2.0 |
| Fontsource (paket pembungkus font) | MIT (kode) / OFL-1.1 (berkas font) |

Daftar lengkap semua paket produksi, termasuk dependensi turunan, dapat dicetak dengan
`npm run license:list`. CI menjalankan `npm run license:check` (`scripts/check-licenses.mjs`)
dan gagal bila ada lisensi di luar kebijakan TRD §3: MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD,
BlueOak-1.0.0, CC0-1.0, Unlicense, Zlib, Python-2.0, dan OFL-1.1 (khusus font).

## Font

Font disajikan dari server SIWAK sendiri (tidak memuat dari Google Fonts). Semuanya berlisensi
SIL Open Font License 1.1; teks lisensinya ada di [licenses/OFL-1.1.txt](licenses/OFL-1.1.txt).

| Font | Pemakaian | Hak cipta |
|---|---|---|
| Plus Jakarta Sans | Teks isi admin web | Copyright 2020 The Plus Jakarta Sans Project Authors (<https://github.com/tokotype/PlusJakartaSans>) |
| Marcellus | Merek & judul | Copyright (c) 2012 Brian J. Bonislawsky DBA Astigmatic (AOETI), Reserved Font Name "Marcellus" |
| IBM Plex Mono | Angka & kode | Copyright 2017 IBM Corp., Reserved Font Name "Plex" |
| Amiri | Teks Arab | Copyright 2010-2022 The Amiri Project Authors (<https://github.com/aliftype/amiri>) |

## Layanan pihak ketiga

| Layanan | Dipakai untuk | Ketentuan |
|---|---|---|
| Google (OAuth / OpenID Connect) | Masuk ke admin web | Ketentuan dan kebijakan privasi Google |
| OpenWeather (<https://openweathermap.org>) | Data cuaca | Data berlisensi CC BY-SA 4.0 / ODbL; wajib atribusi "Data cuaca dari OpenWeather" |

## Nama dan logo

Nama **SIWAK** dan logonya tidak termasuk dalam lisensi MIT.
