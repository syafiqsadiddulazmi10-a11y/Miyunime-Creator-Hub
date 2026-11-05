# Hasil Uji Keamanan dan Catatan Perubahan

Versi: 1.0.0 (MVP). Pengujian dilakukan pada kode di repo ini, dengan Node 22 dan Chromium headless.

## 1. Ruang lingkup dan metode

| Metode | Cakupan | Bukti |
|--------|---------|-------|
| Tes keamanan otomatis (15 tes, `test/security.test.ts`, kode SEC1 sampai SEC15) | Header, path traversal, SQL injection, IDOR, eskalasi peran, mass assignment, XSS, brute force, batas ukuran, kebocoran di log dan galat, health check, enumerasi akun | `npm test`: 77 dari 77 lulus ([bukti/mvp-test.txt](bukti/mvp-test.txt)) |
| Uji browser sungguhan (Playwright) | Payload XSS tersimpan tidak dijalankan, skrip inline diblokir CSP, UI tetap berfungsi di bawah CSP | `test-e2e/e2e.py`: 32 dari 32 lulus |
| Tinjauan kode manual | Seluruh `src/` dan `public/`: query SQL, penanganan `innerHTML`, otorisasi tiap rute | Tabel temuan di bawah |
| Log nyata dari server yang diserang | Brute force, token palsu, body besar, galat 500, gagal start | [bukti/contoh-log.txt](bukti/contoh-log.txt) |

**Tidak dilakukan (agar tidak ada kesan lebih dari yang sebenarnya):**

- Pemindai pihak ketiga (OWASP ZAP, Burp) dan penetration test independen.
- Uji beban atau DoS terdistribusi. Hanya ada batas ukuran isi permintaan dan pembatas login.
- Pengecekan konfigurasi TLS/HTTPS. Aplikasi sendiri tidak melayani HTTPS (lihat risiko sisa R1).
- Audit rantai pasok: `npm audit` melaporkan 0 kerentanan, tetapi hasil ini trivial karena proyek tidak memiliki dependensi npm (`dependencies` kosong), jadi tidak ada paket yang bisa diperiksa. Yang relevan justru versi Node.js itu sendiri: gunakan rilis patch Node 22 terbaru.
- Image Docker: `Dockerfile` ditulis tetapi **belum dibangun** di mesin pengujian karena Docker tidak tersedia.

## 2. Temuan dan perbaikan

Tingkat keparahan: Kritis, Tinggi, Sedang, Rendah. Semua temuan di tabel ini sudah diperbaiki dan punya tes yang akan gagal jika perbaikannya dibuang.

