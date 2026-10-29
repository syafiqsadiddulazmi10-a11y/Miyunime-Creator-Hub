import { Fail, Ok, type Context, type Result, type Route } from './http.ts';
import { LogActivity } from './activity.ts';

const Formats = ['FEED', 'REELS', 'STORY', 'CAROUSEL'];
const InstagramPath = /^\/(?:(?:p|reel|reels|tv)\/[\w-]+|stories\/[\w.]+\/\d+)/;

export function IsInstagramLink(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace(/^www\./, '');
    return url.protocol === 'https:' && host === 'instagram.com' && InstagramPath.test(url.pathname);
  } catch {
    return false;
  }
}

export type ContentRow = ContentInput & { Id: number; UserId: number; Status: string };

export function FindOwn(ctx: Context) {
  return ctx.Db.prepare('SELECT * FROM Content WHERE Id = ? AND UserId = ?').get(Number(ctx.Params.Id), ctx.User.Id) as
    | ContentRow
    | undefined;
}

export const RequireCreator = (ctx: Context): Result | null =>
  ctx.User.Role === 'CREATOR' ? null : Fail(403, 'Hanya creator yang dapat mengelola kontennya');

export type ContentInput = { Title: string; Caption: string | null; Format: string; ScheduledAt: string | null; LinkDraft: string | null };

function IsHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Validasi satu-satunya untuk Title, Format, Caption, dan ScheduledAt. Dipakai saat membuat dan saat mengajukan ulang. */
export function ParseContentInput(body: Record<string, unknown>): { Input: ContentInput } | { Error: Result } {
  const { Title, Caption, Format, ScheduledAt, LinkDraft } = body;
  const title = typeof Title === 'string' ? Title.trim() : '';
  if (!title || title.length > 120) return { Error: Fail(400, 'Judul wajib diisi dan maksimal 120 karakter') };
  if (typeof Format !== 'string' || !Formats.includes(Format)) {
    return { Error: Fail(400, `Format harus salah satu dari ${Formats.join(', ')}`) };
  }
  if (Caption != null && (typeof Caption !== 'string' || Caption.length > 2200)) {
    return { Error: Fail(400, 'Caption maksimal 2200 karakter') };
  }
  if (ScheduledAt && (typeof ScheduledAt !== 'string' || Number.isNaN(Date.parse(ScheduledAt)))) {
    return { Error: Fail(400, 'Jadwal upload tidak valid') };
  }
  const draft = typeof LinkDraft === 'string' ? LinkDraft.trim() : '';
  if (LinkDraft != null && typeof LinkDraft !== 'string') return { Error: Fail(400, 'Tautan aset/draft tidak valid') };
  if (draft && (draft.length > 500 || !IsHttpUrl(draft))) {
    return { Error: Fail(400, 'Tautan aset/draft harus berupa alamat http(s) yang valid, maksimal 500 karakter') };
  }
  return {
    Input: {
      LinkDraft: draft || null,
      Title: title,
      Caption: (Caption as string | null | undefined) ?? null,
      Format,
      ScheduledAt: ScheduledAt ? new Date(ScheduledAt as string).toISOString() : null,
    },
  };
}

