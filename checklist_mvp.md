# Checklist MVP: Miyunime Creator Hub

Versi: 1.0.0 (MVP)

Status pengujian: **unit/integrasi test PASSED, 62 dari 62 tes lulus** (`npm test`, bukti: [docs/bukti/mvp-test.txt](docs/bukti/mvp-test.txt)).
Uji UI end-to-end di browser (Playwright): **28 dari 28 lulus** ([test-e2e/e2e.py](test-e2e/e2e.py), tangkapan layar `docs/bukti/mvp-*.png`).

Keterangan: ✅ selesai dan lulus uji, ⚠️ selesai dengan batasan yang tercatat, ⬜ di luar lingkup MVP.

## A. Ringkasan per fitur

| No | Fitur MVP | Suite tes | Jumlah tes | Status uji |
|----|-----------|-----------|-----------:|------------|
| 1 | Input konten pra-upload dan pasca-upload | `content.test.ts` | 6 | ✅ PASSED |
| 2 | Dashboard progres kuota (creator dan admin) | `quota.test.ts` | 7 | ✅ PASSED |
| 3 | Pengaturan kuota per creator dan periode | `quota-settings.test.ts` | 7 | ✅ PASSED |
| 4 | Review dan persetujuan konten | `review.test.ts` | 7 | ✅ PASSED |
| 5 | Ekspor laporan dan filter konten | `report.test.ts` | 6 | ✅ PASSED |
| 6 | Autentikasi dan otorisasi berbasis peran | `auth.test.ts` | 9 | ✅ PASSED |
| 7 | Log aktivitas dan pengingat kuota | `activity.test.ts` | 7 | ✅ PASSED |
| 8 | Riwayat konten, filter, dan tautan aset/draft | `history.test.ts` | 7 | ✅ PASSED |
| - | Skema database dan migrasi | `db.test.ts` | 3 | ✅ PASSED |
| - | Aturan bisnis murni (unit) | `rules.test.ts` | 3 | ✅ PASSED |
| | **Total** | 10 suite | **62** | ✅ **62 lulus, 0 gagal** |

## B. Checklist rinci

### Fitur 1: Input konten (Creator)

| Kriteria | Status | Bukti |
|----------|--------|-------|
| Creator membuat rencana konten (judul, format, jadwal, caption, tautan aset/draft) | ✅ | `content.test.ts` AC1, `history.test.ts` AC6, e2e |
| Status awal DRAFT, atau SCHEDULED jika ada jadwal | ✅ | `content.test.ts` AC1 |
| Validasi: judul wajib (maks 120), format FEED/REELS/STORY/CAROUSEL, caption maks 2200, jadwal valid | ✅ | `content.test.ts` AC2, `rules.test.ts` |
| Tautan aset/draft harus http(s) valid (menolak `javascript:`, `ftp:`, teks biasa) | ✅ | `history.test.ts` AC6 |
| Tandai Sudah Diupload dengan tautan Instagram valid, `UploadedAt` diisi server | ✅ | `content.test.ts` AC3 |
| Tautan kosong atau bukan postingan Instagram ditolak, status tidak berubah | ✅ | `content.test.ts` AC4, `rules.test.ts` |
| Konten Sudah Diupload tidak bisa ditandai ulang atau dihapus (409) | ✅ | `content.test.ts` AC5 |
| Creator hanya mengakses miliknya (404 untuk milik orang lain), admin tidak bisa membuat (403) | ✅ | `content.test.ts` AC6 |

### Fitur 2: Dashboard kuota

| Kriteria | Status | Bukti |
|----------|--------|-------|
| Admin melihat target, terupload, sisa, status, dan periode tiap creator | ✅ | `quota.test.ts` AC1 |
| Status Terpenuhi / Dalam progres / Terlambat / Belum ada kuota dihitung saat dibaca | ✅ | `quota.test.ts` AC2, `rules.test.ts` (batas 1 milidetik) |
| Hanya konten UPLOADED bertautan dan di dalam periode yang dihitung | ✅ | `quota.test.ts` AC3 |
| Ringkasan admin benar, creator terlambat diurutkan paling atas | ✅ | `quota.test.ts` AC4 |
| Creator melihat progres pribadi yang naik setelah upload | ✅ | `quota.test.ts` AC5, e2e (3 dari 4 menjadi 4 dari 4) |
| Akses dashboard dibatasi per peran; kuota berjalan didahulukan atas kuota lama | ✅ | `quota.test.ts` AC6, AC7 |

