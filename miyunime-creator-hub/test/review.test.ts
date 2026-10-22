import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedNow, Ids, StartTestApp } from './helpers.ts';

const Link = 'https://www.instagram.com/p/Cabc123/';
let app: Awaited<ReturnType<typeof StartTestApp>>;
beforeEach(async () => (app = await StartTestApp()));
afterEach(() => app.Stop());

const NewContent = async (userId = Ids.Aiko, body: object = {}) =>
  (await app.Call(userId, 'POST', '/api/contents', { Title: 'Review anime', Format: 'REELS', ...body })).Body;
const Submit = (userId: number | null, id: number, body?: object) => app.Call(userId, 'POST', `/api/contents/${id}/submit`, body ?? {});
const Review = (userId: number | null, id: number, body: object) => app.Call(userId, 'POST', `/api/contents/${id}/review`, body);
const Upload = (userId: number, id: number) => app.Call(userId, 'POST', `/api/contents/${id}/upload`, { InstagramLink: Link });
const StatusOf = (id: number) => (app.Db.prepare('SELECT Status FROM Content WHERE Id = ?').get(id) as { Status: string }).Status;
const Submitted = async () => {
  const content = await NewContent();
  await Submit(Ids.Aiko, content.Id);
  return content;
};

describe('Fitur 4: review dan persetujuan konten', () => {
  test('AC1: creator mengajukan konten miliknya, DRAFT maupun SCHEDULED menjadi SUBMITTED', async () => {
    const draft = await NewContent();
    const result = await Submit(Ids.Aiko, draft.Id);
    assert.equal(result.Status, 200);
    assert.equal(result.Body.Status, 'SUBMITTED');
    const scheduled = await NewContent(Ids.Aiko, { ScheduledAt: '2026-10-20T10:00:00Z' });
    const second = await Submit(Ids.Aiko, scheduled.Id);
    assert.equal(second.Body.Status, 'SUBMITTED');
    assert.equal(second.Body.ScheduledAt, '2026-10-20T10:00:00.000Z', 'jadwal tidak hilang saat diajukan');
    const other = await NewContent();
    assert.equal((await Submit(Ids.Raka, other.Id)).Status, 404);
    assert.equal((await Submit(Ids.Admin, other.Id)).Status, 403);
    assert.equal((await Submit(null, other.Id)).Status, 401);
    assert.equal(StatusOf(other.Id), 'DRAFT');
  });

  test('AC2: konten yang menunggu review terkunci: tidak bisa diupload, dihapus, atau diajukan lagi', async () => {
    const content = await Submitted();
    const upload = await Upload(Ids.Aiko, content.Id);
    assert.equal(upload.Status, 409);
    assert.match(upload.Body.Message, /menunggu review/);
    assert.equal((await app.Call(Ids.Aiko, 'DELETE', `/api/contents/${content.Id}`)).Status, 409);
    assert.equal((await Submit(Ids.Aiko, content.Id)).Status, 409);
    assert.equal(StatusOf(content.Id), 'SUBMITTED');
  });

  test('AC3: admin menyetujui, lalu creator bisa menandai upload dan konten tidak perlu diajukan lagi', async () => {
    const content = await Submitted();
    const approved = await Review(Ids.Admin, content.Id, { Decision: 'APPROVED' });
    assert.equal(approved.Status, 200);
    assert.equal(approved.Body.Status, 'APPROVED');
    assert.equal((await Submit(Ids.Aiko, content.Id)).Status, 409);
    const uploaded = await Upload(Ids.Aiko, content.Id);
    assert.equal(uploaded.Status, 200);
    assert.equal(uploaded.Body.Status, 'UPLOADED');
    assert.equal(uploaded.Body.UploadedAt, FixedNow);
  });

  test('AC4: siklus revisi: catatan wajib, creator memperbaiki lalu mengajukan ulang hingga disetujui', async () => {
    const content = await Submitted();
    const noComment = await Review(Ids.Admin, content.Id, { Decision: 'REVISION', Comment: '   ' });
    assert.equal(noComment.Status, 400);
    assert.match(noComment.Body.Message, /Catatan revisi wajib diisi/);
    assert.equal(StatusOf(content.Id), 'SUBMITTED');

    assert.equal((await Review(Ids.Admin, content.Id, { Decision: 'REVISION', Comment: 'Judul kurang jelas' })).Body.Status, 'REVISION');
    const list = await app.Call(Ids.Aiko, 'GET', '/api/contents');
    assert.equal(list.Body.find((c: any) => c.Id === content.Id).ReviewComment, 'Judul kurang jelas');

    const blocked = await Upload(Ids.Aiko, content.Id);
    assert.equal(blocked.Status, 409);
    assert.match(blocked.Body.Message, /direvisi/);
    const unchanged = await Submit(Ids.Aiko, content.Id);
    assert.equal(unchanged.Status, 400);
    assert.match(unchanged.Body.Message, /Perbaiki konten/);
    assert.equal(StatusOf(content.Id), 'REVISION');

    const fixed = await Submit(Ids.Aiko, content.Id, { Title: 'Rekomendasi anime musim gugur' });
    assert.equal(fixed.Status, 200);
    assert.equal(fixed.Body.Status, 'SUBMITTED');
    assert.equal(fixed.Body.Title, 'Rekomendasi anime musim gugur');
    assert.equal((await Submit(Ids.Aiko, content.Id, { Title: '' })).Status, 409, 'sudah SUBMITTED lagi, tidak bisa diajukan ganda');
    assert.equal((await Review(Ids.Admin, content.Id, { Decision: 'APPROVED' })).Body.Status, 'APPROVED');
  });

  test('AC5: aturan keputusan review: hanya admin, hanya konten SUBMITTED, keputusan dan catatan valid', async () => {
    const content = await Submitted();
    assert.equal((await Review(Ids.Aiko, content.Id, { Decision: 'APPROVED' })).Status, 403, 'creator tidak boleh menyetujui kontennya sendiri');
    assert.equal((await Review(null, content.Id, { Decision: 'APPROVED' })).Status, 401);
    assert.equal((await Review(Ids.Admin, content.Id, { Decision: 'PUBLISHED' })).Status, 400);
    assert.equal((await Review(Ids.Admin, content.Id, { Decision: 'REVISION', Comment: 'x'.repeat(1001) })).Status, 400);
    assert.equal((await Review(Ids.Admin, 999, { Decision: 'APPROVED' })).Status, 404);
    assert.equal(StatusOf(content.Id), 'SUBMITTED');

    const draft = await NewContent();
    const notSubmitted = await Review(Ids.Admin, draft.Id, { Decision: 'APPROVED' });
    assert.equal(notSubmitted.Status, 409);
    assert.match(notSubmitted.Body.Message, /berstatus diajukan/);

    await Review(Ids.Admin, content.Id, { Decision: 'APPROVED' });
    assert.equal((await Review(Ids.Admin, content.Id, { Decision: 'REVISION', Comment: 'Ubah pikiran' })).Status, 409, 'keputusan final, tidak bisa dibalik');
    assert.equal(StatusOf(content.Id), 'APPROVED');
  });

  test('AC6: riwayat review tercatat berurutan, dilihat pemilik dan admin saja', async () => {
    const content = await Submitted();
    await Review(Ids.Admin, content.Id, { Decision: 'REVISION', Comment: 'Tambahkan hashtag' });
    await Submit(Ids.Aiko, content.Id, { Caption: 'Caption baru #anime' });
    await Review(Ids.Admin, content.Id, { Decision: 'APPROVED', Comment: 'Sudah bagus' });
    const history = await app.Call(Ids.Aiko, 'GET', `/api/contents/${content.Id}/reviews`);
    assert.equal(history.Status, 200);
    assert.deepEqual(history.Body.map((r: any) => [r.Decision, r.Comment, r.ReviewerName]), [
      ['REVISION', 'Tambahkan hashtag', 'Admin'],
      ['APPROVED', 'Sudah bagus', 'Admin'],
    ]);
    assert.equal(history.Body[0].CreatedAt, FixedNow);
    assert.equal((await app.Call(Ids.Admin, 'GET', `/api/contents/${content.Id}/reviews`)).Body.length, 2);
    assert.equal((await app.Call(Ids.Raka, 'GET', `/api/contents/${content.Id}/reviews`)).Status, 404);
    assert.equal((await app.Call(null, 'GET', `/api/contents/${content.Id}/reviews`)).Status, 401);
  });

  test('AC7: review bersifat opsional dan kuota tetap hanya menghitung konten UPLOADED (integrasi fitur 1 dan 2)', async () => {
    app.Db.prepare("INSERT INTO Quota (UserId, PeriodType, TargetCount, StartDate, EndDate) VALUES (?, 'MONTHLY', 2, ?, ?)")
      .run(Ids.Aiko, '2026-10-01T00:00:00.000Z', '2026-10-31T23:59:59.999Z');
    const Uploaded = async () => (await app.Call(Ids.Aiko, 'GET', '/api/dashboard/me')).Body.UploadedCount;

    const approved = await Submitted();
    await Review(Ids.Admin, approved.Id, { Decision: 'APPROVED' });
    await Submit(Ids.Aiko, (await NewContent()).Id);
    assert.equal(await Uploaded(), 0, 'disetujui atau diajukan belum dihitung');

    assert.equal((await Upload(Ids.Aiko, approved.Id)).Status, 200);
    assert.equal(await Uploaded(), 1);

    const direct = await NewContent();
    assert.equal((await Upload(Ids.Aiko, direct.Id)).Status, 200, 'DRAFT tanpa review tetap bisa langsung diupload');
    assert.equal(await Uploaded(), 2);
  });
});
