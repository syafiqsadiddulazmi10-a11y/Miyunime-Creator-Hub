import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { Fail, Ok, type Context, type Result, type Route, type User } from './http.ts';
import { LogActivity } from './activity.ts';

const SessionHours = 12;
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
  const row = ctx.Db
    .prepare('SELECT Id, Name, Role, PasswordHash FROM User WHERE lower(Email) = lower(?)')
    .get(Email.trim()) as unknown as (User & { PasswordHash: string | null }) | undefined;
  // Pesan sama untuk email salah dan sandi salah supaya keberadaan akun tidak bocor.
  if (!row || !VerifyPassword(Password, row.PasswordHash)) return Fail(401, 'Email atau kata sandi salah');
  const token = CreateSession(ctx.Db, row.Id, ctx.Now);
  LogActivity(ctx.Db, ctx.Now, row.Id, 'LOGIN', `Masuk sebagai ${row.Name}`);
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