### Fitur 3: Pengaturan kuota (Admin)

| Kriteria | Status | Bukti |
|----------|--------|-------|
| Admin menetapkan kuota mingguan/bulanan, akhir periode dihitung server | ✅ | `quota-settings.test.ts` AC1, AC2 |
| Input tidak valid ditolak (target 1 sampai 100, tanggal fiktif, creator tidak ada) | ✅ | `quota-settings.test.ts` AC3, e2e (target 0) |
| Periode yang tumpang tindih untuk creator yang sama ditolak (409) | ✅ | `quota-settings.test.ts` AC4, e2e |
| Hanya admin yang mengatur; hanya kuota masa depan yang dapat dihapus | ✅ | `quota-settings.test.ts` AC5, AC6 |
| Kuota baru langsung terbaca dashboard | ✅ | `quota-settings.test.ts` AC7, e2e (Dewi) |

### Fitur 4: Review dan persetujuan konten

| Kriteria | Status | Bukti |
|----------|--------|-------|
| Creator mengajukan konten (DRAFT/SCHEDULED menjadi SUBMITTED), konten terkunci selama direview | ✅ | `review.test.ts` AC1, AC2 |
| Admin menyetujui, lalu creator bisa menandai upload | ✅ | `review.test.ts` AC3, e2e |
| Minta revisi wajib bercatatan; creator memperbaiki dan mengajukan ulang (harus ada perubahan) | ✅ | `review.test.ts` AC4, `history.test.ts` AC7, e2e |
| Hanya admin yang mereview, hanya konten SUBMITTED, keputusan valid | ✅ | `review.test.ts` AC5 |
| Riwayat review tercatat berurutan, dilihat pemilik dan admin | ✅ | `review.test.ts` AC6 |
| Review opsional; kuota tetap hanya menghitung UPLOADED | ✅ | `review.test.ts` AC7 |

### Fitur 5: Laporan dan filter (Admin)

| Kriteria | Status | Bukti |
|----------|--------|-------|
| Unduh laporan konten CSV yang terbuka di Excel (BOM UTF-8) | ✅ | `report.test.ts` AC1, e2e |
| Filter creator, status, format, tanggal, cari judul (dan gabungannya) | ✅ | `report.test.ts` AC2 |
| Filter tidak valid ditolak 400 berpesan Indonesia | ✅ | `report.test.ts` AC3 |
| Sel CSV dikutip benar, rumus spreadsheet dinetralkan (CSV injection) | ✅ | `report.test.ts` AC4 |
| Laporan kuota sama persis dengan dashboard | ✅ | `report.test.ts` AC5 |
| Laporan hanya untuk admin | ✅ | `report.test.ts` AC6 |
| Format `.xlsx` | ⬜ | Di luar MVP, CSV dibuka langsung di Excel/Sheets |

### Fitur 6: Autentikasi dan otorisasi

| Kriteria | Status | Bukti |
|----------|--------|-------|
| Login email dan kata sandi, token sesi (berlaku 12 jam), logout mencabut token | ✅ | `auth.test.ts` AC1, AC4, e2e |
| Sandi salah dan email tidak dikenal memberi pesan yang sama (akun tidak bocor); input kosong 400 | ✅ | `auth.test.ts` AC2, e2e |
| Tanpa token, token palsu, header lama `X-User-Id`: 401 | ✅ | `auth.test.ts` AC3 |
| Sesi kedaluwarsa ditolak; UI kembali ke layar login | ✅ | `auth.test.ts` AC5, e2e |
| Kata sandi disimpan sebagai hash scrypt bergaram | ✅ | `auth.test.ts` AC6 |
| Pembatasan peran Admin/Creator di semua rute, daftar pengguna hanya untuk admin | ✅ | `auth.test.ts` AC7 dan seluruh suite fitur 1 sampai 5 (lewat token) |
| Isi permintaan bukan JSON: 400; galat tak terduga: 500 berpesan aman | ✅ | `auth.test.ts` AC8 |
| Peran Super Admin terpisah, pendaftaran, ganti sandi | ⬜ | Di luar MVP |

### Fitur 7: Log aktivitas dan pengingat

