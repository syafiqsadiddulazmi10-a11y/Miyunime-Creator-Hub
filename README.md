# Miyunime-Creator-Hub

Aplikasi web untuk mengelola para **content creator Miyunime** (media Instagram). Creator menginput rencana konten **sebelum diupload** dan melengkapi data **setelah diupload**, sehingga tim dapat memastikan setiap creator memenuhi **kuota postingan** yang telah ditetapkan.

---

## Daftar Isi

- [Latar Belakang](#latar-belakang)
- [Tujuan](#tujuan)
- [Fitur Utama](#fitur-utama)
- [Peran Pengguna](#peran-pengguna)
- [Alur Kerja Konten](#alur-kerja-konten)
- [Aturan Kuota](#aturan-kuota)
- [Struktur Data](#struktur-data)
- [Tech Stack](#tech-stack)
- [Instalasi](#instalasi)
- [Konfigurasi Environment](#konfigurasi-environment)
- [Struktur Folder](#struktur-folder)
- [Roadmap](#roadmap)
- [Kontribusi](#kontribusi)
- [Lisensi](#lisensi)

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

> Sesuaikan dengan teknologi yang Anda gunakan.

- **Frontend:** _(contoh: React / Next.js / Vue)_
- **Backend:** _(contoh: Node.js + Express / Laravel / Django)_
- **Database:** _(contoh: PostgreSQL / MySQL)_
- **Autentikasi:** _(contoh: JWT / NextAuth / Laravel Sanctum)_
- **Deployment:** _(contoh: Vercel / VPS / Docker)_

## Instalasi

```bash
# 1. Clone repositori
git clone https://github.com/<username>/miyunime-creator-hub.git
cd miyunime-creator-hub

# 2. Install dependensi
npm install

# 3. Salin file environment
cp .env.example .env

# 4. Jalankan migrasi database
npm run migrate

# 5. Jalankan aplikasi mode development
npm run dev
```

Aplikasi akan berjalan di `http://localhost:3000`.

## Konfigurasi Environment

Contoh isi `.env`:

```env
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://user:password@localhost:5432/miyunime_hub
JWT_SECRET=ganti_dengan_secret_yang_aman
```

## Struktur Folder

```
miyunime-creator-hub/
├── src/
│   ├── components/     # Komponen UI
│   ├── pages/          # Halaman aplikasi
│   ├── services/       # Logika bisnis & API
│   ├── models/         # Skema/model database
│   └── utils/          # Fungsi bantu
├── public/             # Aset statis
├── docs/               # Dokumentasi tambahan
├── .env.example
└── README.md
```

## Roadmap

- [ ] Autentikasi dan manajemen peran
- [ ] CRUD konten pra-upload dan pasca-upload
- [ ] Pengaturan kuota per creator/periode
- [ ] Dashboard progres kuota (creator & admin)
- [ ] Alur review dan persetujuan konten
- [ ] Notifikasi pengingat kuota
- [ ] Ekspor laporan CSV/Excel
- [ ] Integrasi Instagram Graph API untuk verifikasi postingan otomatis _(opsional)_

## Kontribusi

1. Fork repositori ini.
2. Buat branch fitur: `git checkout -b fitur/nama-fitur`
3. Commit perubahan: `git commit -m "feat: deskripsi singkat"`
4. Push ke branch: `git push origin fitur/nama-fitur`
5. Buka Pull Request.

## Lisensi

Proyek ini bersifat internal untuk **Miyunime**. 
