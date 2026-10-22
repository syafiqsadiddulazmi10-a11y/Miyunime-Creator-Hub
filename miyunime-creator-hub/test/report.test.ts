import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { CsvCell } from '../src/report.ts';
import { Ids, StartTestApp } from './helpers.ts';

const Link = 'https://www.instagram.com/p/Cabc123/';
const ContentHeader = ['Creator', 'Judul', 'Format', 'Status', 'Jadwal Upload', 'Tautan Instagram', 'Waktu Upload', 'Dibuat', 'Catatan Review'];
const Evil = '=HYPERLINK("http://evil.example","klik")';

/** Pembaca CSV RFC 4180 sederhana, supaya tes memeriksa hasil yang dibaca spreadsheet, bukan sekadar teks mentah. */
function ParseCsv(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  return rows;
}

function SeedFixture(db: DatabaseSync) {
  const quota = db.prepare('INSERT INTO Quota (UserId, PeriodType, TargetCount, StartDate, EndDate) VALUES (?, ?, ?, ?, ?)');
  quota.run(Ids.Aiko, 'MONTHLY', 2, '2026-10-01T00:00:00.000Z', '2026-10-31T23:59:59.999Z');
  quota.run(Ids.Raka, 'MONTHLY', 3, '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.999Z');
  const content = db.prepare(
    'INSERT INTO Content (UserId, Title, Format, Status, ScheduledAt, InstagramLink, UploadedAt, CreatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  content.run(Ids.Aiko, 'Review "anime", musim ini', 'REELS', 'UPLOADED', null, Link, '2026-10-05T10:00:00.000Z', '2026-10-01T00:00:00.000Z');
  content.run(Ids.Aiko, Evil, 'FEED', 'DRAFT', null, null, null, '2026-10-10T08:00:00.000Z');
  content.run(Ids.Raka, 'Fakta studio', 'FEED', 'UPLOADED', null, Link, '2026-09-20T10:00:00.000Z', '2026-09-15T00:00:00.000Z');
  const revision = content.run(Ids.Raka, 'Ulasan manga', 'STORY', 'REVISION', null, null, null, '2026-10-12T08:00:00.000Z');
  db.prepare("INSERT INTO ContentReview (ContentId, ReviewerId, Decision, Comment, CreatedAt) VALUES (?, ?, 'REVISION', ?, ?)")
    .run(Number(revision.lastInsertRowid), Ids.Admin, 'Tambah sumber', '2026-10-13T08:00:00.000Z');
  content.run(Ids.Sari, 'Daftar tonton', 'CAROUSEL', 'SCHEDULED', '2026-10-20T10:00:00.000Z', null, null, '2026-10-14T08:00:00.000Z');
}

let app: Awaited<ReturnType<typeof StartTestApp>>;
beforeEach(async () => {
  app = await StartTestApp();
  SeedFixture(app.Db);
});
afterEach(() => app.Stop());

const ContentCsv = async (query = '', userId: number | null = Ids.Admin) => {
  const result = await app.CallRaw(userId, `/api/reports/contents.csv${query}`);
  return { ...result, Rows: result.Status === 200 ? ParseCsv(result.Text) : [] };
};
const Titles = (rows: string[][]) => rows.slice(1).map(r => r[1]);

describe('Fitur 5: ekspor laporan CSV', () => {
  test('AC1: admin mengunduh laporan konten sebagai CSV yang bisa dibuka Excel', async () => {
    const { Status, Text, Bytes, Headers, Rows } = await ContentCsv();
    assert.equal(Status, 200);
    assert.match(Headers.get('content-type') ?? '', /^text\/csv; charset=utf-8/);
    assert.equal(Headers.get('content-disposition'), 'attachment; filename="miyunime-laporan-konten-2026-10-15.csv"');
    assert.deepEqual([...Bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'BOM UTF-8 agar Excel membaca huruf non-ASCII dengan benar');
    assert.ok(Text.includes('\r\n') && Text.endsWith('\r\n'));
    assert.deepEqual(Rows[0], ContentHeader);
    assert.equal(Rows.length, 6, 'header + 5 konten');
    const aiko = Rows.find(r => r[1].startsWith('Review'))!;
    assert.deepEqual(aiko.slice(0, 4), ['Aiko', 'Review "anime", musim ini', 'Reels', 'Sudah diupload']);
    assert.equal(aiko[5], Link);
    assert.equal(aiko[6], '2026-10-05T10:00:00.000Z');
    assert.equal(Rows.find(r => r[1] === 'Ulasan manga')![8], 'Tambah sumber', 'catatan review ikut dilaporkan');
  });

  test('AC2: filter creator, status, format, tanggal, dan pencarian judul, termasuk gabungannya', async () => {
    assert.equal((await ContentCsv(`?CreatorId=${Ids.Aiko}`)).Rows.length, 3);
    assert.deepEqual(Titles((await ContentCsv('?Status=UPLOADED')).Rows).sort(), ['Fakta studio', 'Review "anime", musim ini']);
    assert.deepEqual(Titles((await ContentCsv('?Format=STORY')).Rows), ['Ulasan manga']);
    assert.deepEqual(Titles((await ContentCsv('?To=2026-09-30')).Rows), ['Fakta studio']);
    assert.deepEqual(Titles((await ContentCsv('?From=2026-10-01&To=2026-10-05')).Rows), ['Review "anime", musim ini'], 'tanggal akhir inklusif sampai 23:59');
    assert.deepEqual(Titles((await ContentCsv('?Q=ANIME')).Rows), ['Review "anime", musim ini'], 'pencarian tidak peka huruf besar');
    assert.equal((await ContentCsv('?Q=%25')).Rows.length, 1, 'karakter % dicari apa adanya, bukan wildcard');
    assert.deepEqual(Titles((await ContentCsv(`?CreatorId=${Ids.Raka}&Status=UPLOADED&From=2026-09-01`)).Rows), ['Fakta studio']);
    assert.equal((await ContentCsv('?Status=SCHEDULED&Format=FEED')).Rows.length, 1, 'tanpa hasil tetap menghasilkan header saja');
  });

  test('AC3: filter yang tidak valid ditolak 400 dengan pesan Indonesia', async () => {
    const cases: [string, RegExp][] = [
      ['?Status=FOO', /Status harus salah satu dari/],
      ['?Format=TIKTOK', /Format harus salah satu dari/],
      ['?CreatorId=abc', /CreatorId harus berupa angka/],
      ['?From=2026-13-01', /Tanggal harus berformat/],
      ['?To=kemarin', /Tanggal harus berformat/],
      ['?From=2026-10-10&To=2026-10-01', /tidak boleh setelah/],
    ];
    for (const [query, message] of cases) {
      const result = await app.CallRaw(Ids.Admin, `/api/reports/contents.csv${query}`);
      assert.equal(result.Status, 400, query);
      assert.match(JSON.parse(result.Text).Message, message);
    }
  });

  test('AC4: sel CSV dikutip benar dan rumus spreadsheet dinetralkan (CSV injection)', async () => {
    assert.equal(CsvCell('biasa'), 'biasa');
    assert.equal(CsvCell('a,b'), '"a,b"');
    assert.equal(CsvCell('kata "kutip"'), '"kata ""kutip"""');
    assert.equal(CsvCell('baris1\nbaris2'), '"baris1\nbaris2"');
    assert.equal(CsvCell(null), '');
    assert.equal(CsvCell(undefined), '');
    assert.equal(CsvCell(7), '7');
    assert.equal(CsvCell(-5), '-5', 'angka negatif bukan rumus');
    for (const formula of ['=1+1', '+62812', '-cmd', '@SUM(A1)', '\tTAB']) assert.equal(CsvCell(formula), `'${formula}`);

    const { Rows } = await ContentCsv();
    const evil = Rows.find(r => r[0] === 'Aiko' && r[3] === 'Draft')!;
    assert.equal(evil[1], `'${Evil}`, 'judul berisi rumus diberi apostrof dan tetap utuh saat dibaca ulang');
    assert.equal(Rows.find(r => r[1].startsWith('Review'))![1], 'Review "anime", musim ini', 'koma dan kutip bolak-balik utuh');
  });

  test('AC5: laporan kuota memuat angka yang sama dengan dashboard admin', async () => {
    const dashboard = (await app.Call(Ids.Admin, 'GET', '/api/dashboard/admin')).Body;
    const result = await app.CallRaw(Ids.Admin, '/api/reports/quota.csv');
    assert.equal(result.Status, 200);
    assert.equal(result.Headers.get('content-disposition'), 'attachment; filename="miyunime-laporan-kuota-2026-10-15.csv"');
    const rows = ParseCsv(result.Text);
    assert.deepEqual(rows[0], ['Creator', 'Username Instagram', 'Periode', 'Mulai', 'Selesai', 'Target', 'Terupload', 'Sisa', 'Status Kuota']);
    assert.equal(rows.length - 1, dashboard.Creators.length);
    const label: Record<string, string> = { FULFILLED: 'Terpenuhi', IN_PROGRESS: 'Dalam progres', LATE: 'Terlambat', NO_QUOTA: 'Belum ada kuota' };
    dashboard.Creators.forEach((c: any, i: number) => {
      assert.deepEqual(
        rows[i + 1].filter((_, col) => [0, 5, 6, 7, 8].includes(col)),
        [c.Name, String(c.TargetCount), String(c.UploadedCount), String(c.RemainingCount), label[c.QuotaStatus]],
        `baris ${c.Name} mengikuti urutan dan angka dashboard`,
      );
    });
    assert.deepEqual(rows.slice(1).map(r => r[8]), ['Terlambat', 'Dalam progres', 'Belum ada kuota']);
    const sari = rows.find(r => r[0] === 'Sari')!;
    assert.deepEqual([sari[2], sari[3], sari[4]], ['', '', ''], 'creator tanpa kuota tetap muncul dengan periode kosong');
    assert.equal(rows.find(r => r[0] === 'Aiko')![2], 'Bulanan');
    assert.deepEqual(rows.slice(1).map(r => r[1]).sort(), ['aiko', 'raka', 'sari'], 'username tanpa @ dan tanpa apostrof penetral rumus');
  });

  test('AC6: laporan hanya untuk admin', async () => {
    for (const path of ['contents.csv', 'quota.csv']) {
      const asCreator = await app.CallRaw(Ids.Aiko, `/api/reports/${path}`);
      assert.equal(asCreator.Status, 403);
      assert.ok(!asCreator.Text.includes('Review'), 'isi laporan tidak bocor ke creator');
      assert.equal((await app.CallRaw(null, `/api/reports/${path}`)).Status, 401);
    }
  });
});