| Kriteria | Status | Bukti |
|----------|--------|-------|
| Perubahan konten, review, kuota, dan login tercatat (pelaku, aksi, waktu) | ✅ | `activity.test.ts` AC1, `auth.test.ts` AC9 |
| Tindakan yang ditolak tidak tercatat | ✅ | `activity.test.ts` AC2 |
| Creator hanya melihat log miliknya, admin melihat semua | ✅ | `activity.test.ts` AC3, AC4 |
| Pengingat creator: tenggat 3 hari, terlambat, konten perlu revisi, belum ada kuota | ✅ | `activity.test.ts` AC5, AC6 |
| Pengingat admin: review tertunda dan creator terlambat/hampir tenggat | ✅ | `activity.test.ts` AC7 |
| Notifikasi email atau push | ⬜ | Di luar MVP, pengingat tampil di dalam aplikasi |

### Fitur 8: Riwayat dan filter konten

| Kriteria | Status | Bukti |
|----------|--------|-------|
| Creator melihat riwayat miliknya saja, terbaru di atas | ✅ | `history.test.ts` AC1 |
| Filter periode (waktu upload, atau waktu dibuat jika belum upload) | ✅ | `history.test.ts` AC2 |
| Filter status, format, cari judul (karakter `%` dan `_` aman) | ✅ | `history.test.ts` AC3, e2e |
| Filter tidak valid ditolak 400; filter creator hanya berlaku untuk admin | ✅ | `history.test.ts` AC4, AC5 |

## C. Penanganan input tidak valid, data kosong, loading, dan kegagalan

| Kasus | Penanganan | Status | Bukti |
|-------|------------|--------|-------|
| Input tidak valid | Validasi di server (sumber kebenaran) dengan pesan Indonesia, ditambah pemeriksaan cepat di UI | ✅ | Seluruh suite, e2e |
| Data kosong | Pesan kosong khusus tiap panel (belum ada konten, kuota, aktivitas, pengingat, creator, hasil filter) | ✅ | e2e (filter tanpa hasil), seed (Dewi tanpa kuota) |
| Loading | Setiap panel menampilkan "Memuat..." (`aria-busy`); tombol dikunci selama permintaan agar tidak terkirim ganda | ✅ | e2e |
| Gagal jaringan/server mati | Pesan "Tidak dapat terhubung ke server", tombol aktif lagi; panel gagal punya tombol "Coba lagi" | ✅ | Diuji manual dengan server dimatikan |
| Sesi habis atau token rusak | UI kembali ke layar login tanpa galat | ✅ | `auth.test.ts` AC5, e2e |
| Galat tak terduga di server | Dijawab 500 berpesan aman, detail hanya di log server | ✅ | `server.ts` |
| Database lama | Migrasi otomatis saat dibuka (status review, kolom login dan tautan draft) tanpa kehilangan data | ✅ | `db.test.ts` |

## D. Alur utama dari awal sampai akhir

| Alur | Status | Bukti |
|------|--------|-------|
| Masuk, buat konten, ajukan review, admin menyetujui, tandai upload, kuota terpenuhi, dashboard admin ikut berubah | ✅ | `review.test.ts` AC7, `quota.test.ts` AC5, e2e |
| Revisi: admin minta revisi bercatatan, creator memperbaiki dan mengajukan ulang, disetujui | ✅ | `review.test.ts` AC4, `history.test.ts` AC7 |
| Admin menetapkan kuota baru, creator langsung melihat progresnya | ✅ | `quota-settings.test.ts` AC7, e2e |
| Admin mengunduh laporan konten dan kuota | ✅ | `report.test.ts`, e2e |
| Keluar dan masuk dengan akun lain, tampilan sesuai peran | ✅ | e2e |

## E. Uji regresi

Setelah penambahan fitur 6 sampai 8, seluruh 39 tes awal (fitur 1 sampai 5, skema, aturan murni) dijalankan ulang tanpa perubahan pada
kasus ujinya. Satu-satunya perubahan di `test/helpers.ts` adalah autentikasi tes beralih dari header `X-User-Id` ke token sesi.
Hasil akhir: 62 lulus, 0 gagal.

## F. Cara mengulang pengujian

```bash
npm test                                   # 62 tes
python3 test-e2e/e2e.py                    # 28 pemeriksaan UI (lihat HowToRun.md bagian 3)
```
