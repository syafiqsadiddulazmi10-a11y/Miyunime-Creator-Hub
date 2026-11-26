import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { Fail, Ok, type Context, type Result, type Route, type User } from './http.ts';
import { LogActivity } from './activity.ts';
import { MaskEmail } from './logger.ts';

const SessionHours = 12;
/** Batas percobaan login gagal: 5 kali per 15 menit untuk setiap pasangan alamat IP dan email. */
export const MaxLoginFailures = 5;
export const LoginWindowMs = 15 * 60_000;
const Failures = new WeakMap<DatabaseSync, Map<string, { Count: number; Since: number }>>();
// Hash tiruan agar waktu respons email tidak dikenal sama dengan email dikenal (mencegah enumerasi akun lewat waktu).
const DummyHash = HashPasswordOnce();

function HashPasswordOnce(): string {
  return `${'0'.repeat(32)}:${scryptSync('tidak-dipakai', '0'.repeat(32), 32).toString('hex')}`;
}

function FailureBucket(db: DatabaseSync): Map<string, { Count: number; Since: number }> {
  let bucket = Failures.get(db);
  if (!bucket) Failures.set(db, (bucket = new Map()));
  return bucket;
}

const HourMs = 3_600_000;

export function HashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function VerifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Mengembalikan pengguna pemilik token yang masih berlaku, atau undefined. */
export function UserFromToken(db: DatabaseSync, token: string | undefined, now: Date): User | undefined {
  if (!token) return undefined;
  return db
    .prepare(
      `SELECT u.Id, u.Name, u.Role FROM Session s JOIN User u ON u.Id = s.UserId
       WHERE s.Token = ? AND s.ExpiresAt > ?`,
    )
    .get(token, now.toISOString()) as unknown as User | undefined;
}

export function CreateSession(db: DatabaseSync, userId: number, now: Date): string {
  const token = randomBytes(24).toString('hex');
  db.prepare('INSERT INTO Session (Token, UserId, ExpiresAt) VALUES (?, ?, ?)').run(
    token, userId, new Date(now.getTime() + SessionHours * HourMs).toISOString(),
  );
  return token;
}

export function Login(ctx: Context): Result {
  const { Email, Password } = ctx.Body;
  if (typeof Email !== 'string' || !Email.trim() || typeof Password !== 'string' || !Password) {
    return Fail(400, 'Email dan kata sandi wajib diisi');
  }
  if (Password.length > 200) return Fail(400, 'Kata sandi terlalu panjang');
  const key = `${ctx.Ip ?? '-'}|${Email.trim().toLowerCase()}`;
  const bucket = FailureBucket(ctx.Db);
  const entry = bucket.get(key);
  const nowMs = ctx.Now.getTime();
  if (entry && nowMs - entry.Since >= LoginWindowMs) bucket.delete(key);
  const active = bucket.get(key);
  if (active && active.Count >= MaxLoginFailures) {
    const retry = Math.max(1, Math.ceil((active.Since + LoginWindowMs - nowMs) / 1000));
    ctx.Log?.({ Level: 'warn', Event: 'LOGIN_BLOCKED', Email: MaskEmail(Email), Ip: ctx.Ip });
    return { Status: 429, Body: { Message: 'Terlalu banyak percobaan masuk yang gagal. Coba lagi beberapa menit lagi.' }, Headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(retry) } };
  }
  const row = ctx.Db
    .prepare('SELECT Id, Name, Role, PasswordHash FROM User WHERE lower(Email) = lower(?)')
    .get(Email.trim()) as unknown as (User & { PasswordHash: string | null }) | undefined;
  // Pesan sama untuk email salah dan sandi salah supaya keberadaan akun tidak bocor.
  const valid = VerifyPassword(Password, row?.PasswordHash ?? DummyHash) && !!row?.PasswordHash;
  if (!row || !valid) {
    const current = bucket.get(key) ?? { Count: 0, Since: nowMs };
    bucket.set(key, { Count: current.Count + 1, Since: current.Since });
    ctx.Log?.({ Level: 'warn', Event: 'LOGIN_FAILED', Email: MaskEmail(Email), Ip: ctx.Ip, Attempt: current.Count + 1 });
    return Fail(401, 'Email atau kata sandi salah');
  }
  bucket.delete(key);
  ctx.Db.prepare('DELETE FROM Session WHERE ExpiresAt <= ?').run(ctx.Now.toISOString());
  const token = CreateSession(ctx.Db, row.Id, ctx.Now);
  LogActivity(ctx.Db, ctx.Now, row.Id, 'LOGIN', `Masuk sebagai ${row.Name}`);
  ctx.Log?.({ Event: 'LOGIN_OK', UserId: row.Id, Role: row.Role });
  return Ok({ Token: token, User: { Id: row.Id, Name: row.Name, Role: row.Role } });
}

export function Logout(ctx: Context): Result {
  const header = String(ctx.Headers?.authorization ?? '');
  const token = header.replace(/^Bearer\s+/i, '');
  ctx.Db.prepare('DELETE FROM Session WHERE Token = ?').run(token);
  return Ok({ LoggedOut: true });
}

export const AuthRoutes: Route[] = [
  { Method: 'POST', Pattern: /^\/api\/login$/, Public: true, Handler: Login },
  { Method: 'POST', Pattern: /^\/api\/logout$/, Handler: Logout },
];
