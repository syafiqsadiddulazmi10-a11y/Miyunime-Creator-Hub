# Contoh Log Aman, Penyebab Galat, dan Tindakan Perbaikan

Semua kutipan di dokumen ini diambil dari output nyata server yang dijalankan dan sengaja dipicu galatnya
(`bash scripts/log-samples.sh`, hasil lengkap di [bukti/contoh-log.txt](bukti/contoh-log.txt)). Path lokal sudah disamarkan menjadi `<proyek>`.

## 1. Format log

Server menulis satu baris JSON per kejadian ke stdout (galat ke stderr). Contoh permintaan biasa:

```json
{"Time":"2026-11-04T03:31:41.610Z","Level":"info","Event":"REQUEST","RequestId":"fc87f8cf","Method":"GET","Path":"/api/dashboard/me","Status":200,"Ms":3,"UserId":2,"Ip":"127.0.0.1"}
```

| Bidang | Arti |
|--------|------|
| `Level` | `info` (normal), `warn` (perlu dipantau), `error` (butuh tindakan) |
| `Event` | Jenis kejadian (tabel bagian 3) |
| `RequestId` | Sama dengan header respons `X-Request-Id`. Satu permintaan = satu ID, termasuk baris log di dalam handler |
| `UserId` | ID pengguna yang login, `null` jika belum login |
| `Ms` | Lama pemrosesan |
| `ErrorId` | Hanya pada galat 500. Kode yang sama dilihat pengguna di layar |

### Aturan log aman

| Dicatat | Tidak pernah dicatat |
|---------|----------------------|
| Metode, path, status, durasi, ID pengguna, IP, jenis kejadian | Kata sandi (benar maupun salah) |
| Email **tersamar** pada kejadian login: `s***@miyunime.id` | Email lengkap |
| Pesan dan 4 baris pertama stack untuk galat tak terduga (hanya di log server) | Token sesi / header `Authorization` |
| Jumlah percobaan login gagal | Query string (bisa memuat kata kunci pencarian pengguna) dan isi body |

Aturan ini dijaga oleh tes otomatis SEC10: tes memasukkan sandi, token, email, dan kata pencarian yang khas, lalu memastikan tidak satu pun muncul di log.
Untuk pengguna, galat 500 hanya menampilkan `ErrorId`, tanpa nama tabel, SQL, atau path (tes SEC11).

## 2. Cara menelusuri

```bash
npm start 2>&1 | tee app.log                          # simpan log
grep '"Level":"error"' app.log                         # semua galat
grep '80d28c91' app.log                                # cari berdasarkan ErrorId dari pengguna
grep 'e8bc16e0' app.log                                # seluruh jejak satu permintaan (RequestId)
grep '"Event":"LOGIN_FAILED"' app.log | wc -l          # jumlah login gagal
# dengan jq (jika terpasang):
jq -c 'select(.Status>=400) | {Time,Event,Path,Status}' app.log
```

## 3. Katalog kejadian: arti, penyebab, tindakan

### 3.1 Galat tak terduga (500): `UNHANDLED_ERROR`

Log nyata (tabel `ContentReview` sengaja dihapus saat server berjalan):

```json
{"Time":"2026-11-04T03:32:11.530Z","Level":"error","Event":"UNHANDLED_ERROR","ErrorId":"80d28c91","RequestId":"e8bc16e0","Method":"GET","Path":"/api/contents","Error":"no such table: ContentReview","Stack":["Error: no such table: ContentReview","at Object.ListContents [as Handler] (<proyek>/src/content.ts:112:6)","at Server.<anonymous> (<proyek>/src/server.ts:173:24)", "..."]}
```

Yang diterima pengguna (tanpa detail teknis):

```text
HTTP/1.1 500 Internal Server Error
X-Request-Id: e8bc16e0
{"Message":"Terjadi kesalahan pada server. Sebutkan kode 80d28c91 saat melapor.","ErrorId":"80d28c91"}
```

