import { createServer, type IncomingMessage, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { ContentRoutes } from './content.ts';
import { QuotaRoutes } from './quota.ts';
import { ReviewRoutes } from './review.ts';
import { QuotaSettingsRoutes } from './quota-settings.ts';
import { ReportRoutes } from './report.ts';
import { AuthRoutes, UserFromToken } from './auth.ts';
import { ActivityRoutes } from './activity.ts';
import { NotificationRoutes } from './notifications.ts';
import { Fail, Ok, type Result, type Route, type User } from './http.ts';

const Routes: Route[] = [
  {
    Method: 'GET',
    Pattern: /^\/api\/users$/,
    Handler: ctx =>
      ctx.User.Role === 'ADMIN'
        ? Ok(ctx.Db.prepare('SELECT Id, Name, Role, InstagramHandle FROM User ORDER BY Id').all())
        : Fail(403, 'Daftar pengguna hanya untuk admin'),
  },
  { Method: 'GET', Pattern: /^\/api\/me$/, Handler: ctx => Ok(ctx.User) },
  ...AuthRoutes,
  ...ActivityRoutes,
  ...NotificationRoutes,
  ...ContentRoutes,
  ...ReviewRoutes,
  ...QuotaRoutes,
  ...QuotaSettingsRoutes,
  ...ReportRoutes,
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
    const SendResult = (r: Result) => {
      if (r.Raw === undefined) return Send(r.Status, JSON.stringify(r.Body), Mime['.json']);
      res.writeHead(r.Status, r.Headers);
      res.end(r.Raw);
    };

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

    const token = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ''))?.[1];
    const user = UserFromToken(db, token, now());
    if (!route.Public && !user) return SendResult(Fail(401, 'Sesi tidak valid atau sudah berakhir, silakan masuk lagi'));

    let body: Record<string, unknown>;
    try {
      body = req.method === 'POST' ? await ReadBody(req) : {};
    } catch (error) {
      return SendResult(Fail(400, error instanceof Error ? error.message : 'Permintaan tidak valid'));
    }
    try {
      const params = { ...route.Pattern.exec(url.pathname)?.groups };
      SendResult(route.Handler({ Db: db, Now: now(), User: user as User, Params: params, Query: url.searchParams, Body: body, Headers: req.headers }));
    } catch (error) {
      console.error(error);
      SendResult(Fail(500, 'Terjadi kesalahan pada server, coba lagi beberapa saat'));
    }
  });
}
