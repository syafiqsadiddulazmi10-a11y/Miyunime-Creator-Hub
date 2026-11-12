# HowToRun: Miyunime Creator Hub (MVP)

Aplikasi web untuk memantau kuota posting content creator Miyunime. Tanpa dependensi npm: server memakai modul bawaan Node.js
(`node:http`, `node:sqlite`, `node:crypto`), dan UI berupa HTML/JS biasa.

## 1. Prasyarat

| Kebutuhan | Versi | Catatan |
|-----------|-------|---------|
| Node.js | **22.18 atau lebih baru** | Wajib: kode TypeScript dijalankan langsung oleh Node (type stripping) dan database memakai `node:sqlite`. Cek dengan `node -v`. |
| npm | bawaan Node | Hanya untuk menjalankan skrip, tidak ada paket yang diunduh. |
| Browser modern | Chrome, Edge, Firefox, Safari | |

Tidak perlu menginstal database, tidak perlu `npm install`, dan tidak perlu file `.env`.

## 2. Menjalankan aplikasi

Dari clone bersih, urutannya `npm ci`, `npm run build`, `npm test`, `npm run seed`, `npm start` (atau `npm run verify` untuk build + tes sekaligus). Skrip `scripts/verify-fresh-clone.sh` mengotomatiskan semuanya dan memeriksa hasilnya.


Dari folder `miyunime-creator-hub/`:

```bash
npm run seed     # membuat data demo di data/miyunime.db (menimpa database lama)
npm start        # menjalankan server
```

Buka **http://localhost:3000**. Port lain: `PORT=4000 npm start` (Windows PowerShell: `$env:PORT=4000; npm start`).

Variabel lingkungan (semua opsional): `PORT` (3000), `HOST` (`127.0.0.1`; pakai `0.0.0.0` agar bisa diakses dari mesin lain), `DATABASE_FILE` (`data/miyunime.db`), `DEMO_PASSWORD` (untuk `npm run seed`).
Server menulis log JSON satu baris per kejadian dan menyediakan `GET /healthz`. Arti tiap log: [docs/LOG-DAN-GALAT.md](docs/LOG-DAN-GALAT.md).

Pesan `ExperimentalWarning: SQLite is an experimental feature` di terminal normal dan bisa diabaikan.

### Akun demo

Kata sandi semua akun: **`miyunime123`**

| Peran | Email | Kondisi data demo |
|-------|-------|-------------------|
| Admin | `admin@miyunime.id` | Melihat semua creator, mereview, mengatur kuota, mengunduh laporan |
| Creator | `aiko@miyunime.id` | Kuota 3 dari 4, dalam progres |
| Creator | `raka@miyunime.id` | Kuota terpenuhi, punya 1 konten menunggu review |
| Creator | `sari@miyunime.id` | Terlambat (periode lalu belum tercapai), punya 1 konten perlu revisi |
| Creator | `dewi@miyunime.id` | Belum punya kuota |

Mengulang dari awal kapan saja: hentikan server (Ctrl+C), jalankan `npm run seed`, lalu `npm start`.

## 3. Menjalankan pengujian

```bash
npm test
```

Hasil yang diharapkan: **77 tes, 77 lulus, 0 gagal** (11 suite, sekitar 8 detik), termasuk 15 tes keamanan. Tes memakai database dalam memori dan jam yang dibekukan,
jadi tidak menyentuh `data/miyunime.db` dan hasilnya sama setiap kali dijalankan.

Opsional, uji UI end-to-end dengan browser sungguhan (Playwright, Python):

```bash
pip install playwright && playwright install chromium
npm run seed && PORT=3100 npm start        # terminal 1
python3 test-e2e/e2e.py                    # terminal 2, harapannya: 32/32 lulus (termasuk XSS dan CSP)
```

Skrip itu juga memperbarui tangkapan layar `docs/bukti/mvp-*.png`. Jalankan `npm run seed` lagi sebelum demo karena uji e2e mengubah data.

## 4. Skenario demo singkat (sekitar 5 menit)

