import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MaskEmail } from '../src/logger.ts';
import { MaxLoginFailures } from '../src/auth.ts';
import { Ids, StartTestApp, TestPassword } from './helpers.ts';

const Link = 'https://www.instagram.com/p/Cabc123/';
const Raw = (base: string, path: string, init: RequestInit = {}) => fetch(base + path, init);

describe('Fitur 9: keamanan aplikasi', () => {
  test('SEC1: semua respons membawa header keamanan, API tidak boleh di-cache, dan tidak ada header CORS', async () => {
    const app = await StartTestApp();
    for (const path of ['/', '/api/me', '/style.css', '/tidak-ada.js']) {
      const res = await Raw(app.Base, path, { headers: { Authorization: `Bearer ${app.Tokens.get(Ids.Aiko)}` } });
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
      assert.equal(res.headers.get('x-frame-options'), 'DENY', path);
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer', path);
      assert.match(res.headers.get('content-security-policy') ?? '', /script-src 'self'/, path);
      assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/, path);
      assert.equal(res.headers.get('access-control-allow-origin'), null, path);
      assert.ok(res.headers.get('x-request-id'), path);
    }
    assert.equal((await Raw(app.Base, '/api/me', { headers: { Authorization: `Bearer ${app.Tokens.get(Ids.Aiko)}` } })).headers.get('cache-control'), 'no-store');
    const https = await Raw(app.Base, '/', { headers: { 'X-Forwarded-Proto': 'https' } });
    assert.match(https.headers.get('strict-transport-security') ?? '', /max-age=/);
    assert.equal((await Raw(app.Base, '/')).headers.get('strict-transport-security'), null);
    app.Stop();
  });

  test('SEC2: CSP tidak mengizinkan skrip inline, dan halaman tidak memuat skrip/gaya inline', async () => {
    const app = await StartTestApp();
    const html = await (await Raw(app.Base, '/')).text();
    assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(html), 'tidak boleh ada <script> inline');
    assert.ok(!/\son\w+\s*=/i.test(html) && !/\sstyle\s*=/i.test(html), 'tidak boleh ada event handler atau style inline');
    const csp = (await Raw(app.Base, '/')).headers.get('content-security-policy') ?? '';
    assert.ok(!csp.includes('unsafe-inline') && !csp.includes('unsafe-eval'));
    app.Stop();
  });

  test('SEC3: path traversal dan akses ke berkas di luar public/ ditolak', async () => {
    const app = await StartTestApp();
    for (const path of ['/../src/db.ts', '/%2e%2e/src/db.ts', '/..%2fsrc%2fdb.ts', '/src/db.ts', '/.env', '/.git/config', '/package.json', '/data/miyunime.db', '/%00.html']) {
      const res = await Raw(app.Base, path);
      assert.ok([400, 404].includes(res.status), `${path} -> ${res.status}`);
      const body = await res.text();
      assert.ok(!body.includes('OpenDatabase') && !body.includes('SQLite format'), path);
    }
    assert.equal((await Raw(app.Base, '/', { method: 'POST' })).status, 405);
    assert.equal((await Raw(app.Base, '/index.html', { method: 'DELETE' })).status, 405);
    app.Stop();
  });

  test('SEC4: SQL injection lewat login, filter, pencarian, dan parameter path tidak berhasil', async () => {
    const app = await StartTestApp();
    const login = await app.Call(null, 'POST', '/api/login', { Email: "' OR 1=1 --", Password: "' OR '1'='1" });
    assert.equal(login.Status, 401);
    const login2 = await app.Call(null, 'POST', '/api/login', { Email: "admin@test.id' --", Password: 'x' });
    assert.equal(login2.Status, 401);
    await app.Call(Ids.Aiko, 'POST', '/api/contents', { Title: 'Aman', Format: 'FEED' });
    const q = await app.Call(Ids.Aiko, 'GET', `/api/contents?Q=${encodeURIComponent("x' OR '1'='1")}`);
    assert.deepEqual(q.Body, []);
    const status = await app.Call(Ids.Aiko, 'GET', `/api/contents?Status=${encodeURIComponent("DRAFT' OR 1=1 --")}`);
    assert.equal(status.Status, 400);
    const drop = await app.Call(Ids.Aiko, 'POST', '/api/contents', { Title: "'); DROP TABLE Content; --", Format: 'FEED' });
    assert.equal(drop.Status, 201);
    assert.equal(drop.Body.Title, "'); DROP TABLE Content; --");
    assert.equal((await app.Call(Ids.Aiko, 'GET', '/api/contents')).Body.length, 2);
    assert.equal((await app.Call(Ids.Aiko, 'DELETE', '/api/contents/1%20OR%201=1')).Status, 404);
    app.Stop();
  });

  test('SEC5: creator tidak bisa mengakses data creator lain (IDOR) maupun fungsi admin (eskalasi peran)', async () => {
    const app = await StartTestApp();
    const mine = (await app.Call(Ids.Aiko, 'POST', '/api/contents', { Title: 'Rahasia Aiko', Format: 'FEED' })).Body;
    assert.equal((await app.Call(Ids.Raka, 'POST', `/api/contents/${mine.Id}/upload`, { InstagramLink: Link })).Status, 404);
    assert.equal((await app.Call(Ids.Raka, 'POST', `/api/contents/${mine.Id}/submit`, {})).Status, 404);
    assert.equal((await app.Call(Ids.Raka, 'DELETE', `/api/contents/${mine.Id}`)).Status, 404);
    assert.equal((await app.Call(Ids.Raka, 'GET', `/api/contents/${mine.Id}/reviews`)).Status, 404);
    assert.ok(!JSON.stringify((await app.Call(Ids.Raka, 'GET', '/api/contents')).Body).includes('Rahasia Aiko'));
    assert.ok(!JSON.stringify((await app.Call(Ids.Raka, 'GET', '/api/activity')).Body).includes('Rahasia Aiko'));
    for (const [method, path, body] of [
      ['POST', '/api/quotas', { UserId: Ids.Aiko, PeriodType: 'WEEKLY', TargetCount: 1, StartDate: '2026-12-01' }],
      ['DELETE', '/api/quotas/1', undefined], ['POST', `/api/contents/${mine.Id}/review`, { Decision: 'APPROVED' }],
      ['GET', '/api/dashboard/admin', undefined], ['GET', '/api/reports/contents.csv', undefined], ['GET', '/api/users', undefined],
    ] as const) {
      assert.equal((await app.Call(Ids.Raka, method, path, body)).Status, 403, `${method} ${path}`);
    }
    app.Stop();
  });

  test('SEC6: mass assignment: UserId, Status, UploadedAt dari klien diabaikan saat membuat konten', async () => {
    const app = await StartTestApp();
    const res = await app.Call(Ids.Aiko, 'POST', '/api/contents', {
      Title: 'Curang', Format: 'FEED', UserId: Ids.Raka, Status: 'UPLOADED', UploadedAt: '2026-10-01T00:00:00Z', InstagramLink: Link, Id: 999,
    });
    assert.equal(res.Status, 201);
    assert.equal(res.Body.UserId, Ids.Aiko);
    assert.equal(res.Body.Status, 'DRAFT');
    assert.equal(res.Body.UploadedAt, null);
    assert.equal(res.Body.InstagramLink, null);
    assert.notEqual(res.Body.Id, 999);
    app.Stop();
  });

  test('SEC7: XSS tersimpan: skrip di judul/caption disimpan apa adanya sebagai data JSON, bukan HTML', async () => {
    const app = await StartTestApp();
    const payload = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const res = await app.Call(Ids.Aiko, 'POST', '/api/contents', { Title: payload, Caption: payload, Format: 'FEED' });
    assert.equal(res.Status, 201);
    const raw = await Raw(app.Base, '/api/contents', { headers: { Authorization: `Bearer ${app.Tokens.get(Ids.Aiko)}` } });
    assert.match(raw.headers.get('content-type') ?? '', /application\/json/);
    assert.equal(raw.headers.get('x-content-type-options'), 'nosniff');
    // Tautan berbahaya ke atribut href ditolak di server (penjaga kedua setelah Esc() di UI dan CSP di header).
    for (const link of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'https://evil.example.com/p/abc/', 'https://www.instagram.com.evil.com/p/abc/', 'http://www.instagram.com/p/abc/']) {
      const c = (await app.Call(Ids.Aiko, 'POST', '/api/contents', { Title: 'x', Format: 'FEED' })).Body;
      assert.equal((await app.Call(Ids.Aiko, 'POST', `/api/contents/${c.Id}/upload`, { InstagramLink: link })).Status, 400, link);
    }
    app.Stop();
  });

  test('SEC8: brute force login dibatasi (429 + Retry-After), per email, dan reset setelah login berhasil atau jendela habis', async () => {
    const app = await StartTestApp();
    for (let i = 1; i <= MaxLoginFailures; i++) {
      assert.equal((await app.Call(null, 'POST', '/api/login', { Email: 'aiko@test.id', Password: `salah${i}` })).Status, 401);
    }
    const blocked = await fetch(`${app.Base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Email: 'aiko@test.id', Password: TestPassword }) });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.match(((await blocked.json()) as any).Message, /Terlalu banyak/);
    // Email lain tidak terdampak.
    assert.equal((await app.Call(null, 'POST', '/api/login', { Email: 'raka@test.id', Password: TestPassword })).Status, 200);
    app.Stop();

    const reset = await StartTestApp();
    for (let i = 0; i < MaxLoginFailures - 1; i++) await reset.Call(null, 'POST', '/api/login', { Email: 'sari@test.id', Password: 'salah' });
    assert.equal((await reset.Call(null, 'POST', '/api/login', { Email: 'sari@test.id', Password: TestPassword })).Status, 200);
    for (let i = 0; i < MaxLoginFailures; i++) assert.equal((await reset.Call(null, 'POST', '/api/login', { Email: 'sari@test.id', Password: 'salah' })).Status, 401);
    reset.Stop();
  });

  test('SEC9: isi permintaan terlalu besar ditolak 413, JSON rusak 400, kata sandi sangat panjang ditolak', async () => {
    const app = await StartTestApp();
    const big = await fetch(`${app.Base}/api/contents`, {
      method: 'POST', headers: { Authorization: `Bearer ${app.Tokens.get(Ids.Aiko)}` }, body: JSON.stringify({ Title: 'x'.repeat(200_000), Format: 'FEED' }),
    }).catch(() => null);
    assert.equal(big?.status, 413);
    assert.equal((await fetch(`${app.Base}/api/contents`, { method: 'POST', headers: { Authorization: `Bearer ${app.Tokens.get(Ids.Aiko)}` }, body: '[1,2' })).status, 400);
    assert.equal((await app.Call(null, 'POST', '/api/login', { Email: 'aiko@test.id', Password: 'x'.repeat(500) })).Status, 400);
    assert.equal((await app.Call(Ids.Aiko, 'GET', '/api/me')).Status, 200, 'server tetap sehat setelah serangan');
    app.Stop();
  });

  test('SEC10: log tidak memuat kata sandi, token, atau email lengkap; kejadian penting tercatat', async () => {
    const lines: any[] = [];
    const app = await StartTestApp(undefined, e => lines.push(e));
    await app.Call(null, 'POST', '/api/login', { Email: 'aiko@test.id', Password: 'SandiRahasia!' });
    const ok = await app.Call(null, 'POST', '/api/login', { Email: 'aiko@test.id', Password: TestPassword });
    await app.Call(null, 'GET', '/api/contents?Q=kata-kunci-pribadi');
    await fetch(`${app.Base}/api/me`, { headers: { Authorization: 'Bearer token-rahasia-123' } });
    const dump = JSON.stringify(lines);
    for (const secret of ['SandiRahasia!', TestPassword, ok.Body.Token, 'token-rahasia-123', 'aiko@test.id', 'kata-kunci-pribadi']) {
      assert.ok(!dump.includes(secret), `log tidak boleh memuat "${secret}"`);
    }
    const events = lines.map(l => l.Event);
    assert.ok(events.includes('LOGIN_FAILED') && events.includes('LOGIN_OK') && events.includes('AUTH_REJECTED'));
    assert.equal(lines.find(l => l.Event === 'LOGIN_FAILED').Email, 'a***@test.id');
    assert.ok(lines.every(l => l.RequestId || l.Event === 'LOGIN_FAILED' || l.Event === 'LOGIN_OK'));
    app.Stop();
  });

  test('SEC11: galat tak terduga: pengguna hanya menerima ErrorId, detail teknis hanya di log, server tetap hidup', async () => {
    const lines: any[] = [];
    const app = await StartTestApp(undefined, e => lines.push(e));
    app.Db.exec('DROP TABLE ContentReview');
    const res = await fetch(`${app.Base}/api/contents`, { headers: { Authorization: `Bearer ${app.Tokens.get(Ids.Aiko)}` } });
    const body: any = await res.json();
    assert.equal(res.status, 500);
    assert.match(body.ErrorId, /^[0-9a-f]{8}$/);
    assert.ok(body.Message.includes(body.ErrorId));
    const text = JSON.stringify(body);
    assert.ok(!/ContentReview|SQLITE|node:|\.ts|stack/i.test(text), 'respons tidak boleh membocorkan detail internal');
    const logged = lines.find(l => l.Event === 'UNHANDLED_ERROR');
    assert.equal(logged.ErrorId, body.ErrorId);
    assert.match(logged.Error, /ContentReview/);
    assert.equal(res.headers.get('x-request-id'), lines.find(l => l.Event === 'UNHANDLED_ERROR').RequestId);
    assert.equal((await fetch(`${app.Base}/api/me`, { headers: { Authorization: `Bearer ${app.Tokens.get(Ids.Aiko)}` } })).status, 200);
    app.Stop();
  });

  test('SEC12: /healthz publik untuk pemantauan, tanpa membocorkan data', async () => {
    const app = await StartTestApp();
    const res = await Raw(app.Base, '/healthz');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { Status: 'ok' });
    app.Db.close();
    assert.equal((await Raw(app.Base, '/healthz')).status, 503);
    app.Stop();
  });

  test('SEC13: waktu respons login email tidak dikenal setara email dikenal (anti enumerasi akun lewat waktu)', async () => {
    const app = await StartTestApp();
    const time = async (email: string) => {
      const t = process.hrtime.bigint();
      await app.Call(null, 'POST', '/api/login', { Email: email, Password: 'salah' });
      return Number(process.hrtime.bigint() - t) / 1e6;
    };
    await time('aiko@test.id');
    const known = await time('aiko@test.id');
    const unknown = await time('hantu@test.id');
    assert.ok(unknown > known * 0.3, `email tak dikenal terlalu cepat (${unknown.toFixed(1)} ms vs ${known.toFixed(1)} ms)`);
    app.Stop();
  });

  test('SEC14: MaskEmail menyamarkan alamat email dengan aman untuk input aneh', () => {
    assert.equal(MaskEmail('Aiko@miyunime.id'), 'A***@miyunime.id');
    assert.equal(MaskEmail('tanpa-at'), '***');
    assert.equal(MaskEmail(''), '');
    assert.equal(MaskEmail(undefined), '');
    assert.equal(MaskEmail({}), '');
  });

  test('SEC15: sesi kedaluwarsa dibersihkan dari database saat ada login berhasil', async () => {
    const app = await StartTestApp();
    app.Db.prepare('UPDATE Session SET ExpiresAt = ? WHERE UserId = ?').run('2026-10-15T07:00:00.000Z', Ids.Raka);
    const count = () => (app.Db.prepare('SELECT COUNT(*) AS C FROM Session').get() as { C: number }).C;
    assert.equal(count(), 4);
    assert.equal((await app.Call(null, 'POST', '/api/login', { Email: 'sari@test.id', Password: TestPassword })).Status, 200);
    assert.equal(count(), 4, 'sesi Raka yang kedaluwarsa hilang, sesi baru Sari bertambah');
    assert.equal((app.Db.prepare('SELECT COUNT(*) AS C FROM Session WHERE UserId = ?').get(Ids.Raka) as { C: number }).C, 0);
    app.Stop();
  });
});
