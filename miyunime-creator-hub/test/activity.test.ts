import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Ids, StartTestApp } from './helpers.ts';

const Link = 'https://www.instagram.com/p/Cabc123/';
let app: Awaited<ReturnType<typeof StartTestApp>>;
before(async () => (app = await StartTestApp()));
after(() => app.Stop());

const Actions = async (userId: number) => ((await app.Call(userId, 'GET', '/api/activity')).Body as any[]).map(a => a.Action);

describe('Fitur 7: log aktivitas dan pengingat kuota', () => {
  test('AC1: setiap perubahan status konten dan kuota tercatat dengan pelaku dan waktunya', async () => {
    const created = (await app.Call(Ids.Aiko, 'POST', '/api/contents', { Title: 'Fanart', Format: 'FEED' })).Body;
    await app.Call(Ids.Aiko, 'POST', `/api/contents/${created.Id}/submit`, {});
    await app.Call(Ids.Admin, 'POST', `/api/contents/${created.Id}/review`, { Decision: 'APPROVED' });
    await app.Call(Ids.Aiko, 'POST', `/api/contents/${created.Id}/upload`, { InstagramLink: Link });
    await app.Call(Ids.Admin, 'POST', '/api/quotas', { UserId: Ids.Aiko, PeriodType: 'WEEKLY', TargetCount: 2, StartDate: '2026-11-01' });
    const actions = await Actions(Ids.Admin);
    for (const a of ['CONTENT_CREATED', 'CONTENT_SUBMITTED', 'CONTENT_APPROVED', 'CONTENT_UPLOADED', 'QUOTA_CREATED']) {
      assert.ok(actions.includes(a), `harus ada ${a}`);
    }
    const first = (await app.Call(Ids.Admin, 'GET', '/api/activity')).Body[0];
    assert.equal(first.Action, 'QUOTA_CREATED');
    assert.equal(first.UserName, 'Admin');
    assert.ok(first.CreatedAt);
  });

  test('AC2: tindakan yang ditolak tidak tercatat', async () => {
    const before = (await app.Call(Ids.Admin, 'GET', '/api/activity')).Body.length;
    await app.Call(Ids.Aiko, 'POST', '/api/contents', { Title: '', Format: 'FEED' });
    await app.Call(Ids.Aiko, 'POST', '/api/contents/9999/upload', { InstagramLink: Link });
    assert.equal((await app.Call(Ids.Admin, 'GET', '/api/activity')).Body.length, before);
  });

  test('AC3: creator hanya melihat aktivitasnya sendiri, admin melihat semuanya', async () => {
    const aiko = (await app.Call(Ids.Aiko, 'GET', '/api/activity')).Body as any[];
    assert.ok(aiko.length > 0);
    assert.ok(aiko.every(a => a.UserName === 'Aiko'));
    assert.equal((await app.Call(Ids.Raka, 'GET', '/api/activity')).Body.length, 0);
    const admin = (await app.Call(Ids.Admin, 'GET', '/api/activity')).Body as any[];
    assert.ok(new Set(admin.map(a => a.UserName)).size >= 2);
    assert.equal((await app.Call(null, 'GET', '/api/activity')).Status, 401);
  });

  test('AC4: batas jumlah baris dipatuhi dan nilai tidak valid memakai bawaan', async () => {
    assert.equal((await app.Call(Ids.Admin, 'GET', '/api/activity?Limit=2')).Body.length, 2);
    assert.ok((await app.Call(Ids.Admin, 'GET', '/api/activity?Limit=abc')).Body.length > 2);
  });

  test('AC5: pengingat creator: tenggat dekat, terlambat, dan perlu revisi', async () => {
    const near = await app.Call(Ids.Raka, 'GET', '/api/notifications');
    assert.deepEqual(near.Body.map((n: any) => n.Type), ['NO_QUOTA']);
    app.Db.prepare('INSERT INTO Quota (UserId, PeriodType, TargetCount, StartDate, EndDate) VALUES (?, ?, ?, ?, ?)')
      .run(Ids.Raka, 'MONTHLY', 3, '2026-09-18T00:00:00.000Z', '2026-10-17T23:59:59.999Z');
    const soon = await app.Call(Ids.Raka, 'GET', '/api/notifications');
    assert.equal(soon.Body[0].Type, 'QUOTA_NEAR_DEADLINE');
    assert.match(soon.Body[0].Message, /3 hari/);
    app.Db.prepare('INSERT INTO Quota (UserId, PeriodType, TargetCount, StartDate, EndDate) VALUES (?, ?, ?, ?, ?)')
      .run(Ids.Sari, 'MONTHLY', 4, '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.999Z');
    const late = await app.Call(Ids.Sari, 'GET', '/api/notifications');
    assert.equal(late.Body[0].Type, 'QUOTA_LATE');
    assert.equal(late.Body[0].Level, 'danger');
    app.Db.prepare("INSERT INTO Content (UserId, Title, Format, Status, CreatedAt) VALUES (?, 'x', 'FEED', 'REVISION', '2026-10-01T00:00:00.000Z')").run(Ids.Sari);
    const withRevision = await app.Call(Ids.Sari, 'GET', '/api/notifications');
    assert.ok(withRevision.Body.some((n: any) => n.Type === 'REVISION_PENDING'));
  });

  test('AC6: kuota yang sudah terpenuhi tidak menghasilkan pengingat tenggat', async () => {
    app.Db.prepare("INSERT INTO Content (UserId, Title, Format, Status, InstagramLink, UploadedAt, CreatedAt) VALUES (?, 'a', 'FEED', 'UPLOADED', ?, '2026-10-02T00:00:00.000Z', '2026-10-01T00:00:00.000Z')").run(Ids.Raka, Link);
    app.Db.prepare("INSERT INTO Content (UserId, Title, Format, Status, InstagramLink, UploadedAt, CreatedAt) VALUES (?, 'b', 'FEED', 'UPLOADED', ?, '2026-10-03T00:00:00.000Z', '2026-10-01T00:00:00.000Z')").run(Ids.Raka, Link);
    app.Db.prepare("INSERT INTO Content (UserId, Title, Format, Status, InstagramLink, UploadedAt, CreatedAt) VALUES (?, 'c', 'FEED', 'UPLOADED', ?, '2026-10-04T00:00:00.000Z', '2026-10-01T00:00:00.000Z')").run(Ids.Raka, Link);
    assert.deepEqual((await app.Call(Ids.Raka, 'GET', '/api/notifications')).Body, []);
  });

  test('AC7: pengingat admin merangkum review tertunda dan creator bermasalah', async () => {
    app.Db.prepare("INSERT INTO Content (UserId, Title, Format, Status, CreatedAt) VALUES (?, 'y', 'FEED', 'SUBMITTED', '2026-10-01T00:00:00.000Z')").run(Ids.Aiko);
    const { Body } = await app.Call(Ids.Admin, 'GET', '/api/notifications');
    assert.equal(Body[0].Type, 'REVIEW_PENDING');
    assert.ok(Body.some((n: any) => n.Type === 'QUOTA_LATE' && /Sari/.test(n.Message)));
    assert.equal((await app.Call(null, 'GET', '/api/notifications')).Status, 401);
  });
});
