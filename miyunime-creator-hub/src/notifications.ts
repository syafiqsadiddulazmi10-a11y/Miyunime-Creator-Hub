import { Ok, type Context, type Result, type Route } from './http.ts';
import { BuildProgress, Priority } from './quota.ts';

/** Pengingat dihitung saat dibaca (bukan disimpan), jadi selalu sesuai kondisi data terbaru. */
export const ReminderDays = 3;
const DayMs = 86_400_000;

type Notice = { Type: string; Level: 'info' | 'warning' | 'danger'; Message: string };
type Creator = { Id: number; Name: string; InstagramHandle: string | null };

export function CreatorNotices(ctx: Context, creator: Creator): Notice[] {
  const notices: Notice[] = [];
  const p = BuildProgress(ctx.Db, creator, ctx.Now);
  if (p.QuotaStatus === 'LATE') {
    notices.push({ Type: 'QUOTA_LATE', Level: 'danger', Message: `Periode kuota sudah berakhir dan kamu masih kurang ${p.RemainingCount} konten.` });
  } else if (p.QuotaStatus === 'IN_PROGRESS') {
    const daysLeft = Math.ceil((new Date(p.EndDate as string).getTime() - ctx.Now.getTime()) / DayMs);
    if (daysLeft <= ReminderDays) {
      notices.push({
        Type: 'QUOTA_NEAR_DEADLINE', Level: 'warning',
        Message: `Tenggat kuota tinggal ${Math.max(daysLeft, 0)} hari lagi, sisa ${p.RemainingCount} konten.`,
      });
    }
  } else if (p.QuotaStatus === 'NO_QUOTA') {
    notices.push({ Type: 'NO_QUOTA', Level: 'info', Message: 'Admin belum menetapkan kuota untukmu.' });
  }
  const { Count } = ctx.Db
    .prepare("SELECT COUNT(*) AS Count FROM Content WHERE UserId = ? AND Status = 'REVISION'")
    .get(creator.Id) as { Count: number };
  if (Count > 0) notices.push({ Type: 'REVISION_PENDING', Level: 'warning', Message: `${Count} konten dikembalikan admin dan perlu direvisi.` });
  return notices;
}

export function ListNotifications(ctx: Context): Result {
  if (ctx.User.Role === 'CREATOR') {
    const creator = ctx.Db.prepare('SELECT Id, Name, InstagramHandle FROM User WHERE Id = ?').get(ctx.User.Id) as unknown as Creator;
    return Ok(CreatorNotices(ctx, creator));
  }
  const notices: Notice[] = [];
  const creators = ctx.Db.prepare("SELECT Id, Name, InstagramHandle FROM User WHERE Role = 'CREATOR'").all() as unknown as Creator[];
  const progress = creators.map(c => BuildProgress(ctx.Db, c, ctx.Now)).sort((a, b) => Priority[a.QuotaStatus] - Priority[b.QuotaStatus]);
  for (const p of progress) {
    if (p.QuotaStatus === 'LATE') notices.push({ Type: 'QUOTA_LATE', Level: 'danger', Message: `${p.Name} terlambat, kurang ${p.RemainingCount} konten.` });
    if (p.QuotaStatus === 'IN_PROGRESS') {
      const daysLeft = Math.ceil((new Date(p.EndDate as string).getTime() - ctx.Now.getTime()) / DayMs);
      if (daysLeft <= ReminderDays) notices.push({ Type: 'QUOTA_NEAR_DEADLINE', Level: 'warning', Message: `${p.Name} hampir tenggat (${Math.max(daysLeft, 0)} hari), kurang ${p.RemainingCount} konten.` });
    }
    if (p.QuotaStatus === 'NO_QUOTA') notices.push({ Type: 'NO_QUOTA', Level: 'info', Message: `${p.Name} belum punya kuota.` });
  }
  const { Count } = ctx.Db.prepare("SELECT COUNT(*) AS Count FROM Content WHERE Status = 'SUBMITTED'").get() as { Count: number };
  if (Count > 0) notices.unshift({ Type: 'REVIEW_PENDING', Level: 'warning', Message: `${Count} konten menunggu review.` });
  return Ok(notices);
}

export const NotificationRoutes: Route[] = [{ Method: 'GET', Pattern: /^\/api\/notifications$/, Handler: ListNotifications }];
