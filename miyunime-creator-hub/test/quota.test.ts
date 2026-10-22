import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { ComputeQuotaStatus } from '../src/quota.ts';
import { FixedNow, Ids, StartTestApp } from './helpers.ts';

const Link = 'https://www.instagram.com/p/Cabc123/';
const October = ['2026-10-01T00:00:00.000Z', '2026-10-31T23:59:59.999Z'];
const September = ['2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.999Z'];

function SeedFixture(db: DatabaseSync) {
  const quota = db.prepare('INSERT INTO Quota (UserId, PeriodType, TargetCount, StartDate, EndDate) VALUES (?, ?, ?, ?, ?)');
  quota.run(Ids.Aiko, 'MONTHLY', 2, October[0], October[1]);
  quota.run(Ids.Raka, 'MONTHLY', 3, September[0], September[1]);
  const content = db.prepare(
    'INSERT INTO Content (UserId, Title, Format, Status, InstagramLink, UploadedAt, CreatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const created = '2026-09-01T00:00:00.000Z';
  content.run(Ids.Aiko, 'Terhitung', 'REELS', 'UPLOADED', Link, '2026-10-05T10:00:00.000Z', created);
  content.run(Ids.Aiko, 'Masih draft', 'FEED', 'DRAFT', null, null, created);
  content.run(Ids.Aiko, 'Masih terjadwal', 'FEED', 'SCHEDULED', null, null, created);
  content.run(Ids.Aiko, 'Upload bulan lalu', 'FEED', 'UPLOADED', Link, '2026-09-28T10:00:00.000Z', created);
  content.run(Ids.Aiko, 'Upload tanpa tautan', 'FEED', 'UPLOADED', null, '2026-10-06T10:00:00.000Z', created);
  content.run(Ids.Raka, 'Upload September', 'REELS', 'UPLOADED', Link, '2026-09-10T10:00:00.000Z', created);
}

let app: Awaited<ReturnType<typeof StartTestApp>>;
beforeEach(async () => {
  app = await StartTestApp();
  SeedFixture(app.Db);
});
afterEach(() => app.Stop());

const Admin = () => app.Call(Ids.Admin, 'GET', '/api/dashboard/admin');
const Me = (userId: number) => app.Call(userId, 'GET', '/api/dashboard/me');
const Row = (body: any, name: string) => body.Creators.find((c: any) => c.Name === name);

describe('Fitur 2: dashboard kuota', () => {
  test('AC1: dashboard admin memuat target, terupload, sisa, status, dan periode tiap creator', async () => {
    const { Status, Body } = await Admin();
    assert.equal(Status, 200);
    assert.equal(Body.Creators.length, 3);
    assert.deepEqual(
      (({ TargetCount, UploadedCount, RemainingCount, QuotaStatus, StartDate, EndDate }) =>
        ({ TargetCount, UploadedCount, RemainingCount, QuotaStatus, StartDate, EndDate }))(Row(Body, 'Aiko')),
      { TargetCount: 2, UploadedCount: 1, RemainingCount: 1, QuotaStatus: 'IN_PROGRESS', StartDate: October[0], EndDate: October[1] },
    );
  });

  test('AC2: aturan status FULFILLED, LATE, IN_PROGRESS, dan NO_QUOTA', async () => {
    const now = new Date(FixedNow);
    assert.equal(ComputeQuotaStatus(2, 2, October[1], now), 'FULFILLED');
    assert.equal(ComputeQuotaStatus(5, 2, October[1], now), 'FULFILLED');
    assert.equal(ComputeQuotaStatus(3, 3, September[1], now), 'FULFILLED');
    assert.equal(ComputeQuotaStatus(1, 3, September[1], now), 'LATE');
    assert.equal(ComputeQuotaStatus(1, 2, October[1], now), 'IN_PROGRESS');
    assert.equal(ComputeQuotaStatus(0, 2, October[1], now), 'IN_PROGRESS');
    const sari = await Me(Ids.Sari);
    assert.equal(sari.Body.QuotaStatus, 'NO_QUOTA');
    assert.equal(sari.Body.TargetCount, 0);
  });

  test('AC3: hanya konten UPLOADED bertautan di dalam periode yang dihitung', async () => {
    const { Body } = await Me(Ids.Aiko);
    assert.equal(Body.UploadedCount, 1);
    assert.equal(Body.RemainingCount, 1);
  });

  test('AC4: ringkasan admin benar dan creator terlambat diurutkan paling atas', async () => {
    const { Body } = await Admin();
    assert.deepEqual(Body.Summary, {
      TotalCreators: 3, CreatorsFulfilled: 0, CreatorsInProgress: 1, CreatorsLate: 1,
      CreatorsWithoutQuota: 1, TotalContentUploadedThisPeriod: 2,
    });
    assert.deepEqual(Body.Creators.map((c: any) => c.Name), ['Raka', 'Aiko', 'Sari']);
  });

  test('AC5: progres creator naik setelah menandai konten diupload (integrasi fitur 1)', async () => {
    const created = await app.Call(Ids.Aiko, 'POST', '/api/contents', { Title: 'Konten baru', Format: 'REELS' });
    const before = await Me(Ids.Aiko);
    assert.equal(before.Body.UploadedCount, 1);
    await app.Call(Ids.Aiko, 'POST', `/api/contents/${created.Body.Id}/upload`, { InstagramLink: Link });
    const after = await Me(Ids.Aiko);
    assert.equal(after.Body.UploadedCount, 2);
    assert.equal(after.Body.RemainingCount, 0);
    assert.equal(after.Body.QuotaStatus, 'FULFILLED');
    const admin = await Admin();
    assert.equal(admin.Body.Summary.CreatorsFulfilled, 1);
    assert.equal(admin.Body.Creators.at(-1).Name, 'Aiko');
  });

  test('AC6: akses dashboard dibatasi sesuai peran', async () => {
    assert.equal((await app.Call(Ids.Aiko, 'GET', '/api/dashboard/admin')).Status, 403);
    assert.equal((await app.Call(Ids.Admin, 'GET', '/api/dashboard/me')).Status, 403);
    assert.equal((await app.Call(null, 'GET', '/api/dashboard/admin')).Status, 401);
    assert.equal((await app.Call(null, 'GET', '/api/dashboard/me')).Status, 401);
  });

  test('AC7: kuota berjalan dipakai ketimbang kuota lama', async () => {
    app.Db.prepare('INSERT INTO Quota (UserId, PeriodType, TargetCount, StartDate, EndDate) VALUES (?, ?, ?, ?, ?)')
      .run(Ids.Raka, 'MONTHLY', 3, October[0], October[1]);
    const { Body } = await Me(Ids.Raka);
    assert.equal(Body.StartDate, October[0]);
    assert.equal(Body.UploadedCount, 0);
    assert.equal(Body.QuotaStatus, 'IN_PROGRESS');
  });
});