export function CreateContent(ctx: Context): Result {
  const denied = RequireCreator(ctx);
  if (denied) return denied;
  const parsed = ParseContentInput(ctx.Body);
  if ('Error' in parsed) return parsed.Error;
  const { Title, Caption, Format, ScheduledAt, LinkDraft } = parsed.Input;
  const info = ctx.Db
    .prepare('INSERT INTO Content (UserId, Title, Caption, Format, Status, ScheduledAt, LinkDraft, CreatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(ctx.User.Id, Title, Caption, Format, ScheduledAt ? 'SCHEDULED' : 'DRAFT', ScheduledAt, LinkDraft, ctx.Now.toISOString());
  LogActivity(ctx.Db, ctx.Now, ctx.User.Id, 'CONTENT_CREATED', `Membuat konten "${Title}"`);
  return Ok(ctx.Db.prepare('SELECT * FROM Content WHERE Id = ?').get(Number(info.lastInsertRowid)), 201);
}

const ListStatuses = ['DRAFT', 'SUBMITTED', 'REVISION', 'APPROVED', 'SCHEDULED', 'UPLOADED'];
const DayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function ParseDay(value: string | null): Date | null | undefined {
  if (value === null || value === '') return undefined;
  const m = DayPattern.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null;
}

/** Daftar konten. Filter opsional: Status, Format, Q (judul), From/To (YYYY-MM-DD, memakai waktu upload atau waktu dibuat), CreatorId (admin). */
export function ListContents(ctx: Context): Result {
  const isAdmin = ctx.User.Role === 'ADMIN';
  const text = (name: string) => ctx.Query.get(name)?.trim() || null;
  const status = text('Status');
  if (status && !ListStatuses.includes(status)) return Fail(400, `Status harus salah satu dari ${ListStatuses.join(', ')}`);
  const format = text('Format');
  if (format && !Formats.includes(format)) return Fail(400, `Format harus salah satu dari ${Formats.join(', ')}`);
  const from = ParseDay(text('From'));
  const to = ParseDay(text('To'));
  if (from === null || to === null) return Fail(400, 'Tanggal harus berformat YYYY-MM-DD');
  if (from && to && from > to) return Fail(400, 'Tanggal mulai tidak boleh setelah tanggal akhir');
  const creatorId = text('CreatorId');
  if (creatorId && !/^\d+$/.test(creatorId)) return Fail(400, 'CreatorId harus berupa angka');
  const q = text('Q');
  const like = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null;
  const fromIso = from ? from.toISOString() : null;
  const toIso = to ? new Date(to.getTime() + 86_400_000 - 1).toISOString() : null;
  const rows = ctx.Db
    .prepare(
      `SELECT c.*, u.Name AS CreatorName,
              (SELECT r.Comment FROM ContentReview r WHERE r.ContentId = c.Id ORDER BY r.Id DESC LIMIT 1) AS ReviewComment
       FROM Content c JOIN User u ON u.Id = c.UserId
       WHERE (? = 1 OR c.UserId = ?) AND (? IS NULL OR c.Status = ?) AND (? IS NULL OR c.Format = ?)
         AND (? IS NULL OR c.UserId = ?)
         AND (? IS NULL OR COALESCE(c.UploadedAt, c.CreatedAt) >= ?) AND (? IS NULL OR COALESCE(c.UploadedAt, c.CreatedAt) <= ?)
         AND (? IS NULL OR c.Title LIKE ? ESCAPE '\\')
       ORDER BY c.CreatedAt DESC, c.Id DESC`,
    )
    .all(
      isAdmin ? 1 : 0, ctx.User.Id, status, status, format, format,
      isAdmin && creatorId ? Number(creatorId) : null, isAdmin && creatorId ? Number(creatorId) : null,
      fromIso, fromIso, toIso, toIso, like, like,
    );
  return Ok(rows);
}

export function UploadContent(ctx: Context): Result {
  const denied = RequireCreator(ctx);
  if (denied) return denied;
  const content = FindOwn(ctx);
  if (!content) return Fail(404, 'Konten tidak ditemukan');
  if (content.Status === 'UPLOADED') return Fail(409, 'Konten ini sudah ditandai sudah diupload');
  if (content.Status === 'SUBMITTED') return Fail(409, 'Konten sedang menunggu review admin dan belum bisa diupload');
  if (content.Status === 'REVISION') return Fail(409, 'Konten perlu direvisi dan diajukan ulang sebelum diupload');
  const link = ctx.Body.InstagramLink;
  if (!IsInstagramLink(link)) {
    return Fail(400, 'Tautan Instagram tidak valid. Gunakan tautan postingan, contoh: https://www.instagram.com/p/XXXX/');
  }
  ctx.Db
    .prepare("UPDATE Content SET Status = 'UPLOADED', InstagramLink = ?, UploadedAt = ? WHERE Id = ?")
    .run(link.trim(), ctx.Now.toISOString(), content.Id);
  LogActivity(ctx.Db, ctx.Now, ctx.User.Id, 'CONTENT_UPLOADED', `Menandai "${content.Title}" sudah diupload`);
  return Ok(ctx.Db.prepare('SELECT * FROM Content WHERE Id = ?').get(content.Id));
}

export function DeleteContent(ctx: Context): Result {
  const denied = RequireCreator(ctx);
  if (denied) return denied;
  const content = FindOwn(ctx);
  if (!content) return Fail(404, 'Konten tidak ditemukan');
  if (content.Status === 'UPLOADED') return Fail(409, 'Konten yang sudah diupload tidak dapat dihapus');
  if (content.Status === 'SUBMITTED') return Fail(409, 'Konten yang sedang direview tidak dapat dihapus');
  ctx.Db.prepare('DELETE FROM Content WHERE Id = ?').run(content.Id);
  LogActivity(ctx.Db, ctx.Now, ctx.User.Id, 'CONTENT_DELETED', `Menghapus konten "${content.Title}"`);
  return Ok({ Id: content.Id });
}

export const ContentRoutes: Route[] = [
  { Method: 'GET', Pattern: /^\/api\/contents$/, Handler: ListContents },
  { Method: 'POST', Pattern: /^\/api\/contents$/, Handler: CreateContent },
  { Method: 'POST', Pattern: /^\/api\/contents\/(?<Id>\d+)\/upload$/, Handler: UploadContent },
  { Method: 'DELETE', Pattern: /^\/api\/contents\/(?<Id>\d+)$/, Handler: DeleteContent },
];
