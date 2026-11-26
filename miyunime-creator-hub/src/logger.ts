import { randomBytes } from 'node:crypto';

export type LogEntry = Record<string, unknown>;
export type Logger = (entry: LogEntry) => void;

/** Log berformat satu baris JSON per kejadian, mudah dibaca manusia maupun mesin (grep, jq, Loki, dsb). */
export const ConsoleLogger: Logger = entry => {
  const { Level, ...rest } = entry;
  const line = JSON.stringify({ Time: new Date().toISOString(), Level: Level ?? 'info', ...rest });
  (Level === 'error' ? console.error : console.log)(line);
};

export const SilentLogger: Logger = () => {};

export const NewId = (): string => randomBytes(4).toString('hex');

/** a***@miyunime.id: cukup untuk menelusuri kejadian tanpa menyimpan alamat email lengkap. */
export function MaskEmail(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  const at = text.indexOf('@');
  if (at < 1) return text ? '***' : '';
  return `${text[0]}***${text.slice(at)}`.slice(0, 80);
}
