import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { IsInstagramLink, ParseContentInput } from '../src/content.ts';
import { ComputeQuotaStatus } from '../src/quota.ts';

describe('Aturan bisnis murni (unit): tautan, kuota, dan validasi konten', () => {
  test('IsInstagramLink hanya menerima tautan postingan https di instagram.com', () => {
    const valid = [
      'https://www.instagram.com/p/Cabc123/',
      'https://instagram.com/reel/C-x_9/',
      'https://www.instagram.com/reels/Cabc123',
      'https://www.instagram.com/tv/Cabc123/',
      'https://www.instagram.com/stories/miyunime.id/3012345678901/',
      '  https://www.instagram.com/p/Cabc123/  ',
      'https://www.instagram.com/p/Cabc123/?igsh=abc',
    ];
    for (const link of valid) assert.equal(IsInstagramLink(link), true, link);
    const invalid = [
      '', 'https://www.instagram.com/', 'https://www.instagram.com/miyunime/',
      'http://www.instagram.com/p/Cabc123/',
      'https://example.com/p/Cabc123/',
      'https://instagram.com.evil.example/p/Cabc123/',
      'https://notinstagram.com/p/Cabc123/',
      'https://evil.example/https://www.instagram.com/p/Cabc123/',
      'https://www.instagram.com/stories/miyunime.id/bukan-angka/',
      'instagram.com/p/Cabc123', 'bukan url', null, undefined, 42,
    ];
    for (const link of invalid) assert.equal(IsInstagramLink(link), false, String(link));
  });

  test('ComputeQuotaStatus: tepat di batas akhir periode masih IN_PROGRESS, 1 milidetik setelahnya LATE', () => {
    const end = '2026-10-31T23:59:59.999Z';
    assert.equal(ComputeQuotaStatus(1, 2, end, new Date('2026-10-31T23:59:59.999Z')), 'IN_PROGRESS');
    assert.equal(ComputeQuotaStatus(1, 2, end, new Date('2026-11-01T00:00:00.000Z')), 'LATE');
    assert.equal(ComputeQuotaStatus(2, 2, end, new Date('2026-11-30T00:00:00.000Z')), 'FULFILLED', 'target tercapai tidak pernah terlambat');
    assert.equal(ComputeQuotaStatus(0, 1, end, new Date('2026-10-01T00:00:00.000Z')), 'IN_PROGRESS');
  });

  test('ParseContentInput: batas panjang judul dan caption, serta jadwal dinormalkan ke UTC', () => {
    const base = { Title: 'Judul', Format: 'FEED' };
    const error = (body: object) => ('Error' in ParseContentInput(body) ? (ParseContentInput(body) as any).Error.Status : null);
    assert.equal(error({ ...base, Title: 'a'.repeat(120) }), null);
    assert.equal(error({ ...base, Title: 'a'.repeat(121) }), 400);
    assert.equal(error({ ...base, Caption: 'c'.repeat(2200) }), null);
    assert.equal(error({ ...base, Caption: 'c'.repeat(2201) }), 400);
    assert.equal(error({ ...base, Caption: 123 }), 400);
    assert.equal(error({ ...base, ScheduledAt: 'bukan tanggal' }), 400);
    assert.equal(error({ ...base, Format: 'feed' }), 400, 'format peka huruf besar');
    const ok = ParseContentInput({ ...base, Title: '  Judul  ', ScheduledAt: '2026-10-20T17:00:00+07:00' }) as any;
    assert.equal(ok.Input.Title, 'Judul');
    assert.equal(ok.Input.ScheduledAt, '2026-10-20T10:00:00.000Z');
    assert.equal(ok.Input.Caption, null);
  });
});
