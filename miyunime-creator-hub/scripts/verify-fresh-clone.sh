#!/usr/bin/env bash
# Membuktikan repo bisa dipakai dari nol: clone -> install -> build -> test -> run (sumber dan hasil build) -> (opsional) Docker.
# Pemakaian:  bash scripts/verify-fresh-clone.sh <url-atau-path-repo> [branch]
# Contoh:     bash scripts/verify-fresh-clone.sh https://github.com/<user>/Miyunime-Creator-Hub.git main
set -u
REPO="${1:?Pemakaian: verify-fresh-clone.sh <url-atau-path-repo> [branch]}"
BRANCH="${2:-main}"
WORK="$(mktemp -d)"
PIDS=()
RESULTS=()
FAILED=0
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; rm -rf "$WORK"; }
trap cleanup EXIT

step() { printf '\n\033[1m>> %s\033[0m\n' "$1"; }
ok()   { RESULTS+=("PASS  $1"); printf 'PASS  %s\n' "$1"; }
bad()  { RESULTS+=("FAIL  $1"); printf 'FAIL  %s\n' "$1"; FAILED=1; }
skip() { RESULTS+=("SKIP  $1"); printf 'SKIP  %s\n' "$1"; }
finish() {
  printf '\n================ RINGKASAN ================\n'
  printf '%s\n' "${RESULTS[@]}"
  printf 'Repo: %s (branch %s)\n' "$REPO" "$BRANCH"
  [ $FAILED -eq 0 ] && echo 'HASIL: SEMUA LANGKAH LULUS' || echo 'HASIL: ADA LANGKAH GAGAL'
  exit $FAILED
}

step "1. Clone bersih ($BRANCH)"
if git clone --quiet --branch "$BRANCH" "$REPO" "$WORK/repo"; then
  ok "git clone ($(git -C "$WORK/repo" rev-parse --short HEAD) - $(git -C "$WORK/repo" log -1 --format=%s))"
else bad "git clone"; finish; fi
APP="$WORK/repo/miyunime-creator-hub"
[ -d "$APP" ] || { bad "folder miyunime-creator-hub tidak ada di repo"; finish; }
cd "$APP" || finish
[ -d data ] && bad "folder data/ ikut ter-commit (data lokal tidak boleh masuk repo)" || ok "tidak ada data lokal/rahasia yang ikut ter-commit"
git -C "$WORK/repo" ls-files | grep -E '(^|/)(\.env|node_modules/|data/)' >/dev/null && bad "berkas .env/node_modules/data ter-commit" || ok "tidak ada .env, node_modules, atau data di git"

step "2. Versi Node"
node -v
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)" && ok "Node $(node -v) memenuhi syarat >= 22.18" || { bad "Node terlalu lama (butuh >= 22.18)"; finish; }

step "3. Install (npm ci)"
if npm ci --no-audit --no-fund 2>&1 | tail -3; [ "${PIPESTATUS[0]}" -eq 0 ]; then ok "npm ci"; else bad "npm ci"; fi
if npm audit --omit=dev 2>&1 | grep -qiE 'found 0 vulnerabilities'; then ok "npm audit: 0 kerentanan (trivial: proyek tanpa dependensi)"; else skip "npm audit (tidak tersedia)"; fi

step "4. Build"
if npm run build 2>&1 | grep -v -i 'experimentalwarning\|trace-warnings'; [ "${PIPESTATUS[0]}" -eq 0 ] && [ -f dist/src/server-main.ts ] && [ -f dist/public/index.html ]; then ok "npm run build (dist/ terbentuk)"; else bad "npm run build"; fi

step "5. Unit test"
LOG="$WORK/test.log"
npm test > "$LOG" 2>&1
PASS=$(grep -E '^# pass ' "$LOG" | awk '{print $3}'); FAIL=$(grep -E '^# fail ' "$LOG" | awk '{print $3}'); TOTAL=$(grep -E '^# tests ' "$LOG" | awk '{print $3}')
printf 'tests=%s pass=%s fail=%s\n' "$TOTAL" "$PASS" "$FAIL"
if [ "${FAIL:-1}" = "0" ] && [ "${PASS:-0}" = "${TOTAL:-x}" ] && [ "${TOTAL:-0}" -gt 0 ]; then ok "npm test: $PASS/$TOTAL lulus, 0 gagal"; else bad "npm test"; grep -E '^\s*not ok' "$LOG" | head; fi

