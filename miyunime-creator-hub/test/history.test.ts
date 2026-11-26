import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Ids, StartTestApp } from './helpers.ts';

const Link = 'https://www.instagram.com/p/Cabc123/';
let app: Awaited<ReturnType<typeof StartTestApp>>;
before(async () => {
  app = await StartTestApp();
  const add = app.Db.prepare('INSERT INTO Content (UserId, Title, Format, Status, InstagramLink, UploadedAt, CreatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
  add.run(Ids.Aiko, 'Review anime A', 'REELS', 'UPLOADED', Link, '2026-09-10T10:00:00.000Z', '2026-09-01T00:00:00.000Z');
  add.run(Ids.Aiko, 'Fanart B', 'FEED', 'UPLOADED', Link, '2026-10-05T10:00:00.000Z', '2026-10-01T00:00:00.000Z');
  add.run(Ids.Aiko, 'Ide 100%_C', 'FEED', 'DRAFT', null, null, '2026-10-10T00:00:00.000Z');
  add.run(Ids.Raka, 'Punya Raka', 'REELS', 'DRAFT', null, null, '2026-10-11T00:00:00.000Z');
});
after(() => app.Stop());

const Titles = async (userId: number, query = '') => ((await app.Call(userId, 'GET', `/api/contents${query}`)).Body as any[]).map(c => c.Title);

describe('Fitur 8: riwayat konten, filter, dan tautan draft', () => {
  test('AC1: creator melihat riwayat miliknya saja, terbaru di atas', async () => {
    assert.deepEqual(await Titles(Ids.Aiko), ['Ide 100%_C', 'Fanart B', 'Review anime A']);
  });

  test('AC2: filter per periode memakai waktu upload (atau waktu dibuat jika belum upload)', async () => {
    assert.deepEqual(await Titles(Ids.Aiko, '?From=2026-10-01&To=2026-10-31'), ['Ide 100%_C', 'Fanart B']);
    assert.deepEqual(await Titles(Ids.Aiko, '?From=2026-09-01&To=2026-09-30'), ['Review anime A']);
    assert.deepEqual(await Titles(Ids.Aiko, '?To=2026-10-05'), ['Fanart B', 'Review anime A']);
  });

  test('AC3: filter status, format, dan cari judul (karakter khusus % dan _ dianggap huruf biasa)', async () => {
    assert.deepEqual(await Titles(Ids.Aiko, '?Status=UPLOADED&Format=FEED'), ['Fanart B']);
    assert.deepEqual(await Titles(Ids.Aiko, '?Q=anime'), ['Review anime A']);
    assert.deepEqual(await Titles(Ids.Aiko, '?Q=100%25_'), ['Ide 100%_C']);
    assert.deepEqual(await Titles(Ids.Aiko, '?Q=tidakada'), []);
  });

  test('AC4: filter tidak valid ditolak 400 dengan pesan Indonesia', async () => {
    for (const [query, pattern] of [
      ['?Status=BASI', /Status harus/], ['?Format=TIKTOK', /Format harus/], ['?From=kemarin', /YYYY-MM-DD/],
      ['?From=2026-02-30', /YYYY-MM-DD/], ['?From=2026-10-31&To=2026-10-01', /tidak boleh setelah/], ['?CreatorId=abc', /angka/],
    ] as const) {
      const r = await app.Call(Ids.Aiko, 'GET', `/api/contents${query}`);
      assert.equal(r.Status, 400, query);
      assert.match(r.Body.Message, pattern);
    }
  });

  test('AC5: filter creator hanya berlaku untuk admin; creator tidak bisa mengintip milik orang lain', async () => {
    assert.deepEqual(await Titles(Ids.Admin, `?CreatorId=${Ids.Raka}`), ['Punya Raka']);
    assert.equal((await Titles(Ids.Admin)).length, 4);
    assert.deepEqual(await Titles(Ids.Aiko, `?CreatorId=${Ids.Raka}`), ['Ide 100%_C', 'Fanart B', 'Review anime A']);
  });

  test('AC6: tautan aset/draft opsional, harus http(s) valid, dan ikut tersimpan', async () => {
    const ok = await app.Call(Ids.Aiko, 'POST', '/api/contents', { Title: 'Pakai draft', Format: 'FEED', LinkDraft: ' https://drive.google.com/file/d/abc ' });
    assert.equal(ok.Status, 201);
    assert.equal(ok.Body.LinkDraft, 'https://drive.google.com/file/d/abc');
    const none = await app.Call(Ids.Aiko, 'POST', '/api/contents', { Title: 'Tanpa draft', Format: 'FEED' });
    assert.equal(none.Body.LinkDraft, null);
    for (const bad of ['javascript:alert(1)', 'bukan url', 'ftp://x.id/a', 123]) {
      const r = await app.Call(Ids.Aiko, 'POST', '/api/contents', { Title: 'X', Format: 'FEED', LinkDraft: bad });
      assert.equal(r.Status, 400, String(bad));
      assert.match(r.Body.Message, /Tautan aset\/draft/);
    }
    const long = await app.Call(Ids.Aiko, 'POST', '/api/contents', { Title: 'X', Format: 'FEED', LinkDraft: `https://a.id/${'a'.repeat(500)}` });
    assert.equal(long.Status, 400);
  });

  test('AC7: tautan draft bisa diperbaiki saat revisi dan dihitung sebagai perubahan', async () => {
    const c = (await app.Call(Ids.Aiko, 'POST', '/api/contents', { Title: 'Revisi draft', Format: 'FEED' })).Body;
    await app.Call(Ids.Aiko, 'POST', `/api/contents/${c.Id}/submit`, {});
    await app.Call(Ids.Admin, 'POST', `/api/contents/${c.Id}/review`, { Decision: 'REVISION', Comment: 'Sertakan aset' });
    const same = await app.Call(Ids.Aiko, 'POST', `/api/contents/${c.Id}/submit`, {});
    assert.equal(same.Status, 400);
    const fixed = await app.Call(Ids.Aiko, 'POST', `/api/contents/${c.Id}/submit`, { LinkDraft: 'https://drive.google.com/x' });
    assert.equal(fixed.Status, 200);
    assert.equal(fixed.Body.Status, 'SUBMITTED');
    assert.equal(fixed.Body.LinkDraft, 'https://drive.google.com/x');
  });
});
