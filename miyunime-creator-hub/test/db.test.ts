import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MigrateContentStatus, OpenDatabase } from '../src/db.ts';

/** Skema fitur 1 dan 2: Status hanya DRAFT, SCHEDULED, UPLOADED dan belum ada tabel ContentReview. */
const OldSchema = `
  CREATE TABLE User (Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Role TEXT NOT NULL CHECK (Role IN ('ADMIN','CREATOR')), InstagramHandle TEXT);
  CREATE TABLE Content (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    UserId INTEGER NOT NULL REFERENCES User(Id),
    Title TEXT NOT NULL, Caption TEXT,
    Format TEXT NOT NULL CHECK (Format IN ('FEED','REELS','STORY','CAROUSEL')),
    Status TEXT NOT NULL CHECK (Status IN ('DRAFT','SCHEDULED','UPLOADED')),
    ScheduledAt TEXT, InstagramLink TEXT, UploadedAt TEXT, CreatedAt TEXT NOT NULL
  );
  CREATE INDEX IdxContentUser ON Content (UserId, Status);
  INSERT INTO User (Name, Role) VALUES ('Admin', 'ADMIN'), ('Aiko', 'CREATOR');
  INSERT INTO Content (UserId, Title, Format, Status, InstagramLink, UploadedAt, CreatedAt)
    VALUES (2, 'Konten lama', 'REELS', 'UPLOADED', 'https://www.instagram.com/p/Lama1/', '2026-09-01T00:00:00.000Z', '2026-08-31T00:00:00.000Z');
  INSERT INTO Content (UserId, Title, Format, Status, CreatedAt) VALUES (2, 'Draft lama', 'FEED', 'DRAFT', '2026-09-02T00:00:00.000Z');
`;

const WithTempFile = (run: (file: string) => void) => {
  const dir = mkdtempSync(join(tmpdir(), 'miyunime-'));
  try {
    run(join(dir, 'lama.db'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe('Skema database dan migrasi', () => {
  test('database lama dimigrasi tanpa kehilangan konten dan mulai menerima status review', () => {
    WithTempFile(file => {
      const old = new DatabaseSync(file);
      old.exec(OldSchema);
      assert.throws(() => old.exec("UPDATE Content SET Status = 'SUBMITTED' WHERE Id = 2"), /CHECK/);
      old.close();

      const db = OpenDatabase(file);
      const rows = db.prepare('SELECT Id, Title, Status, InstagramLink, UploadedAt FROM Content ORDER BY Id').all() as any[];
      assert.deepEqual(rows.map(r => [r.Id, r.Title, r.Status]), [[1, 'Konten lama', 'UPLOADED'], [2, 'Draft lama', 'DRAFT']]);
      assert.equal(rows[0].InstagramLink, 'https://www.instagram.com/p/Lama1/');
      assert.equal(rows[0].UploadedAt, '2026-09-01T00:00:00.000Z');
      db.exec("UPDATE Content SET Status = 'SUBMITTED' WHERE Id = 2");
      const index = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'IdxContentUser'").get();
      assert.ok(index, 'indeks tetap ada setelah migrasi');
      assert.equal(MigrateContentStatus(db), false, 'migrasi kedua tidak melakukan apa-apa');
      db.close();
    });
  });

  test('database baru langsung berskema terbaru dan menolak status di luar daftar', () => {
    const db = OpenDatabase(':memory:');
    assert.equal(MigrateContentStatus(db), false);
    db.exec("INSERT INTO User (Name, Role) VALUES ('Aiko', 'CREATOR')");
    const insert = db.prepare("INSERT INTO Content (UserId, Title, Format, Status, CreatedAt) VALUES (1, 't', 'FEED', ?, 'x')");
    for (const status of ['DRAFT', 'SUBMITTED', 'REVISION', 'APPROVED', 'SCHEDULED', 'UPLOADED']) insert.run(status);
    assert.throws(() => insert.run('PUBLISHED'), /CHECK/);
    db.close();
  });

  test('menghapus konten ikut menghapus riwayat reviewnya, dan keputusan di luar APPROVED atau REVISION ditolak', () => {
    const db = OpenDatabase(':memory:');
    db.exec(`INSERT INTO User (Name, Role) VALUES ('Admin', 'ADMIN'), ('Aiko', 'CREATOR');
             INSERT INTO Content (UserId, Title, Format, Status, CreatedAt) VALUES (2, 't', 'FEED', 'REVISION', 'x');
             INSERT INTO ContentReview (ContentId, ReviewerId, Decision, Comment, CreatedAt) VALUES (1, 1, 'REVISION', 'perbaiki', 'x');`);
    assert.throws(() => db.exec("INSERT INTO ContentReview (ContentId, ReviewerId, Decision, CreatedAt) VALUES (1, 1, 'MAYBE', 'x')"), /CHECK/);
    db.exec('DELETE FROM Content WHERE Id = 1');
    assert.equal((db.prepare('SELECT COUNT(*) AS N FROM ContentReview').get() as { N: number }).N, 0);
    db.close();
  });
});
