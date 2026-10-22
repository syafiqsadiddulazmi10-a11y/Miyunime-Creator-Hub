import { createServer, type IncomingMessage, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { ContentRoutes } from './content.ts';
import { QuotaRoutes } from './quota.ts';
import { Fail, Ok, type Result, type Route, type User } from './http.ts';

const Routes: Route[] = [
  {
    Method: 'GET',
    Pattern: /^\/api\/users$/,
    Public: true,
    Handler: ctx => Ok(ctx.Db.prepare('SELECT Id, Name, Role, InstagramHandle FROM User ORDER BY Id').all()),
  },
  { Method: 'GET', Pattern: /^\/api\/me$/, Handler: ctx => Ok(ctx.User) },
  ...ContentRoutes,
  ...QuotaRoutes,
];

const Mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};
const PublicDir = new URL('../public/', import.meta.url);

function ReadBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 100_000) reject(new Error('Isi permintaan terlalu besar'));
    });
    req.on('end', () => {
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(new Error('Isi permintaan bukan JSON yang valid'));
      }
    });
  });
}

export function CreateServer(db: DatabaseSync, now: () => Date = () => new Date()): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const Send = (status: number, body: string | Buffer, type: string) => {
      res.writeHead(status, { 'Content-Type': type });
      res.end(body);
    };
    const SendResult = (r: Result) => Send(r.Status, JSON.stringify(r.Body), Mime['.json']);

    if (!url.pathname.startsWith('/api/')) {
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[\w.-]+$/.test(name) || name.startsWith('.')) return Send(404, 'Tidak ditemukan', 'text/plain; charset=utf-8');
      try {
        return Send(200, readFileSync(new URL(name, PublicDir)), Mime[extname(name)] ?? 'application/octet-stream');
      } catch {
        return Send(404, 'Tidak ditemukan', 'text/plain; charset=utf-8');
      }
    }

    const route = Routes.find(r => r.Method === req.method && r.Pattern.test(url.pathname));
    if (!route) return SendResult(Fail(404, 'Rute tidak ditemukan'));

    const userId = Number(req.headers['x-user-id']);
    const user = Number.isInteger(userId)
      ? (db.prepare('SELECT Id, Name, Role FROM User WHERE Id = ?').get(userId) as unknown as User | undefined)
      : undefined;
    if (!route.Public && !user) return SendResult(Fail(401, 'Pilih pengguna terlebih dahulu'));

    try {
      const body = req.method === 'POST' ? await ReadBody(req) : {};
      const params = { ...route.Pattern.exec(url.pathname)?.groups };
      SendResult(route.Handler({ Db: db, Now: now(), User: user as User, Params: params, Query: url.searchParams, Body: body }));
    } catch (error) {
      SendResult(Fail(400, error instanceof Error ? error.message : 'Permintaan tidak valid'));
    }
  });
}
