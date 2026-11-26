import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { OpenDatabase } from './db.ts';
import { ConsoleLogger } from './logger.ts';
import { CreateServer } from './server.ts';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const file = process.env.DATABASE_FILE ?? 'data/miyunime.db';
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`PORT tidak valid: "${process.env.PORT}". Gunakan angka 1 sampai 65535.`);
  process.exit(1);
}

mkdirSync(dirname(file), { recursive: true });
const db = OpenDatabase(file);
const hasUsers = (db.prepare('SELECT COUNT(*) AS Count FROM User').get() as { Count: number }).Count;
const server = CreateServer(db, () => new Date(), { Log: ConsoleLogger });

server.on('error', (error: NodeJS.ErrnoException) => {
  const hint = error.code === 'EADDRINUSE' ? `Port ${port} sudah dipakai. Jalankan dengan PORT=<port lain>.` : error.message;
  ConsoleLogger({ Level: 'error', Event: 'SERVER_START_FAILED', Code: error.code, Message: hint });
  process.exit(1);
});
server.listen(port, host, () => {
  ConsoleLogger({ Event: 'SERVER_STARTED', Url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`, Database: file });
  if (!hasUsers) ConsoleLogger({ Level: 'warn', Event: 'NO_USERS', Message: 'Database belum berisi akun. Jalankan "npm run seed" terlebih dahulu.' });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    ConsoleLogger({ Event: 'SERVER_STOPPING', Signal: signal });
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
