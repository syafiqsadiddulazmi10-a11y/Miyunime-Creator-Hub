import { DatabaseSync } from 'node:sqlite';

const ContentStatuses = "'DRAFT', 'SUBMITTED', 'REVISION', 'APPROVED', 'SCHEDULED', 'UPLOADED'";

const ContentTable = `
    CREATE TABLE Content (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      UserId INTEGER NOT NULL REFERENCES User(Id),
      Title TEXT NOT NULL,
      Caption TEXT,
      Format TEXT NOT NULL CHECK (Format IN ('FEED', 'REELS', 'STORY', 'CAROUSEL')),
      Status TEXT NOT NULL CHECK (Status IN (${ContentStatuses})),
      ScheduledAt TEXT,
      InstagramLink TEXT,
      UploadedAt TEXT,
      CreatedAt TEXT NOT NULL
    )`;

/**
 * Database lama (fitur 1 dan 2) hanya mengenal DRAFT, SCHEDULED, UPLOADED. SQLite tidak bisa mengubah CHECK,
 * jadi tabel Content dibangun ulang dengan data yang sama agar database yang sudah ada tetap bisa dipakai.
 */
export function MigrateContentStatus(db: DatabaseSync): boolean {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'Content'").get() as { sql: string } | undefined;
  if (!row || row.sql.includes("'SUBMITTED'")) return false;
  db.exec('BEGIN');
  try {
    db.exec('DROP INDEX IF EXISTS IdxContentUser');
    db.exec('ALTER TABLE Content RENAME TO ContentOld');
    db.exec(ContentTable);
    db.exec(`INSERT INTO Content (Id, UserId, Title, Caption, Format, Status, ScheduledAt, InstagramLink, UploadedAt, CreatedAt)
             SELECT Id, UserId, Title, Caption, Format, Status, ScheduledAt, InstagramLink, UploadedAt, CreatedAt FROM ContentOld`);
    db.exec('DROP TABLE ContentOld');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return true;
}

export function OpenDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  MigrateContentStatus(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS User (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Name TEXT NOT NULL,
      Role TEXT NOT NULL CHECK (Role IN ('ADMIN', 'CREATOR')),
      InstagramHandle TEXT
    );
    CREATE TABLE IF NOT EXISTS Quota (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      UserId INTEGER NOT NULL REFERENCES User(Id),
      PeriodType TEXT NOT NULL CHECK (PeriodType IN ('WEEKLY', 'MONTHLY')),
      TargetCount INTEGER NOT NULL CHECK (TargetCount > 0),
      StartDate TEXT NOT NULL,
      EndDate TEXT NOT NULL
    );
    ${ContentTable.replace('CREATE TABLE Content', 'CREATE TABLE IF NOT EXISTS Content').trim()};
    CREATE INDEX IF NOT EXISTS IdxContentUser ON Content (UserId, Status);
    CREATE TABLE IF NOT EXISTS ContentReview (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      ContentId INTEGER NOT NULL REFERENCES Content(Id) ON DELETE CASCADE,
      ReviewerId INTEGER NOT NULL REFERENCES User(Id),
      Decision TEXT NOT NULL CHECK (Decision IN ('APPROVED', 'REVISION')),
      Comment TEXT,
      CreatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS IdxReviewContent ON ContentReview (ContentId);
  `);
  return db;
}