| Penyebab umum | Tindakan perbaikan |
|---------------|--------------------|
| `no such table` / `no such column`: database lama atau rusak, skema belum termigrasi | Hentikan server, cadangkan `data/miyunime.db`, jalankan ulang `npm start` (migrasi otomatis saat dibuka). Untuk demo: `npm run seed` |
| `database is locked`: dua proses memakai file database yang sama | Pastikan hanya satu instance per file `DATABASE_FILE` |
| `attempt to write a readonly database` / `unable to open database file`: izin folder `data/` salah | Beri izin tulis ke user yang menjalankan server (di Docker: volume harus dimiliki user `node`) |
| Bug kode | Cari `ErrorId` di log, buka berkas dan baris pada `Stack`, buat tes yang mereproduksi, perbaiki, `npm test` |

### 3.2 Login gagal dan diblokir: `LOGIN_FAILED`, `LOGIN_BLOCKED` (level `warn`)

```json
{"Time":"2026-11-04T03:31:41.994Z","Level":"warn","Event":"LOGIN_FAILED","Email":"s***@miyunime.id","Ip":"127.0.0.1","Attempt":1}
{"Time":"2026-11-04T03:31:42.209Z","Level":"warn","Event":"LOGIN_BLOCKED","Email":"s***@miyunime.id","Ip":"127.0.0.1"}
{"Time":"2026-11-04T03:31:42.209Z","Level":"info","Event":"REQUEST","RequestId":"b151beaa","Method":"POST","Path":"/api/login","Status":429,"Ms":0,"UserId":null,"Ip":"127.0.0.1"}
```

| Penyebab | Tindakan |
|----------|----------|
| Pengguna salah mengetik sandi (satu atau dua kali) | Tidak perlu tindakan |
| `Attempt` naik cepat ke 5 lalu `LOGIN_BLOCKED` dari IP yang sama: kemungkinan tebak sandi (brute force) | Periksa IP, blokir di firewall/proxy bila berulang. Blokir otomatis berakhir 15 menit setelah percobaan gagal pertama. Pengguna sah diminta menunggu (header `Retry-After` memberi detik tersisa) |
| Banyak pengguna sah terblokir bersamaan dengan IP yang sama (`Ip` selalu IP proxy) | Aplikasi berada di belakang proxy; lihat risiko R3 di [SECURITY.md](SECURITY.md) |
| Admin lupa sandi | Belum ada fitur reset di MVP. Jalankan ulang seed (data demo) atau perbarui `PasswordHash` lewat skrip admin |

### 3.3 Permintaan ditolak karena sesi: `AUTH_REJECTED` (HTTP 401)

```json
{"Time":"2026-11-04T03:31:41.629Z","Level":"info","Event":"AUTH_REJECTED","RequestId":"ef8cab2f","Method":"GET","Path":"/api/contents","Status":401,"Ms":0,"UserId":null,"Ip":"127.0.0.1"}
```

| Penyebab | Tindakan |
|----------|----------|
| Token kedaluwarsa (12 jam), pengguna sudah logout, atau server di-seed ulang (sesi terhapus) | Normal. UI otomatis kembali ke layar login dengan pesan "Sesi berakhir" |
| Banyak `AUTH_REJECTED` dari satu IP ke banyak path | Pemindaian atau percobaan token palsu. Periksa IP |
| Klien lama masih memakai header `X-User-Id` | Header itu tidak lagi dikenali (celah F1). Perbarui klien agar memakai `Authorization: Bearer <token>` |

### 3.4 Isi permintaan bermasalah: `BODY_TOO_LARGE` (413) dan `BAD_REQUEST` (400)

```json
{"Time":"2026-11-04T03:32:09.600Z","Level":"info","Event":"BODY_TOO_LARGE","RequestId":"70227ff5","Method":"POST","Path":"/api/contents","Status":413,"Ms":2,"UserId":2,"Ip":"127.0.0.1"}
{"Time":"2026-11-04T03:32:09.608Z","Level":"info","Event":"BAD_REQUEST","RequestId":"cbbd8af6","Method":"POST","Path":"/api/contents","Status":400,"Ms":2,"UserId":2,"Ip":"127.0.0.1"}
```