| ID | Temuan | Tingkat | Perbaikan | Tes |
|----|--------|---------|-----------|-----|
| F1 | Identitas berasal dari header `X-User-Id` yang bisa diisi siapa saja (siapa pun bisa menjadi Admin) | Kritis | Login email dan kata sandi (hash scrypt bergaram), token sesi acak 192 bit berlaku 12 jam, logout mencabut token. Header lama tidak lagi dikenali | `auth.test.ts` AC3, AC4 |
| F2 | Tidak ada batas percobaan login (brute force bebas) | Tinggi | 5 gagal per 15 menit untuk tiap pasangan IP dan email, lalu HTTP 429 dengan `Retry-After`. Login berhasil mereset hitungan | SEC8 |
| F3 | `GET /api/users` bisa dibuka tanpa login (daftar nama, peran, username Instagram) | Sedang | Wajib login dan hanya admin | `auth.test.ts` AC3, SEC5 |
| F4 | Server mendengarkan di semua antarmuka jaringan secara bawaan | Sedang | Bawaan `127.0.0.1`. Untuk server/Docker atur `HOST=0.0.0.0` dengan sadar | Tinjauan kode, log SERVER_STARTED |
| F5 | Tanpa header keamanan, dan `index.html` memuat skrip inline sehingga CSP ketat mustahil | Sedang | CSP (`script-src 'self'`, tanpa `unsafe-inline`), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cache-Control: no-store` untuk API, HSTS bila di balik proxy HTTPS. Skrip inline dipindah ke `public/start.js` | SEC1, SEC2, e2e (CSP) |
| F6 | Galat internal dikembalikan ke pengguna sebagai HTTP 400 dengan pesan mentah (bisa membocorkan nama tabel/SQL) dan menyamarkan bug | Sedang | Galat tak terduga menjadi HTTP 500 dengan pesan umum dan `ErrorId`. Detail hanya di log server | SEC11 |
| F7 | Email tidak dikenal dijawab lebih cepat daripada email dikenal (enumerasi akun lewat waktu respons) | Rendah | Verifikasi hash tiruan untuk email tak dikenal; pesan galat identik | SEC13 (heuristik kasar), `auth.test.ts` AC2 |
| F8 | Isi permintaan besar membuat koneksi diputus tanpa jawaban dan tanpa catatan log (ditemukan dari contoh log nyata, bukan dari tes) | Rendah | HTTP 413 dikirim lalu koneksi ditutup; tercatat sebagai `BODY_TOO_LARGE` | SEC9, log bagian 4 |
| F9 | Sesi kedaluwarsa menumpuk di database | Rendah | Dibersihkan setiap login berhasil | SEC15 |
| F10 | Bug pada perbaikan saya sendiri: nama kejadian log `AUTH_REJECTED` tertimpa menjadi `REQUEST` (ditemukan oleh SEC10) | Rendah | Diperbaiki di `server.ts` | SEC10 |

### Yang diuji dan hasilnya baik sejak awal

| Serangan | Hasil | Mengapa aman | Tes |
|----------|-------|--------------|-----|
| SQL injection (`' OR 1=1 --`, `'); DROP TABLE`) di login, filter, pencarian, parameter path | Gagal | Semua query memakai parameter terikat (`?`); karakter `%` dan `_` pada pencarian di-escape | SEC4 |
| Path traversal (`/../src/db.ts`, `%2e%2e`, `%2f`, `/.env`, `/.git/config`, `/data/miyunime.db`, `%00`) | Ditolak (404/400) | Hanya nama berkas `[\w.-]+` tanpa titik di awal yang dilayani, dan hanya dari `public/` | SEC3 |
| IDOR: creator membuka, mengubah, atau menghapus konten creator lain | 404 | Setiap query memfilter `UserId` pemilik; 404 (bukan 403) agar keberadaan data tidak bocor | SEC5 |
| Eskalasi peran: creator memanggil rute admin (kuota, review, laporan, dashboard, daftar pengguna) | 403 | Pemeriksaan peran di setiap handler | SEC5 |
| Mass assignment: mengirim `UserId`, `Status: UPLOADED`, `UploadedAt` saat membuat konten | Diabaikan | Handler hanya membaca bidang yang diizinkan; `UploadedAt` selalu dari jam server | SEC6 |
| XSS tersimpan (`<img onerror>`, `<script>`) di judul dan caption | Tidak berjalan di browser | Semua data dilewatkan `Esc()` sebelum `innerHTML`, plus CSP sebagai lapis kedua (dibuktikan: skrip inline yang disuntik lewat konsol ditolak browser) | SEC7, e2e |
| Tautan berbahaya (`javascript:`, `data:`, `instagram.com.evil.com`, `http://`) pada tautan upload dan draft | 400 | Validasi skema dan host persis | SEC7, `history.test.ts` AC6 |
| CSV injection (`=cmd`, `+`, `-`, `@`) pada laporan | Dinetralkan | Awalan apostrof | `report.test.ts` AC4 |
| CSRF | Tidak berlaku | Token dikirim lewat header `Authorization`, bukan cookie, sehingga tidak ada kredensial yang ikut otomatis dari situs lain. Tidak ada header CORS | SEC1 |
| Kebocoran rahasia di log | Tidak ada | Log tidak memuat kata sandi, token, query string, maupun email lengkap (`a***@miyunime.id`) | SEC10 |

