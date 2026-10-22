import type { DatabaseSync } from 'node:sqlite';

export type Role = 'ADMIN' | 'CREATOR';
export type User = { Id: number; Name: string; Role: Role };
export type Result = { Status: number; Body: unknown };
export type Context = {
  Db: DatabaseSync;
  Now: Date;
  User: User;
  Params: Record<string, string>;
  Query: URLSearchParams;
  Body: Record<string, unknown>;
};
export type Route = { Method: string; Pattern: RegExp; Public?: boolean; Handler: (ctx: Context) => Result };

export const Ok = (Body: unknown, Status = 200): Result => ({ Status, Body });
export const Fail = (Status: number, Message: string): Result => ({ Status, Body: { Message } });
