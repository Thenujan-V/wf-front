import { toTime } from '../expression/condition';

const pad = (n: number) => String(n).padStart(2, '0');

/** Stored ISO date-time -> value for <input type="datetime-local"> in the browser's time zone. */
export function isoToLocalInput(value: unknown): string {
  const time = typeof value === 'string' ? toTime(value) : null;
  if (time === null) {
    return '';
  }
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value (browser local time) -> ISO-8601 with that local offset. */
export function localInputToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) {
    return null;
  }
  const offset = -new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Sum of a table column's numeric cells. */
export function columnTotal(rows: unknown, column: string): number {
  if (!Array.isArray(rows)) {
    return 0;
  }
  return rows.reduce((sum: number, row: unknown) => {
    const cell = (row as Record<string, unknown> | null)?.[column];
    return typeof cell === 'number' && Number.isFinite(cell) ? sum + cell : sum;
  }, 0);
}

/** A number typed into an input, or null when blank or not a number. */
export function toNumber(text: string): number | null {
  if (text.trim() === '') {
    return null;
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** A file field's value as its file names ("a.pdf, b.pdf"), or null when the value is not a list of file references. */
export function fileNames(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isFileRef)) {
    return null;
  }
  return value.map((ref) => (ref as { name: string }).name).join(', ');
}

function isFileRef(item: unknown): boolean {
  return typeof item === 'object' && item !== null
    && typeof (item as { documentId?: unknown }).documentId === 'string'
    && typeof (item as { name?: unknown }).name === 'string';
}
