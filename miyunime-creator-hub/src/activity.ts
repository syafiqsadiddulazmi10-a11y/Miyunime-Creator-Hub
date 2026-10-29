import type { DatabaseSync } from 'node:sqlite';
import { Ok, type Context, type Result, type Route } from './http.ts';

/** Mencatat satu kejadian penting. Dipanggil dari handler setelah perubahan data berhasil. */
export function LogActivity(db: DatabaseSync, now: Date, userId: number | null, action: string, target: string): void {
  db.prepare('INSERT INTO ActivityLog (UserId, Action, Target, CreatedAt) VALUES (?, ?, ?, ?)').run(userId, action, target, now.toISOString());
}

/** Admin melihat semua aktivitas, creator hanya aktivitasnya sendiri. Terbaru di atas, maksimal 50 baris. */
export function ListActivity(ctx: Context): Result {
  const isAdmin = ctx.User.Role === 'ADMIN';
  const limitParam = Number(ctx.Query.get('Limit') ?? 50);
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
  return Ok(
    ctx.Db
      .prepare(
        `SELECT a.Id, a.Action, a.Target, a.CreatedAt, u.Name AS UserName
         FROM ActivityLog a LEFT JOIN User u ON u.Id = a.UserId
         WHERE (? = 1 OR a.UserId = ?) ORDER BY a.Id DESC LIMIT ?`,
      )
      .all(isAdmin ? 1 : 0, ctx.User.Id, limit),
  );
}

export const ActivityRoutes: Route[] = [{ Method: 'GET', Pattern: /^\/api\/activity$/, Handler: ListActivity }];
