import { Csv, Fail, type Context, type Result, type Route } from './http.ts';
import { BuildProgress, Priority, QuotaLabel } from './quota.ts';

const Formats = ['FEED', 'REELS', 'STORY', 'CAROUSEL'];
const Statuses = ['DRAFT', 'SUBMITTED', 'REVISION', 'APPROVED', 'SCHEDULED', 'UPLOADED'];
const StatusLabel: Record<string, string> = {
  DRAFT: 'Draft', SUBMITTED: 'Diajukan', REVISION: 'Perlu revisi', APPROVED: 'Disetujui', SCHEDULED: 'Terjadwal', UPLOADED: 'Sudah diupload',
};
const FormatLabel: Record<string, string> = { FEED: 'Feed', REELS: 'Reels', STORY: 'Story', CAROUSEL: 'Carousel' };
const PeriodLabel: Record<string, string> = { WEEKLY: 'Mingguan', MONTHLY: 'Bulanan' };

/**
 * Satu sel CSV (RFC 4180). Sel teks yang diawali = + - @ atau tab diberi apostrof di depannya, karena Excel
 * dan Google Sheets akan menjalankannya sebagai rumus (CSV injection). Angka tidak diubah.
 */
export function CsvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const ToCsv = (rows: unknown[][]): string => rows.map(row => row.map(CsvCell).join(',')).join('\r\n') + '\r\n';

const DateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
function ParseDay(value: string): Date | null {
  const m = DateOnly.exec(value);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.getUTCMonth() === Number(m[2]) - 1 && date.getUTCDate() === Number(m[3]) ? date : null;
}

type Filter = { CreatorId: number | null; Status: string | null; Format: string | null; From: string | null; To: string | null; Q: string | null };

export function ParseFilter(query: URLSearchParams): { Filter: Filter } | { Error: Result } {
  const text = (name: string) => query.get(name)?.trim() || null;
  const creator = text('CreatorId');
  if (creator !== null && !/^\d+$/.test(creator)) return { Error: Fail(400, 'CreatorId harus berupa angka') };
  const status = text('Status');
  if (status !== null && !Statuses.includes(status)) return { Error: Fail(400, `Status harus salah satu dari ${Statuses.join(', ')}`) };
  const format = text('Format');
  if (format !== null && !Formats.includes(format)) return { Error: Fail(400, `Format harus salah satu dari ${Formats.join(', ')}`) };

  const fromText = text('From');
  const toText = text('To');
  const from = fromText === null ? null : ParseDay(fromText);
  const to = toText === null ? null : ParseDay(toText);
  if ((fromText !== null && !from) || (toText !== null && !to)) return { Error: Fail(400, 'Tanggal harus berformat YYYY-MM-DD') };
  if (from && to && from > to) return { Error: Fail(400, 'Tanggal mulai tidak boleh setelah tanggal akhir') };
  return {
    Filter: {
      CreatorId: creator === null ? null : Number(creator),
      Status: status,
      Format: format,
      From: from ? from.toISOString() : null,
      // Tanggal akhir inklusif: sampai 23:59:59.999 UTC hari itu.
      To: to ? new Date(to.getTime() + 86_400_000 - 1).toISOString() : null,
      Q: text('Q'),
    },
  };
}

const RequireAdmin = (ctx: Context): Result | null =>
  ctx.User.Role === 'ADMIN' ? null : Fail(403, 'Laporan hanya untuk admin');

const Day = (now: Date) => now.toISOString().slice(0, 10);

/**
 * Tanggal laporan sebuah konten adalah waktu upload jika sudah diupload, jika belum waktu konten dibuat.
 * Dengan begitu filter tanggal pada laporan kinerja mengikuti kapan konten benar-benar tayang.
 */
export function ContentReport(ctx: Context): Result {
  const denied = RequireAdmin(ctx);
  if (denied) return denied;
  const parsed = ParseFilter(ctx.Query);
  if ('Error' in parsed) return parsed.Error;
  const f = parsed.Filter;
  const like = f.Q ? `%${f.Q.replace(/[\\%_]/g, '\\$&')}%` : null;
  const rows = ctx.Db
    .prepare(
      `SELECT u.Name AS CreatorName, c.Title, c.Format, c.Status, c.ScheduledAt, c.InstagramLink, c.UploadedAt, c.CreatedAt,
              (SELECT r.Comment FROM ContentReview r WHERE r.ContentId = c.Id ORDER BY r.Id DESC LIMIT 1) AS ReviewComment
       FROM Content c JOIN User u ON u.Id = c.UserId
       WHERE (? IS NULL OR c.UserId = ?) AND (? IS NULL OR c.Status = ?) AND (? IS NULL OR c.Format = ?)
         AND (? IS NULL OR COALESCE(c.UploadedAt, c.CreatedAt) >= ?) AND (? IS NULL OR COALESCE(c.UploadedAt, c.CreatedAt) <= ?)
         AND (? IS NULL OR c.Title LIKE ? ESCAPE '\\')
       ORDER BY COALESCE(c.UploadedAt, c.CreatedAt), c.Id`,
    )
    .all(f.CreatorId, f.CreatorId, f.Status, f.Status, f.Format, f.Format, f.From, f.From, f.To, f.To, f.Q, like) as Record<string, string | null>[];
  const header = ['Creator', 'Judul', 'Format', 'Status', 'Jadwal Upload', 'Tautan Instagram', 'Waktu Upload', 'Dibuat', 'Catatan Review'];
  const body = rows.map(r => [
    r.CreatorName, r.Title, FormatLabel[r.Format as string], StatusLabel[r.Status as string],
    r.ScheduledAt, r.InstagramLink, r.UploadedAt, r.CreatedAt, r.ReviewComment,
  ]);
  return Csv(ToCsv([header, ...body]), `miyunime-laporan-konten-${Day(ctx.Now)}.csv`);
}

/** Laporan kuota memakai BuildProgress yang sama dengan dashboard, sehingga angka laporan dan layar tidak bisa berbeda. */
export function QuotaReport(ctx: Context): Result {
  const denied = RequireAdmin(ctx);
  if (denied) return denied;
  const creators = ctx.Db.prepare("SELECT Id, Name, InstagramHandle FROM User WHERE Role = 'CREATOR'").all() as unknown as {
    Id: number; Name: string; InstagramHandle: string | null;
  }[];
  const progress = creators
    .map(c => BuildProgress(ctx.Db, c, ctx.Now))
    .sort((a, b) => Priority[a.QuotaStatus] - Priority[b.QuotaStatus] || a.Name.localeCompare(b.Name));
  const header = ['Creator', 'Username Instagram', 'Periode', 'Mulai', 'Selesai', 'Target', 'Terupload', 'Sisa', 'Status Kuota'];
  const body = progress.map(p => [
    // Username ditulis tanpa '@': diawali '@' akan dianggap rumus oleh Excel dan terpaksa diberi apostrof.
    p.Name, p.InstagramHandle?.replace(/^@/, ''), p.PeriodType ? PeriodLabel[p.PeriodType] : '', p.StartDate, p.EndDate,
    p.TargetCount, p.UploadedCount, p.RemainingCount, QuotaLabel[p.QuotaStatus],
  ]);
  return Csv(ToCsv([header, ...body]), `miyunime-laporan-kuota-${Day(ctx.Now)}.csv`);
}

export const ReportRoutes: Route[] = [
  { Method: 'GET', Pattern: /^\/api\/reports\/contents\.csv$/, Handler: ContentReport },
  { Method: 'GET', Pattern: /^\/api\/reports\/quota\.csv$/, Handler: QuotaReport },
];
