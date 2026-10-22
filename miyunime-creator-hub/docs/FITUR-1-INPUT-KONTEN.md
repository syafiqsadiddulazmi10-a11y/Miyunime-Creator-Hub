# Fitur 1: Input konten pra-upload dan pasca-upload

## Brief

Creator Miyunime perlu mencatat konten sebelum diupload (judul, format, jadwal) dan melengkapinya setelah diupload dengan tautan
postingan Instagram. Tanpa data ini admin tidak bisa memastikan kuota terpenuhi (fitur 2). Satu konten dihitung "sudah diupload"
hanya jika ada tautan Instagram yang valid.

Pengguna: creator (membuat dan menandai konten miliknya), admin (hanya melihat semua konten).

### Acceptance criteria

| Kode | Kriteria |
|------|----------|
| AC1 | Creator dapat membuat konten. Status awal `DRAFT`, atau `SCHEDULED` jika jadwal upload diisi. Konten tersimpan atas nama pembuatnya. |
| AC2 | Judul kosong atau format di luar FEED, REELS, STORY, CAROUSEL ditolak dengan HTTP 400 dan pesan berbahasa Indonesia. |
| AC3 | Creator dapat menandai konten `UPLOADED` dengan tautan Instagram valid. `UploadedAt` terisi otomatis oleh server. |
| AC4 | Tautan kosong atau bukan tautan postingan Instagram ditolak (400) dan status konten tidak berubah. |
| AC5 | Konten `UPLOADED` tidak dapat ditandai ulang (409) dan tidak dapat dihapus (409). Konten belum upload dapat dihapus. |
| AC6 | Creator hanya bisa melihat, menandai, dan menghapus konten miliknya (konten orang lain: 404). Tanpa identitas: 401. Admin tidak bisa membuat konten: 403. |

## Plan

Keputusan desain:

- Status v1 hanya `DRAFT`, `SCHEDULED`, `UPLOADED`. Alur review (`SUBMITTED`, `APPROVED`, `REVISION`) ditunda ke versi berikutnya.
- Validasi di server (sumber kebenaran). UI hanya membantu, tidak menjadi satu-satunya penjaga aturan.
- `UploadedAt` diisi server dari jam server, bukan dari input pengguna, supaya hitungan kuota tidak bisa dimanipulasi.
- Konten orang lain dijawab 404, bukan 403, agar keberadaannya tidak bocor.

Langkah:

1. `src/content.ts`: validasi, `CreateContent`, `ListContents`, `UploadContent`, `DeleteContent`, dan daftar rute.
2. Daftarkan rute di `src/server.ts`.
3. `test/helpers.ts` dan `test/content.test.ts`: satu pengujian per acceptance criteria lewat HTTP sungguhan.
4. `public/content.js`: panel UI (form, daftar konten, tandai upload, hapus). Admin melihat daftar read-only.
5. Verifikasi: jalankan pengujian, skenario curl, dan tangkapan layar UI. Simpan di `docs/bukti/`.

## Build

Dikerjakan AI Agent (Claude): `src/content.ts`, rute di `src/server.ts`, `public/content.js`, gaya di `public/style.css`, serta
`test/helpers.ts` dan `test/content.test.ts`. Alur data:

```text
Form UI -> Api() di app.js (header X-User-Id) -> rute /api/contents -> validasi di content.ts -> tabel Content (SQLite)
                                                                   <- JSON (PascalCase) <- UI memuat ulang daftar lewat RenderAll()
```

## Verify

| Bukti | Berkas | Hasil |
|-------|--------|-------|
| Pengujian otomatis per AC (6 tes lewat HTTP sungguhan) | [fitur-1-test.txt](bukti/fitur-1-test.txt) | 6 lulus, 0 gagal |
| Uji mutasi: validasi tautan sengaja dirusak | [fitur-1-mutasi.txt](bukti/fitur-1-mutasi.txt) | AC4 gagal, sisanya lulus, lalu semua lulus setelah dipulihkan |
| Skenario API (curl) mencakup AC1 sampai AC6 | [fitur-1-api.txt](bukti/fitur-1-api.txt) | 201, 400, 400, 400, 200, 409, 409, 404, 401, 403 |
| Skenario UI di browser (Playwright) | [fitur-1-ui.txt](bukti/fitur-1-ui.txt) dan `bukti/fitur-1-*.png` | Pesan validasi tampil, status berubah Draft menjadi Sudah diupload, admin read-only |

Temuan saat verifikasi (diperbaiki AI): kotak notifikasi tidak sejajar dengan konten di bawahnya, sehingga lebar dan margin
`#notice` diubah di `style.css`, lalu bukti UI diambil ulang.

## Review

Bagian ini harus diisi mahasiswa setelah membaca kodenya. Hal yang layak ditinjau dan diputuskan:

- Pesan 409 di `UploadContent` berbunyi "Konten ini sudah ditandai sudah diupload" (kata "sudah" berulang). Ubah jika perlu.
- Apakah admin memang tidak boleh membuat konten (saat ini 403)?
- Apakah 404 untuk konten milik orang lain sudah sesuai kebutuhan, atau lebih jelas memakai 403?
- Pola tautan Instagram di `InstagramPath` (post, reel, reels, tv, stories): apakah sudah mencakup jenis tautan yang dipakai creator?
- Batas judul 120 dan caption 2200 karakter: sesuaikan dengan kebiasaan tim.

Catatan mahasiswa (isi sendiri):

| Yang saya review | Yang saya ubah | Alasan perubahan |
|------------------|----------------|------------------|
|                  |                |                  |