## 3. Risiko sisa (diketahui, belum ditutup)

| ID | Risiko | Dampak | Saran |
|----|--------|--------|-------|
| R1 | Aplikasi tidak melayani HTTPS. Tanpa TLS, token dan sandi terbaca di jaringan | Tinggi bila dipakai di internet | Wajib di balik reverse proxy HTTPS (contoh Nginx di README). HSTS otomatis aktif bila proxy mengirim `X-Forwarded-Proto: https` |
| R2 | Token sesi disimpan di `localStorage`; XSS yang lolos CSP dapat mencurinya | Sedang | CSP ketat, `Esc()` dan validasi tautan sudah mengurangi risiko. Pasca-MVP: pindah ke cookie `HttpOnly; Secure; SameSite=Strict` |
| R3 | Pembatas login berada di memori satu proses: hilang saat restart dan tidak dibagi antar instance. Di belakang proxy, IP klien terbaca sebagai IP proxy | Sedang | Untuk produksi, teruskan IP asli (`X-Forwarded-For`) dan pakai pembatas di proxy (misalnya `limit_req` Nginx) |
| R4 | Kata sandi demo bawaan `miyunime123` | Tinggi bila dibawa ke produksi | Jangan jalankan seed di produksi, atau set `DEMO_PASSWORD` yang kuat. Belum ada layar ganti sandi atau kebijakan sandi |
| R5 | Tidak ada pembatas laju untuk rute selain login | Rendah sampai sedang | Pembatas di proxy |
| R6 | `node:sqlite` masih berstatus experimental di Node 22 | Rendah (stabilitas, bukan keamanan) | Pantau rilis Node; pin versi Node di deploy |
| R7 | File database `data/miyunime.db` tidak dienkripsi dan izin berkas bergantung OS | Sedang | Batasi izin folder `data/` dan cadangkan secara berkala |
| R8 | Peran Super Admin belum ada; semua admin setara | Rendah | Pasca-MVP |

## 4. Catatan perubahan yang relevan dengan keamanan

| Berkas | Perubahan |
|--------|-----------|
| `src/auth.ts` (baru) | Login, logout, sesi, hash scrypt, pembatas brute force, hash tiruan anti-timing |
| `src/server.ts` | Header keamanan, `X-Request-Id`, log per permintaan, batas 100 KB dengan jawaban 413, `/healthz`, 405 untuk metode tak sah pada berkas statis, galat 500 aman dengan `ErrorId` |
| `src/logger.ts` (baru) | Log JSON satu baris, penyamaran email |
| `src/server-main.ts` | Konfigurasi via env (`PORT`, `HOST`, `DATABASE_FILE`), validasi `PORT`, bawaan `127.0.0.1`, penutupan rapi saat SIGINT/SIGTERM, pesan jelas saat port terpakai |
| `src/db.ts` | Tabel `Session`, `ActivityLog`, kolom `Email` dan `PasswordHash` (unik tanpa peduli huruf besar), migrasi otomatis |
| `src/activity.ts` (baru) | Log aktivitas pengguna (audit trail) |
| `public/index.html`, `public/start.js` | Skrip inline dihapus agar CSP ketat bisa dipakai |
| `public/app.js` | Token Bearer, penanganan sesi habis, tombol dikunci selama permintaan |
| `Dockerfile` | Berjalan sebagai user `node` (bukan root), data di volume |
| `.gitignore`, `.dockerignore` | `data/`, `.env`, `node_modules/` tidak ikut ke repo atau image |

## 5. Cara mengulang pengujian

```bash
npm test                                              # termasuk 15 tes keamanan
node --test test/security.test.ts                     # hanya keamanan
python3 test-e2e/e2e.py                               # XSS dan CSP di browser (butuh server + Playwright, lihat HowToRun.md)
bash scripts/log-samples.sh                           # membangkitkan ulang contoh log nyata
```

Melaporkan kerentanan: jangan buka issue publik. Hubungi pemilik repo secara langsung dengan langkah reproduksi.
