# Fitur 2: Dashboard kuota creator dan admin

## Brief

Admin perlu tahu sekilas siapa yang sudah memenuhi kuota postingan, siapa yang masih berjalan, dan siapa yang terlambat. Creator perlu
melihat sisa kuotanya sendiri. Fitur ini memakai data dari fitur 1: hanya konten yang benar-benar sudah diupload yang dihitung.

Pengguna: admin (melihat semua creator), creator (melihat progres dirinya).

### Acceptance criteria

| Kode | Kriteria |
|------|----------|
| AC1 | Dashboard admin memuat tiap creator dengan `TargetCount`, `UploadedCount`, `RemainingCount`, `QuotaStatus`, dan periode kuota. |
| AC2 | `FULFILLED` jika terupload >= target (walau periode sudah lewat), `LATE` jika periode lewat dan belum cukup, `IN_PROGRESS` selain itu, `NO_QUOTA` jika creator belum punya kuota. |
| AC3 | Hanya konten `UPLOADED` dengan tautan Instagram dan `UploadedAt` di dalam periode kuota yang dihitung. Draft, terjadwal, upload di luar periode, dan upload tanpa tautan tidak dihitung. |
| AC4 | Ringkasan admin benar (jumlah creator per status dan total konten terupload periode ini), dan creator terlambat diurutkan paling atas. |
| AC5 | Creator melihat progres dirinya lewat `/api/dashboard/me`, dan angkanya naik setelah ia menandai konten diupload (fitur 1). |
| AC6 | Creator tidak bisa membuka dashboard admin (403), admin tidak bisa membuka dashboard pribadi (403), tanpa identitas 401. |
| AC7 | Jika creator punya kuota lama dan kuota berjalan, yang dipakai adalah kuota berjalan. |

## Plan

Keputusan desain:

- Status dihitung saat dibaca (tidak disimpan), jadi tidak bisa basi dan selalu konsisten dengan data konten.
- Kuota yang dipakai: kuota yang periodenya mencakup waktu sekarang, jika tidak ada maka kuota terbaru. Itulah yang memungkinkan status `LATE`.
- `NO_QUOTA` ditambahkan di luar tiga status pada dokumen arsitektur agar creator tanpa kuota tidak hilang diam-diam dari dashboard admin.
- Urutan daftar admin: `LATE`, `IN_PROGRESS`, `NO_QUOTA`, `FULFILLED`, lalu nama. Yang butuh perhatian ada di atas.
- Jam server (`Now`) disuntikkan ke logika, sehingga pengujian deterministik.
- Batasan v1: periode kuota disimpan dan ditampilkan dalam UTC. Pengaturan kuota lewat UI belum ada (kuota berasal dari seed).

Langkah:

1. `src/quota.ts`: `ComputeQuotaStatus`, `BuildProgress`, dua handler, dan daftar rute. Daftarkan di `src/server.ts`.
2. `test/quota.test.ts`: satu pengujian per acceptance criteria, data tetap dengan tanggal tetap.
3. `public/dashboard.js` dan gaya meter slot: satu slot per target posting, terisi saat konten diupload.
4. Verifikasi: seluruh pengujian (termasuk regresi fitur 1), uji mutasi, snapshot API, dan UI Playwright.

## Build

Dikerjakan AI Agent (Claude): `src/quota.ts`, rute di `src/server.ts`, `public/dashboard.js`, gaya meter di `public/style.css`, dan
`test/quota.test.ts`. Alur data:

```text
Content (status UPLOADED, tautan, UploadedAt)  +  Quota (target, periode)
        -> BuildProgress(): pilih kuota, hitung konten yang memenuhi syarat, hitung status dari jam server
        -> /api/dashboard/me atau /api/dashboard/admin (JSON PascalCase)
        -> dashboard.js menggambar meter: satu slot per target posting, terisi saat konten diupload
```

## Verify

| Bukti | Berkas | Hasil |
|-------|--------|-------|
| Seluruh pengujian, termasuk regresi fitur 1 | [fitur-2-test.txt](bukti/fitur-2-test.txt) | 13 lulus (6 fitur 1, 7 fitur 2), 0 gagal |
| Uji mutasi (3 perusakan kode yang disengaja) | [fitur-2-mutasi.txt](bukti/fitur-2-mutasi.txt) | Setiap perusakan membuat pengujian terkait gagal, dan semua lulus setelah dipulihkan |
| Snapshot API dari data seed | [fitur-2-api.txt](bukti/fitur-2-api.txt) | Sari LATE, Aiko IN_PROGRESS, Dewi NO_QUOTA, Raka FULFILLED, creator ke dashboard admin 403 |
| Skenario UI di browser (Playwright), termasuk lebar 390px | [fitur-2-ui.txt](bukti/fitur-2-ui.txt) dan `bukti/fitur-2-*.png` | Aiko 3 dari 4 menjadi 4 dari 4 Terpenuhi, ringkasan admin ikut berubah, tanpa gulir horizontal di ponsel |

## Review

Bagian ini harus diisi mahasiswa setelah membaca kodenya. Hal yang layak ditinjau dan diputuskan:

- `LATE` hanya muncul setelah periode berakhir (sesuai dokumen arsitektur). Apakah admin perlu peringatan lebih awal untuk creator yang tertinggal?
- `NO_QUOTA` ditambahkan di luar dokumen arsitektur. Apakah tetap dipakai atau creator tanpa kuota disembunyikan?
- Periode kuota memakai UTC, sedangkan tim berada di WIB (UTC+7). Posting di dini hari awal bulan WIB bisa masuk periode bulan sebelumnya. Apakah perlu zona waktu WIB?
- Urutan daftar admin (terlambat, dalam progres, belum ada kuota, terpenuhi): apakah sesuai cara admin bekerja?
- `BuildProgress` menjalankan dua kueri per creator. Aman untuk puluhan creator, perlu dioptimalkan jika jumlahnya jauh lebih besar.

Catatan mahasiswa (isi sendiri):

| Yang saya review | Yang saya ubah | Alasan perubahan |
|------------------|----------------|------------------|
|                  |                |                  |
