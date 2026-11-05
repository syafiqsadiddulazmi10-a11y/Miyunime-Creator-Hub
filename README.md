# Miyunime-Creator-Hub

Aplikasi web untuk mengelola para **content creator Miyunime** (media Instagram). Creator menginput rencana konten **sebelum diupload** dan melengkapi data **setelah diupload**, sehingga tim dapat memastikan setiap creator memenuhi **kuota postingan** yang telah ditetapkan.

Status: **MVP 1.0.0 lengkap**. 77 tes otomatis lulus, 32 pemeriksaan UI di browser lulus. Rincian di [`checklist_mvp.md`](miyunime-creator-hub/checklist_mvp.md).

## Daftar Isi

- [Mulai cepat (fresh clone)](#mulai-cepat-fresh-clone)
- [Akses aplikasi dan akun demo](#akses-aplikasi-dan-akun-demo)
- [Konfigurasi](#konfigurasi)
- [Build dan deploy](#build-dan-deploy)
- [Memastikan semuanya jalan dari nol](#memastikan-semuanya-jalan-dari-nol)
- [Kontribusi dan pull request](#kontribusi-dan-pull-request)
- [Dokumen lain](#dokumen-lain)
- [Latar belakang, fitur, peran, alur, kuota, struktur data](#latar-belakang)
- [Tech stack dan struktur folder](#tech-stack)

---

## Mulai cepat (fresh clone)

Prasyarat: **Node.js 22.18 atau lebih baru** (`node -v`) dan Git. Tidak perlu database terpisah, tidak perlu `.env`, tidak ada paket yang diunduh.

```bash
git clone https://github.com/<username>/Miyunime-Creator-Hub.git
cd Miyunime-Creator-Hub/miyunime-creator-hub

npm ci            # install (proyek ini tanpa dependensi, jadi hanya memeriksa lockfile)
npm run build     # periksa sintaks UI, muat semua modul, susun paket dist/
npm test          # 77 tes, harapannya: pass 77, fail 0
npm run seed      # buat data demo + akun
npm start         # jalankan di http://localhost:3000
```

Satu perintah untuk build dan semua tes: `npm run verify`.

> Ganti `<username>` dengan akun GitHub pemilik repo. Langkah di atas sudah dijalankan dari clone bersih, hasilnya di [`docs/bukti/fresh-clone.txt`](miyunime-creator-hub/docs/bukti/fresh-clone.txt) bila berkas itu ada pada rilis Anda.

## Akses aplikasi dan akun demo

Buka **http://localhost:3000**. Kata sandi semua akun demo: `miyunime123`

| Peran | Email | Kondisi data demo |
|-------|-------|-------------------|
| Admin | `admin@miyunime.id` | Melihat semua creator, review, atur kuota, laporan, log aktivitas |
| Creator | `aiko@miyunime.id` | Kuota 3 dari 4, dalam progres |
| Creator | `raka@miyunime.id` | Kuota terpenuhi, 1 konten menunggu review |
| Creator | `sari@miyunime.id` | Terlambat, 1 konten perlu revisi |
| Creator | `dewi@miyunime.id` | Belum punya kuota |

Skenario demo 5 menit: [`HowToRun.md`](miyunime-creator-hub/HowToRun.md) bagian 4. **Jangan memakai kata sandi demo di produksi** (lihat bagian Deploy).

## Konfigurasi

Semua lewat variabel lingkungan, tidak ada berkas konfigurasi.

| Variabel | Bawaan | Fungsi |
|----------|--------|--------|
| `PORT` | `3000` | Port HTTP (1 sampai 65535) |
| `HOST` | `127.0.0.1` | Alamat yang didengarkan. Pakai `0.0.0.0` di server/Docker agar bisa diakses dari luar mesin |
| `DATABASE_FILE` | `data/miyunime.db` | Lokasi berkas SQLite (folder dibuat otomatis) |
| `DEMO_PASSWORD` | `miyunime123` | Kata sandi akun yang dibuat `npm run seed` |

Contoh Windows PowerShell: `$env:PORT=4000; npm start`

## Build dan deploy

**Build.** Tidak ada kompilasi: Node menjalankan TypeScript langsung dan UI berupa berkas statis. `npm run build` memeriksa sintaks semua JS UI, memastikan semua modul server termuat, lalu menyusun paket siap deploy di `dist/` (`src/`, `public/`, `package.json`, `BUILD-INFO.json`). Build gagal dengan exit code 1 bila ada yang rusak atau Node terlalu lama.

### Opsi A: server Linux (Node langsung)

```bash
# di server: Node 22.18+ terpasang
scp -r dist/ user@server:/opt/miyunime/        # atau git clone + npm run build di server
ssh user@server
cd /opt/miyunime
HOST=127.0.0.1 PORT=3000 DATABASE_FILE=/var/lib/miyunime/miyunime.db DEMO_PASSWORD='<sandi-kuat>' npm run seed   # hanya sekali, untuk data awal
HOST=127.0.0.1 PORT=3000 DATABASE_FILE=/var/lib/miyunime/miyunime.db node src/server-main.ts
```

Jalankan sebagai layanan (systemd), contoh `/etc/systemd/system/miyunime.service`:

```ini
[Unit]
Description=Miyunime Creator Hub
After=network.target

[Service]
User=miyunime
WorkingDirectory=/opt/miyunime
Environment=PORT=3000 HOST=127.0.0.1 DATABASE_FILE=/var/lib/miyunime/miyunime.db
ExecStart=/usr/bin/node src/server-main.ts
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

**Wajib HTTPS lewat reverse proxy.** Aplikasi tidak melayani TLS. Contoh Nginx:

```nginx
server {
  listen 443 ssl;
  server_name hub.example.com;
  # ssl_certificate / ssl_certificate_key sesuai penyedia sertifikat Anda
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header X-Forwarded-Proto https;      # mengaktifkan HSTS
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```

Pemantauan: `GET /healthz` mengembalikan `{"Status":"ok"}` (200) atau 503 bila database tak terjangkau. Format log dan cara menelusurinya: [`docs/LOG-DAN-GALAT.md`](miyunime-creator-hub/docs/LOG-DAN-GALAT.md).

### Opsi B: Docker

```bash
cd miyunime-creator-hub
docker compose up -d --build                     # http://localhost:3000, data di volume miyunime-data
docker compose exec miyunime node src/seed.ts    # hanya untuk data demo
```

> `Dockerfile` dan `docker-compose.yml` sudah disiapkan (user non-root, volume data, healthcheck), tetapi **belum dibangun/dijalankan di lingkungan pengembangan ini** karena Docker tidak tersedia di sana. Jalankan `bash scripts/verify-fresh-clone.sh` di mesin yang punya Docker untuk memastikannya.

### Checklist produksi

- [ ] HTTPS aktif lewat reverse proxy, aplikasi hanya mendengarkan `127.0.0.1` atau jaringan privat
- [ ] Kata sandi demo tidak dipakai (`DEMO_PASSWORD` kuat, atau akun dibuat sendiri)
- [ ] Folder database dicadangkan berkala dan izinnya dibatasi
- [ ] Pembatas laju di proxy untuk rute selain login (risiko R3 dan R5 di [`docs/SECURITY.md`](miyunime-creator-hub/docs/SECURITY.md))

## Memastikan semuanya jalan dari nol

Skrip berikut melakukan clone bersih ke folder sementara, lalu install, build, tes, jalankan dari sumber dan dari `dist/`, dan memeriksa health, login, dashboard, serta header keamanan. Exit code 0 berarti semua lulus.

```bash
bash miyunime-creator-hub/scripts/verify-fresh-clone.sh https://github.com/<username>/Miyunime-Creator-Hub.git main
# opsional: E2E=1 untuk uji UI Playwright, dan Docker build bila docker terpasang
```

CI GitHub Actions (`.github/workflows/ci.yml`) menjalankan `npm ci`, `npm run build`, `npm test`, dan smoke test `dist/` pada setiap push ke `main` dan setiap pull request.

## Kontribusi dan pull request

```bash
git checkout -b fitur/nama-fitur
# ...ubah kode...
cd miyunime-creator-hub && npm run verify      # build + semua tes harus hijau
git add -A && git commit -m "feat: deskripsi singkat"
git push origin fitur/nama-fitur
```

Buka Pull Request ke `main`; templat checklist akan muncul otomatis (`.github/pull_request_template.md`). Merge hanya bila CI hijau.

## Dokumen lain

| Dokumen | Isi |
|---------|-----|
| [`HowToRun.md`](miyunime-creator-hub/HowToRun.md) | Petunjuk menjalankan, skenario demo, pemecahan masalah |
| [`checklist_mvp.md`](miyunime-creator-hub/checklist_mvp.md) | Checklist seluruh fitur MVP dan status pengujiannya |
| [`docs/SECURITY.md`](miyunime-creator-hub/docs/SECURITY.md) | Hasil uji keamanan, temuan, risiko sisa, catatan perubahan |
| [`docs/LOG-DAN-GALAT.md`](miyunime-creator-hub/docs/LOG-DAN-GALAT.md) | Contoh log aman, penyebab galat, tindakan perbaikan |
| [`docs/PR-MVP.md`](miyunime-creator-hub/docs/PR-MVP.md) | Deskripsi pull request MVP final |

---

## Latar Belakang

Miyunime memiliki banyak content creator yang memposting konten di Instagram. Pemantauan kuota posting secara manual (lewat chat atau spreadsheet terpisah) sulit dilacak dan rawan terlewat. Aplikasi ini menyatukan seluruh proses dalam satu tempat.

## Tujuan

- Menyediakan satu tempat bagi creator untuk mencatat konten **pra-upload** dan **pasca-upload**.
- Memudahkan admin memantau progres kuota tiap creator secara real-time.
- Mengurangi kelalaian posting dan mempermudah evaluasi kinerja periodik.

## Fitur Utama

**Untuk Creator**
- Input rencana konten (judul/topik, caption, format, jadwal upload, tautan aset/draft).
- Update status konten setelah diupload (tautan postingan Instagram, tanggal & jam upload).
- Dashboard progres kuota pribadi (terpenuhi / tersisa / terlambat).
- Riwayat konten per periode.

**Untuk Admin / Editor**
- Dashboard ringkasan seluruh creator (siapa yang sudah, belum, atau hampir memenuhi kuota).
- Review dan persetujuan konten pra-upload (opsional).
- Pengaturan kuota per creator atau per periode (mingguan/bulanan).
- Filter dan pencarian konten berdasarkan creator, status, format, dan tanggal.
- Ekspor laporan (CSV/Excel).

**Umum**
- Autentikasi dan otorisasi berbasis peran.
- Notifikasi/pengingat mendekati tenggat kuota.
- Log aktivitas perubahan status konten.

## Peran Pengguna

| Peran | Hak Akses |
|-------|-----------|
| **Super Admin** | Kelola seluruh data, pengguna, dan pengaturan kuota |
| **Admin / Editor** | Pantau kuota, review konten, buat laporan |
| **Creator** | Input dan update konten miliknya sendiri, lihat progres kuota pribadi |

## Alur Kerja Konten

```
[Draft] → [Diajukan] → [Disetujui] → [Terjadwal] → [Sudah Diupload]
                ↓
            [Revisi]
```

1. **Draft** – Creator mulai mencatat ide/rencana konten.
2. **Diajukan** – Creator mengirim konten untuk direview (jika review diaktifkan).
3. **Revisi / Disetujui** – Admin memberi masukan atau menyetujui.
4. **Terjadwal** – Konten siap dengan tanggal upload.
5. **Sudah Diupload** – Creator mengisi tautan postingan Instagram dan waktu upload aktual.

> Hanya konten berstatus **Sudah Diupload** yang dihitung untuk pemenuhan kuota.

## Aturan Kuota

- Kuota ditentukan per creator dan per periode (contoh: 5 postingan/minggu).
- Konten dihitung terpenuhi jika status **Sudah Diupload** dan tautan postingan valid.
- Status kuota: `Terpenuhi`, `Dalam Progres`, `Terlambat`.
- Aturan detail (jenis konten yang dihitung, toleransi keterlambatan, dll.) dapat disesuaikan oleh admin.

## Struktur Data

Gambaran entitas utama (dapat disesuaikan):

- **users** – id, nama, email, password_hash, role, instagram_handle
- **quotas** – id, user_id, periode (mingguan/bulanan), jumlah_target, tanggal_mulai, tanggal_selesai
- **contents** – id, user_id, judul, caption, format (feed/reels/story/carousel), status, jadwal_upload, link_draft, link_instagram, uploaded_at, catatan
- **content_reviews** – id, content_id, reviewer_id, status, komentar, created_at
- **activity_logs** – id, user_id, aksi, target, created_at

## Tech Stack

- **Frontend:** HTML, CSS, dan JavaScript biasa (tanpa build), panel per peran
- **Backend:** Node.js 22.18+ (`node:http`), TypeScript dijalankan langsung oleh Node
- **Database:** SQLite (`node:sqlite`), migrasi otomatis saat dibuka
- **Autentikasi:** email dan kata sandi (hash scrypt), token sesi 12 jam, otorisasi per peran, pembatas brute force
- **Pengujian:** `node:test` (77 tes, termasuk 15 tes keamanan) dan uji UI Playwright (32 pemeriksaan)
- **Deployment:** Node langsung + systemd + Nginx (HTTPS), atau Docker

## Struktur Folder

```
Miyunime-Creator-Hub/
├── .github/            CI (ci.yml) dan templat pull request
└── miyunime-creator-hub/
    ├── src/            server, aturan bisnis, database, logger, seed
    ├── public/         UI (index.html, panel per fitur)
    ├── test/           pengujian otomatis (node:test)
    ├── test-e2e/       uji UI Playwright
    ├── scripts/        build.mjs, verify-fresh-clone.sh, log-samples.sh
    ├── docs/           brief fitur, keamanan, log, bukti verifikasi
    ├── Dockerfile, docker-compose.yml
    ├── HowToRun.md
    └── checklist_mvp.md
```

## Roadmap

- [x] Autentikasi dan manajemen peran (Admin, Creator)
- [x] CRUD konten pra-upload dan pasca-upload
- [x] Pengaturan kuota per creator/periode
- [x] Dashboard progres kuota (creator & admin)
- [x] Alur review dan persetujuan konten
- [x] Pengingat kuota (di dalam aplikasi) dan log aktivitas
- [x] Ekspor laporan CSV (dibuka di Excel/Sheets)
- [x] Hardening keamanan (header, CSP, pembatas login, log aman)
- [ ] Pengingat lewat email/push, ekspor `.xlsx`, peran Super Admin dan manajemen pengguna _(pasca-MVP)_
- [ ] Cookie `HttpOnly` untuk sesi, ganti kata sandi _(pasca-MVP)_
- [ ] Integrasi Instagram Graph API untuk verifikasi postingan otomatis _(opsional)_

## Lisensi

Proyek ini bersifat internal untuk **Miyunime**.
