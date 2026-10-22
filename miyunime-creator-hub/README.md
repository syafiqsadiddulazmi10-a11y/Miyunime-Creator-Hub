# Miyunime Creator Hub

Web internal untuk memantau pemenuhan kuota postingan content creator Miyunime (media Instagram).
Creator mencatat konten sebelum dan sesudah diupload, admin melihat siapa yang sudah memenuhi kuota.

MVP Version 1 mencakup dua fitur inti:

| Fitur | Dokumen | Status |
|-------|---------|--------|
| 1. Input konten pra-upload dan pasca-upload | [docs/FITUR-1-INPUT-KONTEN.md](docs/FITUR-1-INPUT-KONTEN.md) | selesai |
| 2. Dashboard kuota creator dan admin | [docs/FITUR-2-DASHBOARD-KUOTA.md](docs/FITUR-2-DASHBOARD-KUOTA.md) | selesai |

Di luar cakupan v1: login JWT, alur review konten, pengaturan kuota lewat UI, ekspor CSV.

## Menjalankan

Prasyarat: Node.js 22.18 atau lebih baru. Tidak ada `npm install` karena proyek ini tanpa dependency eksternal.

```bash
npm run seed    # buat data demo di data/miyunime.db (1 admin, 4 creator)
npm start       # buka http://localhost:3000
npm test        # jalankan seluruh pengujian
```

Pilih pengguna lewat dropdown di kanan atas. Pilihan ini dikirim sebagai header `X-User-Id` dan menggantikan login JWT di v1.

## Struktur

```text
src/        server.ts (routing), db.ts (skema SQLite), http.ts (tipe), seed.ts, modul per fitur
public/     UI statis: app.js (kerangka), modul UI per fitur, style.css
test/       pengujian end-to-end lewat HTTP (node:test)
docs/       brief, rencana, dan bukti verifikasi per fitur
```

## Catatan stack

Arsitektur target di `ARSITEKTUR.md` memakai React, Express, Prisma, dan PostgreSQL. MVP ini dibangun tanpa dependency karena
lingkungan pengembangannya tanpa akses jaringan: Node 22 (TypeScript native), SQLite bawaan Node, dan frontend statis.
Nama entitas, nama field (PascalCase), dan rute API sengaja sama dengan dokumen arsitektur agar mudah dipindahkan ke stack target.

## API

| Rute | Peran | Fitur |
|------|-------|-------|
| `GET /api/users` | publik | kerangka |
| `GET /api/contents?Status=` | creator (miliknya), admin (semua) | 1 |
| `POST /api/contents` | creator | 1 |
| `POST /api/contents/:Id/upload` | creator | 1 |
| `DELETE /api/contents/:Id` | creator | 1 |
| `GET /api/dashboard/me` | creator | 2 |
| `GET /api/dashboard/admin` | admin | 2 |

Semua rute selain `/api/users` membutuhkan header `X-User-Id`. Nama properti JSON memakai PascalCase.
