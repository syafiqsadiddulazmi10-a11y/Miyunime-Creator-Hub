import { Fail, Ok, type Context, type Result, type Route } from './http.ts';

const PeriodTypes = ['WEEKLY', 'MONTHLY'];
const MaxTarget = 100;
const DayMs = 86_400_000;

/**
 * Akhir periode dihitung server dari tanggal mulai, bukan dari input admin, supaya periode selalu utuh.
 * WEEKLY: 7 hari. MONTHLY: sampai tanggal yang sama bulan berikutnya (dipotong ke hari terakhir bulan itu).
 * Keduanya berakhir 1 milidetik sebelum periode berikutnya dimulai, sama dengan format data seed.
 */
export function ComputeQuotaEnd(periodType: string, start: Date): Date {
  if (periodType === 'WEEKLY') return new Date(start.getTime() + 7 * DayMs - 1);
  const month = start.getUTCMonth() + 1;
  const year = start.getUTCFullYear() + Math.floor(month / 12);
  const targetMonth = month % 12;
  const daysInTarget = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, targetMonth, Math.min(start.getUTCDate(), daysInTarget)) - 1);
}

/** Terima YYYY-MM-DD (atau ISO penuh) dan kembalikan tengah malam UTC tanggal itu. Tanggal fiktif seperti 2026-02-30 ditolak. */
export function ParseStartDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? date : null;
}

const RequireAdmin = (ctx: Context): Result | null =>
  ctx.User.Role === 'ADMIN' ? null : Fail(403, 'Hanya admin yang dapat mengatur kuota');

export function CreateQuota(ctx: Context): Result {
  const denied = RequireAdmin(ctx);
  if (denied) return denied;
  const { UserId, PeriodType, TargetCount, StartDate } = ctx.Body;

  if (typeof PeriodType !== 'string' || !PeriodTypes.includes(PeriodType)) {
    return Fail(400, `Periode harus salah satu dari ${PeriodTypes.join(', ')}`);
  }
  if (typeof TargetCount !== 'number' || !Number.isInteger(TargetCount) || TargetCount < 1 || TargetCount > MaxTarget) {
    return Fail(400, `Target kuota harus bilangan bulat antara 1 dan ${MaxTarget}`);
  }
  const start = ParseStartDate(StartDate);
  if (!start) return Fail(400, 'Tanggal mulai tidak valid, gunakan format YYYY-MM-DD');

  const creator = ctx.Db.prepare("SELECT Id FROM User WHERE Id = ? AND Role = 'CREATOR'").get(Number(UserId));
  if (!creator) return Fail(404, 'Creator tidak ditemukan');

  const startIso = start.toISOString();
  const endIso = ComputeQuotaEnd(PeriodType, start).toISOString();
  const clash = ctx.Db
    .prepare('SELECT Id FROM Quota WHERE UserId = ? AND StartDate <= ? AND EndDate >= ?')
    .get(Number(UserId), endIso, startIso);
  if (clash) return Fail(409, 'Periode ini bertabrakan dengan kuota creator yang sudah ada');

  const info = ctx.Db
    .prepare('INSERT INTO Quota (UserId, PeriodType, TargetCount, StartDate, EndDate) VALUES (?, ?, ?, ?, ?)')
    .run(Number(UserId), PeriodType, TargetCount, startIso, endIso);
  return Ok(ctx.Db.prepare('SELECT * FROM Quota WHERE Id = ?').get(Number(info.lastInsertRowid)), 201);
}

export function ListQuotas(ctx: Context): Result {
  const isAdmin = ctx.User.Role === 'ADMIN';
  return Ok(
    ctx.Db
      .prepare(
        `SELECT q.*, u.Name AS CreatorName FROM Quota q JOIN User u ON u.Id = q.UserId
         WHERE (? = 1 OR q.UserId = ?) ORDER BY q.StartDate DESC, q.Id DESC`,
      )
      .all(isAdmin ? 1 : 0, ctx.User.Id),
  );
}

/** Kuota yang sudah mulai berjalan menjadi dasar evaluasi, jadi hanya kuota masa depan yang boleh dihapus. */
export function DeleteQuota(ctx: Context): Result {
  const denied = RequireAdmin(ctx);
  if (denied) return denied;
  const quota = ctx.Db.prepare('SELECT Id, StartDate FROM Quota WHERE Id = ?').get(Number(ctx.Params.Id)) as
    | { Id: number; StartDate: string }
    | undefined;
  if (!quota) return Fail(404, 'Kuota tidak ditemukan');
  if (quota.StartDate <= ctx.Now.toISOString()) return Fail(409, 'Kuota yang sudah berjalan atau selesai tidak dapat dihapus');
  ctx.Db.prepare('DELETE FROM Quota WHERE Id = ?').run(quota.Id);
  return Ok({ Id: quota.Id });
}

export const QuotaSettingsRoutes: Route[] = [
  { Method: 'GET', Pattern: /^\/api\/quotas$/, Handler: ListQuotas },
  { Method: 'POST', Pattern: /^\/api\/quotas$/, Handler: CreateQuota },
  { Method: 'DELETE', Pattern: /^\/api\/quotas\/(?<Id>\d+)$/, Handler: DeleteQuota },
];
