import type { Context, Result, Route } from './http.ts';
import { Fail, Ok } from './http.ts';
import { FindOwn, ParseContentInput, RequireCreator, type ContentRow } from './content.ts';

const Decisions = ['APPROVED', 'REVISION'];
const EditableFields = ['Title', 'Caption', 'Format', 'ScheduledAt'] as const;

/** Konten yang boleh diajukan: belum pernah diajukan (DRAFT, SCHEDULED) atau dikembalikan admin (REVISION). */
const Submittable = ['DRAFT', 'SCHEDULED', 'REVISION'];

const SubmitBlockers: Record<string, string> = {
  SUBMITTED: 'Konten ini sudah diajukan dan menunggu review admin',
  APPROVED: 'Konten ini sudah disetujui, tinggal tandai sudah diupload',
  UPLOADED: 'Konten yang sudah diupload tidak perlu diajukan',
};

function Changed(before: ContentRow, after: Record<string, unknown>): boolean {
  return EditableFields.some(field => (before[field] ?? null) !== (after[field] ?? null));
}

export function SubmitContent(ctx: Context): Result {
  const denied = RequireCreator(ctx);
  if (denied) return denied;
  const content = FindOwn(ctx);
  if (!content) return Fail(404, 'Konten tidak ditemukan');
  if (!Submittable.includes(content.Status)) return Fail(409, SubmitBlockers[content.Status] ?? 'Konten tidak dapat diajukan');

  // Field yang tidak dikirim tetap memakai nilai lama. ScheduledAt: null berarti jadwal dihapus.
  const merged = Object.fromEntries(EditableFields.map(f => [f, f in ctx.Body ? ctx.Body[f] : content[f]]));
  const parsed = ParseContentInput(merged);
  if ('Error' in parsed) return parsed.Error;
  if (content.Status === 'REVISION' && !Changed(content, parsed.Input)) {
    return Fail(400, 'Perbaiki konten sesuai catatan review sebelum mengajukan ulang');
  }
  const { Title, Caption, Format, ScheduledAt } = parsed.Input;
  ctx.Db
    .prepare("UPDATE Content SET Title = ?, Caption = ?, Format = ?, ScheduledAt = ?, Status = 'SUBMITTED' WHERE Id = ?")
    .run(Title, Caption, Format, ScheduledAt, content.Id);
  return Ok(ctx.Db.prepare('SELECT * FROM Content WHERE Id = ?').get(content.Id));
}

export function ReviewContent(ctx: Context): Result {
  if (ctx.User.Role !== 'ADMIN') return Fail(403, 'Hanya admin yang dapat mereview konten');
  const content = ctx.Db.prepare('SELECT * FROM Content WHERE Id = ?').get(Number(ctx.Params.Id)) as ContentRow | undefined;
  if (!content) return Fail(404, 'Konten tidak ditemukan');

  const { Decision, Comment } = ctx.Body;
  if (typeof Decision !== 'string' || !Decisions.includes(Decision)) return Fail(400, `Keputusan harus salah satu dari ${Decisions.join(', ')}`);
  const comment = typeof Comment === 'string' ? Comment.trim() : '';
  if (comment.length > 1000) return Fail(400, 'Catatan review maksimal 1000 karakter');
  if (Decision === 'REVISION' && !comment) return Fail(400, 'Catatan revisi wajib diisi agar creator tahu apa yang perlu diperbaiki');
  if (content.Status !== 'SUBMITTED') return Fail(409, 'Hanya konten berstatus diajukan yang dapat direview');

  ctx.Db.exec('BEGIN');
  try {
    ctx.Db.prepare('UPDATE Content SET Status = ? WHERE Id = ?').run(Decision, content.Id);
    ctx.Db
      .prepare('INSERT INTO ContentReview (ContentId, ReviewerId, Decision, Comment, CreatedAt) VALUES (?, ?, ?, ?, ?)')
      .run(content.Id, ctx.User.Id, Decision, comment || null, ctx.Now.toISOString());
    ctx.Db.exec('COMMIT');
  } catch (error) {
    ctx.Db.exec('ROLLBACK');
    throw error;
  }
  return Ok(ctx.Db.prepare('SELECT * FROM Content WHERE Id = ?').get(content.Id));
}

export function ListReviews(ctx: Context): Result {
  const id = Number(ctx.Params.Id);
  const visible = ctx.Db
    .prepare('SELECT Id FROM Content WHERE Id = ? AND (? = 1 OR UserId = ?)')
    .get(id, ctx.User.Role === 'ADMIN' ? 1 : 0, ctx.User.Id);
  if (!visible) return Fail(404, 'Konten tidak ditemukan');
  return Ok(
    ctx.Db
      .prepare(
        `SELECT r.Id, r.ContentId, r.Decision, r.Comment, r.CreatedAt, u.Name AS ReviewerName
         FROM ContentReview r JOIN User u ON u.Id = r.ReviewerId WHERE r.ContentId = ? ORDER BY r.Id`,
      )
      .all(id),
  );
}

export const ReviewRoutes: Route[] = [
  { Method: 'POST', Pattern: /^\/api\/contents\/(?<Id>\d+)\/submit$/, Handler: SubmitContent },
  { Method: 'POST', Pattern: /^\/api\/contents\/(?<Id>\d+)\/review$/, Handler: ReviewContent },
  { Method: 'GET', Pattern: /^\/api\/contents\/(?<Id>\d+)\/reviews$/, Handler: ListReviews },
];
