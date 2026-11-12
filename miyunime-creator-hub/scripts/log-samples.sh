#!/usr/bin/env bash
# Memicu tiap jenis galat pada server sungguhan dan menyimpan log aslinya ke docs/bukti/contoh-log.txt.
# Jalankan dari folder miyunime-creator-hub/:  bash scripts/log-samples.sh
set -u
OUT=docs/bukti/contoh-log.txt
TMP=$(mktemp -d)
export DATABASE_FILE="$TMP/contoh.db"
: > "$OUT"
section() { printf '\n=== %s ===\n' "$1" >> "$OUT"; }
cleanup() { [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT
req() { curl -s -m 5 -o /dev/null -w '%{http_code}' "$@"; }

section "1. Start tanpa akun (database kosong): peringatan NO_USERS"
PORT=3201 node src/server-main.ts >> "$OUT" 2>&1 & PID=$!; sleep 1.5; kill $PID; wait $PID 2>/dev/null; PID=

section "2. Seed lalu start normal, permintaan sah, login benar dan salah, token palsu"
npm run seed --silent >/dev/null 2>&1
PORT=3202 node src/server-main.ts >> "$OUT" 2>&1 & PID=$!; sleep 1.5
B=http://127.0.0.1:3202
J='Content-Type: application/json'
req $B/healthz >/dev/null
TOKEN=$(curl -s -X POST $B/api/login -H "$J" -d '{"Email":"aiko@miyunime.id","Password":"miyunime123"}' | sed 's/.*"Token":"\([0-9a-f]*\)".*/\1/')
req $B/api/dashboard/me -H "Authorization: Bearer $TOKEN" >/dev/null
req -X POST $B/api/contents -H "Authorization: Bearer $TOKEN" -H "$J" -d '{"Title":"","Format":"FEED"}' >/dev/null
req "$B/api/contents?Q=kata-pencarian-pribadi" -H "Authorization: Bearer $TOKEN" >/dev/null
req $B/api/contents -H "Authorization: Bearer token-palsu" >/dev/null
req $B/api/reports/quota.csv -H "Authorization: Bearer $TOKEN" >/dev/null
sleep 0.3

section "3. Brute force login: 5 gagal lalu diblokir (429)"
for i in 1 2 3 4 5 6; do req -X POST $B/api/login -H "$J" -d '{"Email":"sari@miyunime.id","Password":"tebakan'$i'"}' >/dev/null; done
sleep 0.3

section "4. Isi permintaan terlalu besar (413) dan JSON rusak (400)"
head -c 200000 /dev/zero | tr '\0' 'x' > "$TMP/big.txt"
printf "Status respons untuk isi 200 KB: " >> "$OUT"; req -X POST $B/api/contents -H "Authorization: Bearer $TOKEN" -H "$J" --data-binary @"$TMP/big.txt" >> "$OUT"; printf "\n" >> "$OUT"
req -X POST $B/api/contents -H "Authorization: Bearer $TOKEN" -H "$J" -d '{rusak' >/dev/null
sleep 0.3
kill $PID; wait $PID 2>/dev/null; PID=

section "5. Galat tak terduga (500): tabel ContentReview dihapus dari database saat server berjalan"
PORT=3203 node src/server-main.ts >> "$OUT" 2>&1 & PID=$!; sleep 1.5
B=http://127.0.0.1:3203
TOKEN=$(curl -s -X POST $B/api/login -H "$J" -d '{"Email":"aiko@miyunime.id","Password":"miyunime123"}' | sed 's/.*"Token":"\([0-9a-f]*\)".*/\1/')
node -e "
import('node:sqlite').then(({DatabaseSync})=>{const d=new DatabaseSync(process.env.DATABASE_FILE);d.exec('DROP TABLE ContentReview');d.close();});" 2>/dev/null
RESP=$(curl -s -D - $B/api/contents -H "Authorization: Bearer $TOKEN" | grep -iE '^HTTP|^x-request-id|^\{')
sleep 0.3
printf 'Respons yang diterima pengguna:\n%s\n' "$RESP" >> "$OUT"
kill $PID; wait $PID 2>/dev/null; PID=

section "6. Port sudah dipakai (EADDRINUSE)"
node -e "require('node:http').createServer().listen(3204,()=>setTimeout(()=>process.exit(),4000))" & BLOCKER=$!; sleep 0.5
PORT=3204 node src/server-main.ts >> "$OUT" 2>&1; echo "exit code: $?" >> "$OUT"; kill $BLOCKER 2>/dev/null

section "7. PORT tidak valid"
PORT=abc node src/server-main.ts >> "$OUT" 2>&1; echo "exit code: $?" >> "$OUT"

sed -i 's/\r$//; s/\r//g' "$OUT"
sed -i '/ExperimentalWarning\|trace-warnings/d' "$OUT"
# Samarkan path lokal agar contoh log aman dibagikan.
sed -i "s#file://$(pwd)#<proyek>#g; s#$(pwd)#<proyek>#g; s#$TMP#<tmp>#g" "$OUT"
echo "Contoh log disimpan di $OUT"