| Penyebab | Tindakan |
|----------|----------|
| 413: isi lebih dari 100 KB (salah klien, atau upaya membebani server) | Batas ini sengaja (judul maks 120 dan caption maks 2200 karakter). Bila sah, periksa klien yang mengirim data berlebih |
| 400 `BAD_REQUEST`: JSON rusak (kurung tidak lengkap, bukan JSON) | Perbaiki klien. Server menjawab `Isi permintaan bukan JSON yang valid` |
| 400 biasa (`Event: REQUEST`, `Status: 400`): validasi input gagal (judul kosong, tautan bukan Instagram, dsb.) | Normal, pesan Indonesia dikembalikan ke pengguna |

### 3.5 Gagal start: `SERVER_START_FAILED`, `NO_USERS`, dan PORT tidak valid

```json
{"Time":"2026-11-04T03:31:45.546Z","Level":"error","Event":"SERVER_START_FAILED","Code":"EADDRINUSE","Message":"Port 3204 sudah dipakai. Jalankan dengan PORT=<port lain>."}
```
```text
PORT tidak valid: "abc". Gunakan angka 1 sampai 65535.
```
```json
{"Time":"2026-11-04T03:31:38.000Z","Level":"warn","Event":"NO_USERS","Message":"Database belum berisi akun. Jalankan \"npm run seed\" terlebih dahulu."}
```

| Gejala | Penyebab | Tindakan |
|--------|----------|----------|
| `EADDRINUSE` (exit code 1) | Port dipakai program lain atau instance lama belum berhenti | `PORT=3001 npm start`, atau hentikan proses yang memakai port itu |
| `PORT tidak valid` (exit code 1) | Variabel `PORT` bukan angka 1 sampai 65535 | Perbaiki nilai `PORT` |
| `NO_USERS` (server tetap jalan) | Database baru/kosong, tidak ada akun untuk login | `npm run seed` untuk demo, lalu mulai ulang |
| `EACCES` pada port di bawah 1024 | Butuh hak istimewa | Pakai port tinggi (3000) dan arahkan lewat proxy |

### 3.6 Galat saat pengembangan (dialami langsung saat membangun proyek ini)

| Pesan | Penyebab | Perbaikan |
|-------|----------|-----------|
| `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not supported in strip-only mode` | Node menjalankan TypeScript dengan cara membuang tipe saja. Sintaks yang butuh transformasi (parameter property `constructor(public x)`, `enum`, `namespace`) tidak didukung | Tulis field dan assignment biasa. Semua tes gagal sekaligus (8 berkas gagal dimuat) menandakan galat di modul yang dipakai bersama |
| Suite tes menggantung dan tidak selesai | Server tes tidak ditutup saat tes gagal; koneksi keep-alive menahan proses | `Stop()` di `test/helpers.ts` kini memanggil `closeAllConnections()` |
| Tes timing/lockout gagal padahal kode benar | Data tes tidak sesuai (contoh: kuota masa depan ikut terhitung) atau pembulatan hari | Periksa data fixture dahulu sebelum mengubah kode |
| `Unknown file extension ".ts"` atau `Cannot find module 'node:sqlite'` | Node lebih lama dari 22.18 | Perbarui Node (`node -v`). `npm run build` memberi pesan versi yang jelas. Pesan persis ini berasal dari dokumentasi Node, tidak direproduksi di sini |

## 4. Kapan harus eskalasi

| Kondisi di log | Prioritas |
|----------------|-----------|
| Beberapa `UNHANDLED_ERROR` berbeda dalam satu menit | Tinggi: cek database dan disk |
| `/healthz` mengembalikan 503 (`database tidak tersedia`) | Tinggi: restart layanan, periksa berkas database |
| `LOGIN_BLOCKED` berulang dari banyak IP berbeda | Sedang: aktifkan pembatas di proxy |
| `AUTH_REJECTED` lonjakan dari satu IP | Sedang: blokir IP |
| `LOGIN_FAILED` sesekali | Rendah: normal |
