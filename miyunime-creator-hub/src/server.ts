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
import { NewId, SilentLogger, type Logger } from './logger.ts';

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

const MaxBodyBytes = 100_000;

class HttpError extends Error {
  Status: number;
  constructor(status: number, message: string) {
    super(message);
    this.Status = status;
  }
}

function ReadBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MaxBodyBytes) {
        // Berhenti membaca (tanpa memutus koneksi) supaya jawaban 413 sempat terkirim; koneksi ditutup setelahnya.
        req.pause();
        reject(new HttpError(413, 'Isi permintaan terlalu besar'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', () => reject(new HttpError(400, 'Permintaan terputus')));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const parsed = raw ? JSON.parse(raw) : {};
        resolve(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
      } catch {
        reject(new HttpError(400, 'Isi permintaan bukan JSON yang valid'));
      }
    });
  });
}

/** Header keamanan untuk semua respons. CSP melarang skrip/gaya inline, sehingga XSS yang lolos pun tidak bisa menjalankan skrip. */
const SecurityHeaders: Record<string, string> = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export type ServerOptions = { Log?: Logger };

export function CreateServer(db: DatabaseSync, now: () => Date = () => new Date(), options: ServerOptions = {}): Server {
  const Log = options.Log ?? SilentLogger;
  return createServer(async (req, res) => {
    const started = Date.now();
    const requestId = NewId();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const ip = req.socket.remoteAddress ?? '-';
    let userId: number | null = null;
    let event: string | undefined;
    const headers = { ...SecurityHeaders, 'X-Request-Id': requestId } as Record<string, string>;
    if (String(req.headers['x-forwarded-proto'] ?? '') === 'https') headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    if (url.pathname.startsWith('/api/')) headers['Cache-Control'] = 'no-store';

    res.on('finish', () => {
      // Path tanpa query string: query bisa memuat kata kunci pencarian pengguna.
      Log({
        Level: res.statusCode >= 500 ? 'error' : 'info', Event: event ?? 'REQUEST', RequestId: requestId, Method: req.method,
        Path: url.pathname, Status: res.statusCode, Ms: Date.now() - started, UserId: userId, Ip: ip,
      });
    });
    const Send = (status: number, body: string | Buffer, type: string) => {
      res.writeHead(status, { ...headers, 'Content-Type': type });
      res.end(body);
    };
    const SendResult = (r: Result) => {
      event = r.Event ?? event;
      if (r.Raw === undefined) {
        res.writeHead(r.Status, { ...headers, ...r.Headers, 'Content-Type': Mime['.json'] });
        return res.end(JSON.stringify(r.Body));
      }
      res.writeHead(r.Status, { ...headers, ...r.Headers });
      res.end(r.Raw);
    };

    if (url.pathname === '/healthz') {
      try {
        db.prepare('SELECT 1').get();
        return Send(200, JSON.stringify({ Status: 'ok' }), Mime['.json']);
      } catch {
        return Send(503, JSON.stringify({ Status: 'database tidak tersedia' }), Mime['.json']);
      }
    }

    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return Send(405, 'Metode tidak diizinkan', 'text/plain; charset=utf-8');
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
    userId = user?.Id ?? null;
    if (!route.Public && !user) {
      event = 'AUTH_REJECTED';
      return SendResult(Fail(401, 'Sesi tidak valid atau sudah berakhir, silakan masuk lagi'));
    }

    let body: Record<string, unknown>;
    try {
      body = req.method === 'POST' ? await ReadBody(req) : {};
    } catch (error) {
      const status = error instanceof HttpError ? error.Status : 400;
      event = status === 413 ? 'BODY_TOO_LARGE' : 'BAD_REQUEST';
      if (status === 413) {
        headers.Connection = 'close';
        res.once('finish', () => req.destroy());
      }
      return SendResult(Fail(status, error instanceof Error ? error.message : 'Permintaan tidak valid'));
    }
    try {
      const params = { ...route.Pattern.exec(url.pathname)?.groups };
      SendResult(route.Handler({ Db: db, Now: now(), User: user as User, Params: params, Query: url.searchParams, Body: body, Headers: req.headers, Ip: ip, Log: entry => Log({ RequestId: requestId, ...entry }) }));
    } catch (error) {
      // Detail (pesan dan stack) hanya masuk log server. Pengguna hanya menerima ErrorId untuk dilaporkan ke admin.
      const errorId = NewId();
      Log({
        Level: 'error', Event: 'UNHANDLED_ERROR', ErrorId: errorId, RequestId: requestId, Method: req.method, Path: url.pathname,
        Error: error instanceof Error ? error.message : String(error), Stack: error instanceof Error ? error.stack?.split('\n').slice(0, 4).map(l => l.trim()) : undefined,
      });
      event = 'UNHANDLED_ERROR';
      SendResult({ Status: 500, Body: { Message: `Terjadi kesalahan pada server. Sebutkan kode ${errorId} saat melapor.`, ErrorId: errorId } });
    }
  });
}