1. Buka aplikasi: layar **Masuk**. Coba sandi salah, muncul "Email atau kata sandi salah".
2. Masuk sebagai **Admin**: panel Pengingat (review menunggu, Sari terlambat), dashboard kuota, review, pengaturan kuota, laporan, log aktivitas.
3. Di panel **Menunggu review**: klik "Minta revisi" tanpa catatan (ditolak), lalu **Setujui** konten Raka.
4. Di **Pengaturan kuota**: pilih Dewi, isi target 3, tanggal mulai awal bulan ini, simpan. Dashboard berubah. Coba tanggal yang bertabrakan: ditolak.
5. Klik **Unduh laporan konten (CSV)** dan **laporan kuota (CSV)**, buka di Excel/Sheets.
6. **Keluar**, lalu masuk sebagai **Aiko**: kuota 3 dari 4. Simpan konten dengan judul kosong (ditolak). Buat konten dengan tautan draft.
7. Tandai konten itu sudah diupload dengan `https://example.com` (ditolak), lalu dengan `https://www.instagram.com/p/DemoAiko9/`: kuota menjadi 4 dari 4, **Terpenuhi**.
8. Coba filter riwayat (status, format, tanggal, cari judul) dan lihat **Aktivitas saya**.
9. Terminal: `npm test` (77 lulus).

## 5. Struktur proyek

```
miyunime-creator-hub/
├── src/            server, aturan bisnis, akses data (TypeScript)
│   ├── auth.ts          login, sesi token, hash sandi (scrypt), pembatas brute force
│   ├── logger.ts        log JSON aman (email tersamar)
│   ├── content.ts       konten: buat, daftar + filter, tandai upload, hapus
│   ├── review.ts        ajukan, setujui, minta revisi, riwayat review
│   ├── quota.ts         perhitungan progres dan status kuota, dashboard
│   ├── quota-settings.ts atur kuota per creator/periode
│   ├── notifications.ts pengingat tenggat dan antrean review
│   ├── activity.ts      log aktivitas
│   ├── report.ts        ekspor CSV
│   ├── db.ts            skema SQLite dan migrasi otomatis
│   └── seed.ts          data demo
├── public/         UI (HTML, CSS, JS tanpa build)
├── test/           pengujian otomatis (node:test), termasuk security.test.ts
├── test-e2e/       uji UI Playwright
├── scripts/        build.mjs, verify-fresh-clone.sh, log-samples.sh
└── docs/           brief fitur dan bukti verifikasi
```

## 6. Pemecahan masalah

| Gejala | Penyebab dan solusi |
|--------|---------------------|
| `SyntaxError` atau `Unknown file extension ".ts"` | Node terlalu lama. Pasang Node 22.18+ (`node -v`). |
| `Cannot find module 'node:sqlite'` | Node di bawah 22.5. Perbarui Node. |
| `EADDRINUSE` | Port 3000 dipakai program lain. Jalankan dengan `PORT=3001 npm start`. |
| Tidak bisa masuk padahal sandi benar | Database lama dari versi sebelumnya belum punya akun. Jalankan `npm run seed`. |
| "Terlalu banyak percobaan masuk yang gagal" (429) | Batas 5 gagal per 15 menit per email dan IP. Tunggu sesuai `Retry-After`, atau mulai ulang server (hitungan ada di memori). |
| Server tidak bisa diakses dari komputer lain | Bawaan hanya `127.0.0.1`. Set `HOST=0.0.0.0` (dan pasang HTTPS lewat proxy untuk penggunaan nyata). |
| "Sesi berakhir, silakan masuk lagi" | Sesi berlaku 12 jam atau server di-reset. Masuk kembali. |
| Dashboard Sari tidak terlambat / kuota kosong | Data seed bergantung pada tanggal hari ini. Jalankan ulang `npm run seed`. |
| Ingin mengembalikan semua data ke kondisi awal | Jalankan `npm run seed` (database lama otomatis ditimpa). Tanpa seed tidak ada akun, sehingga tidak bisa masuk. |

## 7. Batasan MVP yang diketahui

- Akun dibuat lewat seed. Belum ada layar pendaftaran, ganti kata sandi, atau manajemen pengguna.
- Peran yang ada: Admin dan Creator. Peran Super Admin terpisah belum dibedakan dari Admin.
- Pengingat tampil di dalam aplikasi, belum dikirim lewat email atau push notification.
- Ekspor berformat CSV (terbuka di Excel dan Google Sheets), belum `.xlsx`.
- Waktu disimpan dan periode kuota dihitung dalam UTC.
- Risiko keamanan yang belum ditutup (HTTPS lewat proxy, token di localStorage, kata sandi demo, pembatas laju di memori): lihat [docs/SECURITY.md](docs/SECURITY.md) bagian 3.
- Verifikasi otomatis postingan lewat Instagram Graph API (opsional di README) tidak termasuk MVP. Tautan hanya divalidasi bentuknya.
