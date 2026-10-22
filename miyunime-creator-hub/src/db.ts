import { DatabaseSync } from 'node:sqlite';

export function OpenDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
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
    CREATE TABLE IF NOT EXISTS Content (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      UserId INTEGER NOT NULL REFERENCES User(Id),
      Title TEXT NOT NULL,
      Caption TEXT,
      Format TEXT NOT NULL CHECK (Format IN ('FEED', 'REELS', 'STORY', 'CAROUSEL')),
      Status TEXT NOT NULL CHECK (Status IN ('DRAFT', 'SCHEDULED', 'UPLOADED')),
      ScheduledAt TEXT,
      InstagramLink TEXT,
      UploadedAt TEXT,
      CreatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS IdxContentUser ON Content (UserId, Status);
  `);
  return db;
}
