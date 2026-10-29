import type { AddressInfo } from 'node:net';
import { OpenDatabase } from '../src/db.ts';
import { CreateServer } from '../src/server.ts';
import { CreateSession, HashPassword } from '../src/auth.ts';

export const TestPassword = 'rahasia123';

export const FixedNow = '2026-10-15T08:00:00.000Z';
export const Ids = { Admin: 1, Aiko: 2, Raka: 3, Sari: 4 };

export async function StartTestApp(nowIso = FixedNow) {
  const db = OpenDatabase(':memory:');
  const hash = HashPassword(TestPassword);
  db.prepare(`INSERT INTO User (Name, Role, InstagramHandle, Email, PasswordHash) VALUES
    ('Admin', 'ADMIN', NULL, 'admin@test.id', ?), ('Aiko', 'CREATOR', '@aiko', 'aiko@test.id', ?),
    ('Raka', 'CREATOR', '@raka', 'raka@test.id', ?), ('Sari', 'CREATOR', '@sari', 'sari@test.id', ?)`).run(hash, hash, hash, hash);
  const tokens = new Map<number, string>();
  for (const id of [1, 2, 3, 4]) tokens.set(id, CreateSession(db, id, new Date(nowIso)));
  const server = CreateServer(db, () => new Date(nowIso));
  await new Promise<void>(resolve => server.listen(0, resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const Call = async (userId: number | null, method: string, path: string, body?: unknown) => {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(userId ? { Authorization: `Bearer ${tokens.get(userId)}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { Status: response.status, Body: (await response.json()) as any };
  };
  const CallRaw = async (userId: number | null, path: string) => {
    const response = await fetch(base + path, { headers: userId ? { Authorization: `Bearer ${tokens.get(userId)}` } : {} });
    // text() membuang BOM sesuai spesifikasi fetch; decode manual agar BOM yang dikirim server tetap terlihat di tes.
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { Status: response.status, Bytes: bytes, Text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes), Headers: response.headers };
  };
  return { Db: db, Tokens: tokens, Base: base, Call, CallRaw, Stop: () => server.close() };
}
