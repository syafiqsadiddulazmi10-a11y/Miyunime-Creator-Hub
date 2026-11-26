import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { HashPassword, VerifyPassword } from '../src/auth.ts';
import { FixedNow, Ids, StartTestApp, TestPassword } from './helpers.ts';

let app: Awaited<ReturnType<typeof StartTestApp>>;
before(async () => (app = await StartTestApp()));
after(() => app.Stop());

const Login = (body: object) => app.Call(null, 'POST', '/api/login', body);

describe('Fitur 6: autentikasi dan otorisasi berbasis peran', () => {
  test('AC1: login dengan email dan sandi benar menghasilkan token dan identitas peran', async () => {
    const { Status, Body } = await Login({ Email: 'AIKO@test.id', Password: TestPassword });
    assert.equal(Status, 200);
    assert.equal(Body.User.Role, 'CREATOR');
    assert.equal(Body.User.Name, 'Aiko');
    assert.match(Body.Token, /^[0-9a-f]{48}$/);
    assert.equal(Body.User.PasswordHash, undefined);
  });

  test('AC2: sandi salah, email tidak dikenal, dan input kosong ditolak tanpa membocorkan akun mana yang ada', async () => {
    const wrongPassword = await Login({ Email: 'aiko@test.id', Password: 'salah' });
    const unknownEmail = await Login({ Email: 'hantu@test.id', Password: TestPassword });
    assert.equal(wrongPassword.Status, 401);
    assert.equal(unknownEmail.Status, 401);
    assert.equal(wrongPassword.Body.Message, unknownEmail.Body.Message);
    const empty = await Login({ Email: '', Password: '' });
    assert.equal(empty.Status, 400);
    assert.match(empty.Body.Message, /wajib diisi/);
    assert.equal((await Login({})).Status, 400);
  });

  test('AC3: tanpa token, token palsu, atau header X-User-Id lama tidak memberi akses (401)', async () => {
    assert.equal((await app.Call(null, 'GET', '/api/contents')).Status, 401);
    assert.equal((await app.Call(null, 'GET', '/api/users')).Status, 401);
    const forged = await fetch(`${app.Base}/api/contents`, { headers: { Authorization: 'Bearer palsu' } });
    assert.equal(forged.status, 401);
    const legacy = await fetch(`${app.Base}/api/contents`, { headers: { 'X-User-Id': String(Ids.Admin) } });
    assert.equal(legacy.status, 401);
  });

  test('AC4: token dari login bisa dipakai, dan logout mencabutnya', async () => {
    const { Body } = await Login({ Email: 'raka@test.id', Password: TestPassword });
    const headers = { Authorization: `Bearer ${Body.Token}` };
    const me = await fetch(`${app.Base}/api/me`, { headers });
    assert.equal(me.status, 200);
    assert.equal(((await me.json()) as any).Name, 'Raka');
    assert.equal((await fetch(`${app.Base}/api/logout`, { method: 'POST', headers })).status, 200);
    assert.equal((await fetch(`${app.Base}/api/me`, { headers })).status, 401);
  });

  test('AC5: sesi kedaluwarsa ditolak', async () => {
    const later = await StartTestApp('2026-10-15T08:00:00.000Z');
    const { Body } = await later.Call(null, 'POST', '/api/login', { Email: 'aiko@test.id', Password: TestPassword });
    later.Db.prepare('UPDATE Session SET ExpiresAt = ? WHERE Token = ?').run('2026-10-15T07:00:00.000Z', Body.Token);
    const res = await fetch(`${later.Base}/api/me`, { headers: { Authorization: `Bearer ${Body.Token}` } });
    assert.equal(res.status, 401);
    later.Stop();
  });

  test('AC6: kata sandi disimpan sebagai hash bergaram, bukan teks asli', () => {
    const a = HashPassword('abc12345');
    const b = HashPassword('abc12345');
    assert.notEqual(a, b);
    assert.ok(!a.includes('abc12345'));
    assert.equal(VerifyPassword('abc12345', a), true);
    assert.equal(VerifyPassword('abc12346', a), false);
    assert.equal(VerifyPassword('apa saja', null), false);
    const row = app.Db.prepare('SELECT PasswordHash FROM User WHERE Id = ?').get(Ids.Aiko) as { PasswordHash: string };
    assert.ok(!row.PasswordHash.includes(TestPassword));
  });

  test('AC7: pembatasan peran tetap berlaku lewat token (creator tidak bisa membuka laporan admin)', async () => {
    assert.equal((await app.Call(Ids.Aiko, 'GET', '/api/reports/quota.csv')).Status, 403);
    assert.equal((await app.Call(Ids.Admin, 'GET', '/api/dashboard/admin')).Status, 200);
  });

  test('AC8: isi permintaan bukan JSON dijawab 400, bukan 500', async () => {
    const res = await fetch(`${app.Base}/api/login`, { method: 'POST', body: '{rusak' });
    assert.equal(res.status, 400);
  });

  test('AC9: login dan logout tercatat di log aktivitas', async () => {
    await Login({ Email: 'sari@test.id', Password: TestPassword });
    const log = await app.Call(Ids.Admin, 'GET', '/api/activity');
    assert.ok(log.Body.some((a: any) => a.Action === 'LOGIN' && a.UserName === 'Sari'));
    assert.ok(FixedNow);
  });
});
