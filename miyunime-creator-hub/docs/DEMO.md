# Demo singkat (sekitar 5 menit)

## Persiapan

```bash
npm run seed && npm start      # buka http://localhost:3000
```

## Alur demo

1. **Admin** (dropdown kanan atas): dashboard menampilkan Sari terlambat, Aiko dalam progres, Dewi belum punya kuota, Raka terpenuhi.
2. **Aiko** (creator): kuota terisi 3 dari 4. Coba simpan dengan judul kosong dan lihat pesan validasi dari server.
3. Buat konten baru, lalu coba tandai upload dengan tautan salah (`https://example.com`) dan lihat penolakannya.
4. Tandai "Rekap episode minggu ini" dengan `https://www.instagram.com/p/DemoAiko4/`. Meter menjadi 4 dari 4 dan status Terpenuhi.
5. Kembali sebagai **Admin**: Aiko sudah terpenuhi dan ringkasan berubah.
6. Terminal: `npm test` (13 lulus). Rusak satu baris di `src/quota.ts` (misalnya `>=` menjadi `>`), jalankan lagi, tes AC2 gagal. Pulihkan dengan `git checkout src/quota.ts`.
7. `git log --oneline` menunjukkan tiga commit: scaffold, fitur 1, fitur 2.

## Kerangka penjelasan (lengkapi dengan kata-kata sendiri)

| Pertanyaan | Jawaban berdasarkan repo ini |
|------------|------------------------------|
| Apa yang dikerjakan AI Agent? | Scaffold, kode server dan UI, pengujian, bukti verifikasi, dan dokumen brief dan plan. Lihat bagian Build di tiap dokumen fitur. |
| Apa yang direview dan diubah mahasiswa? | Isi tabel catatan di bagian Review pada `docs/FITUR-1-INPUT-KONTEN.md` dan `docs/FITUR-2-DASHBOARD-KUOTA.md`. |
| Bagaimana diverifikasi? | Pengujian HTTP per acceptance criteria, uji mutasi, skenario curl, dan skenario UI di browser. Semua bukti ada di `docs/bukti/`. |
| Mengapa perubahan itu diperlukan? | Setiap aturan punya alasan: `UploadedAt` dari server agar kuota tidak bisa dimanipulasi, hanya konten bertautan yang dihitung agar kuota bermakna, status dihitung saat dibaca agar tidak basi. |