smoke() { # $1=label $2=folder $3=port
  local label="$1" dir="$2" port="$3" base="http://127.0.0.1:$3"
  if curl -s -m 1 "$base/healthz" >/dev/null 2>&1; then bad "$label: port $port sudah dipakai proses lain, hentikan dahulu agar hasil tidak tertukar"; return; fi
  ( cd "$dir" && DATABASE_FILE="$WORK/$label.db" npm run seed --silent >/dev/null 2>&1 ) || { bad "$label: seed"; return; }
  # exec: PID yang disimpan adalah proses node itu sendiri, bukan subshell, sehingga bisa dimatikan dengan benar saat selesai.
  ( cd "$dir" && PORT="$port" DATABASE_FILE="$WORK/$label.db" exec node src/server-main.ts > "$WORK/$label.log" 2>&1 ) & PIDS+=($!)
  for _ in $(seq 1 30); do curl -sf "$base/healthz" >/dev/null 2>&1 && break; sleep 0.3; done
  curl -sf "$base/healthz" | grep -q '"ok"' && ok "$label: /healthz sehat" || { bad "$label: server tidak sehat"; cat "$WORK/$label.log"; return; }
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$base/")" = 200 ] && ok "$label: halaman utama 200" || bad "$label: halaman utama"
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$base/api/contents")" = 401 ] && ok "$label: API tanpa login 401" || bad "$label: API tanpa login"
  local token; token=$(curl -s -X POST "$base/api/login" -H 'Content-Type: application/json' -d '{"Email":"admin@miyunime.id","Password":"miyunime123"}' | sed -n 's/.*"Token":"\([0-9a-f]*\)".*/\1/p')
  [ -n "$token" ] && ok "$label: login admin berhasil" || { bad "$label: login admin"; return; }
  curl -s "$base/api/dashboard/admin" -H "Authorization: Bearer $token" | grep -q '"TotalCreators":4' && ok "$label: dashboard admin memuat 4 creator" || bad "$label: dashboard admin"
  curl -sI "$base/" | grep -qi '^content-security-policy:' && ok "$label: header CSP aktif" || bad "$label: header CSP"
}

step "6. Jalankan dari sumber (npm start)"
smoke source "$APP" 3401
step "7. Jalankan dari hasil build (deploy dist/)"
smoke dist "$APP/dist" 3402

step "8. Uji UI end-to-end (opsional: E2E=1)"
if [ "${E2E:-0}" = 1 ] && python3 -c 'import playwright' 2>/dev/null; then
  if curl -s -m 1 http://127.0.0.1:3403/healthz >/dev/null 2>&1; then bad "e2e: port 3403 sudah dipakai proses lain"; finish; fi
  ( cd "$APP" && DATABASE_FILE="$WORK/e2e.db" npm run seed --silent >/dev/null 2>&1 )
  ( cd "$APP" && DATABASE_FILE="$WORK/e2e.db" PORT=3403 exec node src/server-main.ts >/dev/null 2>&1 ) & PIDS+=($!)
  sleep 2
  E2E_OUT=$( cd "$APP" && BASE_URL=http://127.0.0.1:3403 python3 test-e2e/e2e.py 2>&1 ); E2E_CODE=$?
  printf '%s\n' "$E2E_OUT" | tail -3
  # Status keluar skrip e2e yang dipakai (bukan status perintah tail), dan harus ada baris ringkasan "N/N lulus".
  if [ $E2E_CODE -eq 0 ] && printf '%s' "$E2E_OUT" | grep -qE '^([0-9]+)/\1 lulus'; then ok "e2e Playwright ($(printf '%s' "$E2E_OUT" | grep -E '/.* lulus' | tail -1))"; else bad "e2e Playwright"; fi
else skip "e2e Playwright (set E2E=1 dan pasang playwright untuk menjalankan)"; fi

step "9. Docker build (opsional)"
if command -v docker >/dev/null 2>&1; then
  docker build -q -t miyunime-creator-hub:verify "$APP" >/dev/null 2>&1 && ok "docker build" || bad "docker build"
else skip "docker build (docker tidak terpasang di mesin ini)"; fi

finish
