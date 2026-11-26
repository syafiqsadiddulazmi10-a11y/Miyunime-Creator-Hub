import type { DatabaseSync } from 'node:sqlite';
import { Fail, Ok, type Context, type Result, type Route } from './http.ts';

export type QuotaStatus = 'FULFILLED' | 'IN_PROGRESS' | 'LATE' | 'NO_QUOTA';
type Creator = { Id: number; Name: string; InstagramHandle: string | null };
type QuotaRow = { Id: number; PeriodType: string; TargetCount: number; StartDate: string; EndDate: string };

export const QuotaLabel: Record<QuotaStatus, string> = {
  FULFILLED: 'Terpenuhi', IN_PROGRESS: 'Dalam progres', LATE: 'Terlambat', NO_QUOTA: 'Belum ada kuota',
};

export function ComputeQuotaStatus(uploaded: number, target: number, endDate: string, now: Date): QuotaStatus {
  if (uploaded >= target) return 'FULFILLED';
  return new Date(endDate).getTime() < now.getTime() ? 'LATE' : 'IN_PROGRESS';
}

export function BuildProgress(db: DatabaseSync, creator: Creator, now: Date) {
  const nowIso = now.toISOString();
  const quota = db
    .prepare('SELECT * FROM Quota WHERE UserId = ? ORDER BY (StartDate <= ? AND EndDate >= ?) DESC, EndDate DESC LIMIT 1')
    .get(creator.Id, nowIso, nowIso) as unknown as QuotaRow | undefined;
  const who = { UserId: creator.Id, Name: creator.Name, InstagramHandle: creator.InstagramHandle };
  if (!quota) {
    return {
      ...who, QuotaId: null, PeriodType: null, StartDate: null, EndDate: null,
      TargetCount: 0, UploadedCount: 0, RemainingCount: 0, QuotaStatus: 'NO_QUOTA' as QuotaStatus,
    };
  }
  const { Count } = db
    .prepare(
      `SELECT COUNT(*) AS Count FROM Content
       WHERE UserId = ? AND Status = 'UPLOADED' AND InstagramLink IS NOT NULL AND UploadedAt >= ? AND UploadedAt <= ?`,
    )
    .get(creator.Id, quota.StartDate, quota.EndDate) as { Count: number };
  return {
    ...who,
    QuotaId: quota.Id,
    PeriodType: quota.PeriodType,
    StartDate: quota.StartDate,
    EndDate: quota.EndDate,
    TargetCount: quota.TargetCount,
    UploadedCount: Count,
    RemainingCount: Math.max(0, quota.TargetCount - Count),
    QuotaStatus: ComputeQuotaStatus(Count, quota.TargetCount, quota.EndDate, now),
  };
}

export const Priority: Record<QuotaStatus, number> = { LATE: 0, IN_PROGRESS: 1, NO_QUOTA: 2, FULFILLED: 3 };

export function DashboardMe(ctx: Context): Result {
  if (ctx.User.Role !== 'CREATOR') return Fail(403, 'Dashboard pribadi hanya untuk creator');
  const creator = ctx.Db.prepare('SELECT Id, Name, InstagramHandle FROM User WHERE Id = ?').get(ctx.User.Id) as unknown as Creator;
  return Ok(BuildProgress(ctx.Db, creator, ctx.Now));
}

export function DashboardAdmin(ctx: Context): Result {
  if (ctx.User.Role !== 'ADMIN') return Fail(403, 'Dashboard ini hanya untuk admin');
  const creators = ctx.Db.prepare("SELECT Id, Name, InstagramHandle FROM User WHERE Role = 'CREATOR'").all() as unknown as Creator[];
  const progress = creators
    .map(c => BuildProgress(ctx.Db, c, ctx.Now))
    .sort((a, b) => Priority[a.QuotaStatus] - Priority[b.QuotaStatus] || a.Name.localeCompare(b.Name));
  const count = (status: QuotaStatus) => progress.filter(p => p.QuotaStatus === status).length;
  return Ok({
    Summary: {
      TotalCreators: progress.length,
      CreatorsFulfilled: count('FULFILLED'),
      CreatorsInProgress: count('IN_PROGRESS'),
      CreatorsLate: count('LATE'),
      CreatorsWithoutQuota: count('NO_QUOTA'),
      TotalContentUploadedThisPeriod: progress.reduce((sum, p) => sum + p.UploadedCount, 0),
    },
    Creators: progress,
  });
}

export const QuotaRoutes: Route[] = [
  { Method: 'GET', Pattern: /^\/api\/dashboard\/me$/, Handler: DashboardMe },
  { Method: 'GET', Pattern: /^\/api\/dashboard\/admin$/, Handler: DashboardAdmin },
];
