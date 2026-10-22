import { Fail, Ok, type Context, type Result, type Route } from './http.ts';

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

export type ContentInput = { Title: string; Caption: string | null; Format: string; ScheduledAt: string | null };

/** Validasi satu-satunya untuk Title, Format, Caption, dan ScheduledAt. Dipakai saat membuat dan saat mengajukan ulang. */
export function ParseContentInput(body: Record<string, unknown>): { Input: ContentInput } | { Error: Result } {
  const { Title, Caption, Format, ScheduledAt } = body;
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
  return {
    Input: {
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
  const { Title, Caption, Format, ScheduledAt } = parsed.Input;
  const info = ctx.Db
    .prepare('INSERT INTO Content (UserId, Title, Caption, Format, Status, ScheduledAt, CreatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(ctx.User.Id, Title, Caption, Format, ScheduledAt ? 'SCHEDULED' : 'DRAFT', ScheduledAt, ctx.Now.toISOString());
  return Ok(ctx.Db.prepare('SELECT * FROM Content WHERE Id = ?').get(Number(info.lastInsertRowid)), 201);
}

export function ListContents(ctx: Context): Result {
  const isAdmin = ctx.User.Role === 'ADMIN';
  const rows = ctx.Db
    .prepare(
      `SELECT c.*, u.Name AS CreatorName,
              (SELECT r.Comment FROM ContentReview r WHERE r.ContentId = c.Id ORDER BY r.Id DESC LIMIT 1) AS ReviewComment
       FROM Content c JOIN User u ON u.Id = c.UserId
       WHERE (? = 1 OR c.UserId = ?) AND (? IS NULL OR c.Status = ?)
       ORDER BY c.CreatedAt DESC, c.Id DESC`,
    )
    .all(isAdmin ? 1 : 0, ctx.User.Id, ctx.Query.get('Status'), ctx.Query.get('Status'));
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
  return Ok({ Id: content.Id });
}

export const ContentRoutes: Route[] = [
  { Method: 'GET', Pattern: /^\/api\/contents$/, Handler: ListContents },
  { Method: 'POST', Pattern: /^\/api\/contents$/, Handler: CreateContent },
  { Method: 'POST', Pattern: /^\/api\/contents\/(?<Id>\d+)\/upload$/, Handler: UploadContent },
  { Method: 'DELETE', Pattern: /^\/api\/contents\/(?<Id>\d+)$/, Handler: DeleteContent },
];
