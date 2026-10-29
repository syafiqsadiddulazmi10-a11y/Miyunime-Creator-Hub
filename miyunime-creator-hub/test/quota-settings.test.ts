import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ComputeQuotaEnd, ParseStartDate } from '../src/quota-settings.ts';
import { Ids, StartTestApp } from './helpers.ts';

const Link = 'https://www.instagram.com/p/Cabc123/';
let app: Awaited<ReturnType<typeof StartTestApp>>;
beforeEach(async () => (app = await StartTestApp()));
afterEach(() => app.Stop());

const SetQuota = (body: object = {}, userId: number | null = Ids.Admin) =>
  app.Call(userId, 'POST', '/api/quotas', { UserId: Ids.Sari, PeriodType: 'MONTHLY', TargetCount: 4, StartDate: '2026-10-01', ...body });
const QuotaCount = () => (app.Db.prepare('SELECT COUNT(*) AS N FROM Quota').get() as { N: number }).N;

describe('Fitur 3: pengaturan kuota oleh admin', () => {
  test('AC1: admin menetapkan kuota dan server menghitung akhir periode', async () => {
    const monthly = await SetQuota();
    assert.equal(monthly.Status, 201);
    assert.equal(monthly.Body.UserId, Ids.Sari);
    assert.equal(monthly.Body.TargetCount, 4);
    assert.equal(monthly.Body.StartDate, '2026-10-01T00:00:00.000Z');
    assert.equal(monthly.Body.EndDate, '2026-10-31T23:59:59.999Z');
    const weekly = await SetQuota({ UserId: Ids.Raka, PeriodType: 'WEEKLY', TargetCount: 5, StartDate: '2026-10-05' });
    assert.equal(weekly.Body.StartDate, '2026-10-05T00:00:00.000Z');
    assert.equal(weekly.Body.EndDate, '2026-10-11T23:59:59.999Z');
  });

  test('AC2: akhir periode bulanan tepat di batas bulan, tahun, dan bulan pendek', () => {
    const end = (periodType: string, day: string) => ComputeQuotaEnd(periodType, new Date(`${day}T00:00:00.000Z`)).toISOString();
    assert.equal(end('MONTHLY', '2026-10-01'), '2026-10-31T23:59:59.999Z');
    assert.equal(end('MONTHLY', '2026-12-15'), '2027-01-14T23:59:59.999Z');
    assert.equal(end('MONTHLY', '2026-01-31'), '2026-02-27T23:59:59.999Z');
    assert.equal(end('MONTHLY', '2028-01-31'), '2028-02-28T23:59:59.999Z');
    assert.equal(end('MONTHLY', '2026-03-31'), '2026-04-29T23:59:59.999Z');
    assert.equal(end('WEEKLY', '2026-12-30'), '2027-01-05T23:59:59.999Z');
    assert.equal(ParseStartDate('2026-02-30'), null);
    assert.equal(ParseStartDate('besok'), null);
    assert.equal(ParseStartDate('2026-10-05T17:00:00Z')?.toISOString(), '2026-10-05T00:00:00.000Z');
  });

  test('AC3: input tidak valid ditolak dan tidak ada kuota yang tersimpan', async () => {
    const cases: [object, number, RegExp][] = [
      [{ PeriodType: 'DAILY' }, 400, /Periode harus salah satu dari/],
      [{ TargetCount: 0 }, 400, /Target kuota harus bilangan bulat/],
      [{ TargetCount: 101 }, 400, /Target kuota harus bilangan bulat/],
      [{ TargetCount: 2.5 }, 400, /Target kuota harus bilangan bulat/],
      [{ TargetCount: '4' }, 400, /Target kuota harus bilangan bulat/],
      [{ StartDate: '2026-02-30' }, 400, /Tanggal mulai tidak valid/],
      [{ StartDate: undefined }, 400, /Tanggal mulai tidak valid/],
      [{ UserId: Ids.Admin }, 404, /Creator tidak ditemukan/],
      [{ UserId: 999 }, 404, /Creator tidak ditemukan/],
    ];
    for (const [body, status, message] of cases) {
      const result = await SetQuota(body);
      assert.equal(result.Status, status, JSON.stringify(body));
      assert.match(result.Body.Message, message);
    }
    assert.equal(QuotaCount(), 0);
  });

  test('AC4: periode yang tumpang tindih untuk creator yang sama ditolak', async () => {
    assert.equal((await SetQuota()).Status, 201);
    const inside = await SetQuota({ PeriodType: 'WEEKLY', StartDate: '2026-10-20' });
    assert.equal(inside.Status, 409);
    assert.match(inside.Body.Message, /bertabrakan/);
    assert.equal((await SetQuota({ PeriodType: 'WEEKLY', StartDate: '2026-09-28' })).Status, 409, 'periode baru menjorok masuk dari depan');
    assert.equal((await SetQuota({ PeriodType: 'WEEKLY', StartDate: '2026-09-25' })).Status, 409, 'tumpang tindih hanya di hari pertama');
    assert.equal((await SetQuota({ PeriodType: 'WEEKLY', StartDate: '2026-10-31' })).Status, 409, 'tumpang tindih hanya di hari terakhir');
    assert.equal((await SetQuota({ StartDate: '2026-11-01' })).Status, 201, 'periode berurutan tepat setelahnya boleh');
    assert.equal((await SetQuota({ StartDate: '2026-09-01' })).Status, 201, 'periode tepat sebelumnya boleh');
    assert.equal((await SetQuota({ UserId: Ids.Raka })).Status, 201, 'creator lain bebas memakai periode yang sama');
    assert.equal(QuotaCount(), 4);
  });

  test('AC5: hanya admin yang mengatur kuota, creator hanya melihat kuotanya sendiri', async () => {
    assert.equal((await SetQuota({}, Ids.Sari)).Status, 403);
    assert.equal((await SetQuota({}, null)).Status, 401);
    assert.equal(QuotaCount(), 0);
    await SetQuota();
    await SetQuota({ UserId: Ids.Raka });
    const own = await app.Call(Ids.Sari, 'GET', '/api/quotas');
    assert.deepEqual(own.Body.map((q: any) => q.UserId), [Ids.Sari]);
    const all = await app.Call(Ids.Admin, 'GET', '/api/quotas');
    assert.deepEqual(all.Body.map((q: any) => q.CreatorName).sort(), ['Raka', 'Sari']);
    assert.equal((await app.Call(null, 'GET', '/api/quotas')).Status, 401);
  });

  test('AC6: hanya kuota masa depan yang bisa dihapus, kuota berjalan menjadi dasar evaluasi', async () => {
    const running = await SetQuota({ StartDate: '2026-10-01' });
    const future = await SetQuota({ StartDate: '2026-11-01' });
    const blocked = await app.Call(Ids.Admin, 'DELETE', `/api/quotas/${running.Body.Id}`);
    assert.equal(blocked.Status, 409);
    assert.match(blocked.Body.Message, /sudah berjalan atau selesai/);
    assert.equal((await app.Call(Ids.Sari, 'DELETE', `/api/quotas/${future.Body.Id}`)).Status, 403);
    assert.equal((await app.Call(Ids.Admin, 'DELETE', `/api/quotas/${future.Body.Id}`)).Status, 200);
    assert.equal((await app.Call(Ids.Admin, 'DELETE', `/api/quotas/${future.Body.Id}`)).Status, 404);
    assert.equal(QuotaCount(), 1);
  });

  test('AC7: kuota baru langsung terbaca dashboard dan menghitung konten yang diupload (integrasi fitur 1 dan 2)', async () => {
    assert.equal((await app.Call(Ids.Sari, 'GET', '/api/dashboard/me')).Body.QuotaStatus, 'NO_QUOTA');
    await SetQuota({ TargetCount: 2 });
    const before = await app.Call(Ids.Sari, 'GET', '/api/dashboard/me');
    assert.equal(before.Body.QuotaStatus, 'IN_PROGRESS');
    assert.equal(before.Body.TargetCount, 2);
    assert.equal(before.Body.RemainingCount, 2);
    const content = await app.Call(Ids.Sari, 'POST', '/api/contents', { Title: 'Recap', Format: 'REELS' });
    await app.Call(Ids.Sari, 'POST', `/api/contents/${content.Body.Id}/upload`, { InstagramLink: Link });
    const after = await app.Call(Ids.Sari, 'GET', '/api/dashboard/me');
    assert.equal(after.Body.UploadedCount, 1);
    assert.equal(after.Body.RemainingCount, 1);
    const admin = await app.Call(Ids.Admin, 'GET', '/api/dashboard/admin');
    assert.equal(admin.Body.Summary.CreatorsWithoutQuota, 2);
  });
});
