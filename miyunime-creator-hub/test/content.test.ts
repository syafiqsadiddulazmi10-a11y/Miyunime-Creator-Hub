import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedNow, Ids, StartTestApp } from './helpers.ts';

const Link = 'https://www.instagram.com/p/Cabc123/';
let app: Awaited<ReturnType<typeof StartTestApp>>;
before(async () => (app = await StartTestApp()));
after(() => app.Stop());

const Create = (userId: number, body: object = {}) =>
  app.Call(userId, 'POST', '/api/contents', { Title: 'Review anime', Format: 'REELS', ...body });

describe('Fitur 1: input konten pra-upload dan pasca-upload', () => {
  test('AC1: konten baru berstatus DRAFT, atau SCHEDULED jika ada jadwal, atas nama pembuatnya', async () => {
    const draft = await Create(Ids.Aiko);
    assert.equal(draft.Status, 201);
    assert.equal(draft.Body.Status, 'DRAFT');
    assert.equal(draft.Body.UserId, Ids.Aiko);
    const scheduled = await Create(Ids.Aiko, { ScheduledAt: '2026-10-20T10:00:00Z' });
    assert.equal(scheduled.Body.Status, 'SCHEDULED');
    assert.equal(scheduled.Body.ScheduledAt, '2026-10-20T10:00:00.000Z');
  });

  test('AC2: judul kosong atau format tidak valid ditolak dengan pesan Indonesia', async () => {
    const noTitle = await Create(Ids.Aiko, { Title: '   ' });
    assert.equal(noTitle.Status, 400);
    assert.match(noTitle.Body.Message, /Judul wajib diisi/);
    const badFormat = await Create(Ids.Aiko, { Format: 'TIKTOK' });
    assert.equal(badFormat.Status, 400);
    assert.match(badFormat.Body.Message, /Format harus salah satu dari/);
  });

  test('AC3: tandai UPLOADED dengan tautan valid mengisi UploadedAt dari jam server', async () => {
    const { Body } = await Create(Ids.Aiko);
    const result = await app.Call(Ids.Aiko, 'POST', `/api/contents/${Body.Id}/upload`, { InstagramLink: Link });
    assert.equal(result.Status, 200);
    assert.equal(result.Body.Status, 'UPLOADED');
    assert.equal(result.Body.InstagramLink, Link);
    assert.equal(result.Body.UploadedAt, FixedNow);
  });

  test('AC4: tautan kosong atau bukan tautan Instagram ditolak dan status tidak berubah', async () => {
    const { Body } = await Create(Ids.Aiko);
    for (const bad of [undefined, '', 'https://example.com/p/abc/', 'http://www.instagram.com/p/abc/', 'https://www.instagram.com/']) {
      const result = await app.Call(Ids.Aiko, 'POST', `/api/contents/${Body.Id}/upload`, { InstagramLink: bad });
      assert.equal(result.Status, 400, `harus ditolak: ${bad}`);
      assert.match(result.Body.Message, /Tautan Instagram tidak valid/);
    }
    const row = app.Db.prepare('SELECT Status, InstagramLink FROM Content WHERE Id = ?').get(Body.Id) as any;
    assert.equal(row.Status, 'DRAFT');
    assert.equal(row.InstagramLink, null);
  });

  test('AC5: konten UPLOADED tidak bisa ditandai ulang atau dihapus, konten belum upload bisa dihapus', async () => {
    const { Body } = await Create(Ids.Aiko);
    await app.Call(Ids.Aiko, 'POST', `/api/contents/${Body.Id}/upload`, { InstagramLink: Link });
    const again = await app.Call(Ids.Aiko, 'POST', `/api/contents/${Body.Id}/upload`, { InstagramLink: Link });
    assert.equal(again.Status, 409);
    const del = await app.Call(Ids.Aiko, 'DELETE', `/api/contents/${Body.Id}`);
    assert.equal(del.Status, 409);
    const draft = await Create(Ids.Aiko);
    assert.equal((await app.Call(Ids.Aiko, 'DELETE', `/api/contents/${draft.Body.Id}`)).Status, 200);
  });

  test('AC6: creator hanya mengakses miliknya, tanpa identitas 401, admin tidak bisa membuat', async () => {
    const { Body } = await Create(Ids.Aiko, { Title: 'Milik Aiko' });
    assert.equal((await app.Call(Ids.Raka, 'POST', `/api/contents/${Body.Id}/upload`, { InstagramLink: Link })).Status, 404);
    assert.equal((await app.Call(Ids.Raka, 'DELETE', `/api/contents/${Body.Id}`)).Status, 404);
    const rakaList = await app.Call(Ids.Raka, 'GET', '/api/contents');
    assert.ok(rakaList.Body.every((c: any) => c.UserId === Ids.Raka));
    const adminList = await app.Call(Ids.Admin, 'GET', '/api/contents');
    assert.ok(adminList.Body.some((c: any) => c.Title === 'Milik Aiko' && c.CreatorName === 'Aiko'));
    assert.equal((await app.Call(null, 'GET', '/api/contents')).Status, 401);
    assert.equal((await Create(Ids.Admin)).Status, 403);
  });
});
