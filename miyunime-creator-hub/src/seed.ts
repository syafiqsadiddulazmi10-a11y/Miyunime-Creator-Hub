import { mkdirSync, rmSync } from 'node:fs';
import { OpenDatabase } from './db.ts';
import { HashPassword } from './auth.ts';

mkdirSync('data', { recursive: true });
rmSync('data/miyunime.db', { force: true });
const db = OpenDatabase('data/miyunime.db');
const now = new Date();
const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1);
const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
const prevEnd = new Date(monthStart.getTime() - 1);
const at = (base: Date, hours: number) => new Date(base.getTime() + hours * 3_600_000).toISOString();

export const DemoPassword = 'miyunime123';
const demoHash = HashPassword(DemoPassword);
const addUserRow = db.prepare('INSERT INTO User (Name, Role, InstagramHandle, Email, PasswordHash) VALUES (?, ?, ?, ?, ?)');
const addUser = {
  run: (name: string, role: string, handle: string | null) =>
    addUserRow.run(name, role, handle, `${name.split(' ')[0].toLowerCase()}@miyunime.id`, demoHash),
};
const addQuota = db.prepare('INSERT INTO Quota (UserId, PeriodType, TargetCount, StartDate, EndDate) VALUES (?, ?, ?, ?, ?)');
const addContent = db.prepare(
  'INSERT INTO Content (UserId, Title, Format, Status, ScheduledAt, InstagramLink, UploadedAt, CreatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
);
const id = (r: { lastInsertRowid: number | bigint }) => Number(r.lastInsertRowid);

addUser.run('Admin Miyunime', 'ADMIN', null);
const aiko = id(addUser.run('Aiko', 'CREATOR', '@aiko.draws'));
const raka = id(addUser.run('Raka', 'CREATOR', '@raka.otaku'));
const sari = id(addUser.run('Sari', 'CREATOR', '@sari.recap'));
addUser.run('Dewi', 'CREATOR', '@dewi.anime');

const period = (start: Date, end: Date) => [start.toISOString(), end.toISOString()] as const;
addQuota.run(aiko, 'MONTHLY', 4, ...period(monthStart, monthEnd));
addQuota.run(raka, 'MONTHLY', 3, ...period(monthStart, monthEnd));
addQuota.run(sari, 'MONTHLY', 5, ...period(prevStart, prevEnd));

const uploaded = (user: number, title: string, format: string, base: Date, hours: number, handle: string) =>
  addContent.run(user, title, format, 'UPLOADED', null, `https://www.instagram.com/p/${handle}/`, at(base, hours), at(base, hours - 24));
uploaded(aiko, 'Rekomendasi anime musim gugur', 'REELS', monthStart, 2, 'DemoAiko1');
uploaded(aiko, 'Fanart karakter favorit', 'FEED', monthStart, 3, 'DemoAiko2');
uploaded(aiko, 'Tier list opening', 'CAROUSEL', monthStart, 4, 'DemoAiko3');
addContent.run(aiko, 'Rekap episode minggu ini', 'REELS', 'SCHEDULED', at(now, 48), null, null, now.toISOString());
addContent.run(aiko, 'Ide thumbnail baru', 'FEED', 'DRAFT', null, null, null, now.toISOString());
uploaded(raka, 'Review film layar lebar', 'REELS', monthStart, 2, 'DemoRaka1');
uploaded(raka, 'Fakta unik studio animasi', 'CAROUSEL', monthStart, 3, 'DemoRaka2');
uploaded(raka, 'Cosplay meet-up', 'FEED', monthStart, 4, 'DemoRaka3');
uploaded(sari, 'Recap episode akhir', 'REELS', prevStart, 2, 'DemoSari1');
uploaded(sari, 'Soundtrack terbaik', 'FEED', prevStart, 3, 'DemoSari2');
addContent.run(sari, 'Daftar tonton akhir pekan', 'CAROUSEL', 'DRAFT', null, null, null, now.toISOString());

// Fitur 4: satu konten menunggu review (Raka) dan satu dikembalikan untuk revisi (Sari).
addContent.run(raka, 'Ulasan manga baru', 'CAROUSEL', 'SUBMITTED', null, null, null, now.toISOString());
const revision = addContent.run(sari, 'Tebak opening anime', 'REELS', 'REVISION', null, null, null, now.toISOString());
db.prepare("INSERT INTO ContentReview (ContentId, ReviewerId, Decision, Comment, CreatedAt) VALUES (?, 1, 'REVISION', ?, ?)")
  .run(id(revision), 'Judul kurang jelas, tambahkan nama anime yang dibahas', now.toISOString());

console.log('Data demo dibuat di data/miyunime.db: 1 admin dan 4 creator (Aiko, Raka, Sari, Dewi)');
console.log(`Akun demo (kata sandi semua: ${DemoPassword}): admin@miyunime.id, aiko@miyunime.id, raka@miyunime.id, sari@miyunime.id, dewi@miyunime.id`);
