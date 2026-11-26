# PR: Selesaikan MVP Miyunime Creator Hub (fitur 6 sampai 9, hardening keamanan, dokumentasi, CI)

Branch: `feat/mvp-final` ke `main`

## Ringkasan

Melengkapi MVP di atas fondasi fitur 1 sampai 5: login sungguhan, log aktivitas dan pengingat, riwayat/filter konten, hardening keamanan,
log operasional yang aman, build dan paket deploy, serta dokumentasi dan CI. Aplikasi bisa dijalankan dari clone bersih dengan
`npm ci && npm run build && npm test && npm run seed && npm start`.

## Perubahan utama

- **Fitur 6, autentikasi:** login email dan sandi (scrypt), token sesi 12 jam, logout, pembatas brute force. Header `X-User-Id` dihapus.
- **Fitur 7, log aktivitas dan pengingat**, **fitur 8, riwayat/filter konten dan tautan aset/draft.**
- **Fitur 9, keamanan:** header dan CSP, batas ukuran isi (413), galat 500 aman dengan `ErrorId`, `/healthz`, log JSON aman, bawaan `127.0.0.1`.
- **UI:** layar login, status memuat, penanganan gagal koneksi dan sesi habis, tombol dikunci saat permintaan berjalan.
- **Operasional:** `npm run build` (menghasilkan `dist/`), `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, skrip `verify-fresh-clone.sh` dan `log-samples.sh`.
- **Dokumen:** README (fresh clone, build, deploy), `HowToRun.md`, `checklist_mvp.md`, `docs/SECURITY.md`, `docs/LOG-DAN-GALAT.md`.

## Dampak yang perlu diperhatikan reviewer

- **Breaking:** klien harus memakai `Authorization: Bearer <token>`. `GET /api/users` kini khusus admin.
- Database lama dimigrasi otomatis (kolom login dan tautan draft, tabel sesi dan log). Akun harus dibuat dengan `npm run seed`.
- `npm run seed` menimpa database.
- Seluruh berkas diseragamkan ke akhir baris LF, sehingga diff berkas lama tampak besar. Gunakan `git diff -w` atau `--ignore-space-at-eol`.
- Server kini mendengarkan `127.0.0.1` secara bawaan. Set `HOST=0.0.0.0` untuk server/Docker.

## Pengujian

- [x] `npm run verify` lulus: build OK, **77 dari 77 tes lulus**
- [x] Uji UI Playwright: 32 dari 32 lulus
- [x] Fresh clone dari repo remote, lalu install, build, tes, jalankan dari sumber dan `dist/`: lulus
- [ ] CI GitHub Actions hijau (baru bisa dipastikan setelah PR dibuka)
- [ ] `docker compose up --build` (belum dicoba: Docker tidak tersedia di lingkungan pengembangan)

## Risiko sisa

Lihat [SECURITY.md](SECURITY.md) bagian 3 (HTTPS via proxy, token di localStorage, kata sandi demo, pembatas laju di memori).
