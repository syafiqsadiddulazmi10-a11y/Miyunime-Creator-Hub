import type { AddressInfo } from 'node:net';
import { OpenDatabase } from '../src/db.ts';
import { CreateServer } from '../src/server.ts';

export const FixedNow = '2026-10-15T08:00:00.000Z';
export const Ids = { Admin: 1, Aiko: 2, Raka: 3, Sari: 4 };

export async function StartTestApp(nowIso = FixedNow) {
  const db = OpenDatabase(':memory:');
  db.exec(`INSERT INTO User (Name, Role, InstagramHandle) VALUES
    ('Admin', 'ADMIN', NULL), ('Aiko', 'CREATOR', '@aiko'), ('Raka', 'CREATOR', '@raka'), ('Sari', 'CREATOR', '@sari')`);
  const server = CreateServer(db, () => new Date(nowIso));
  await new Promise<void>(resolve => server.listen(0, resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const Call = async (userId: number | null, method: string, path: string, body?: unknown) => {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(userId ? { 'X-User-Id': String(userId) } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { Status: response.status, Body: (await response.json()) as any };
  };
  return { Db: db, Call, Stop: () => server.close() };
}
