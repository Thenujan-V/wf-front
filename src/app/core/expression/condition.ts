/** Rule-builder conditions (spec §3). Mirrors lk.auradot.wms.expression; both pass shared/expression vectors. */
export type Operator =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'notIn'
  | 'contains' | 'isEmpty' | 'isNotEmpty' | 'before' | 'after';

export type Literal = string | number | boolean | null | Literal[];

export interface Compare {
  var: string;
  op: Operator;
  value?: Literal;
}

export type Condition = { all: Condition[] } | { any: Condition[] } | { not: Condition } | Compare;

export class ConditionParseError extends Error {
  constructor(readonly path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = 'ConditionParseError';
  }
}

const OPERATORS: readonly Operator[] = [
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'contains', 'isEmpty', 'isNotEmpty', 'before', 'after',
];
const COMPARE_KEYS = new Set(['var', 'op', 'value']);
const MAX_DEPTH = 32;

export function parseCondition(node: unknown): Condition {
  return parseAt(node, '$', 0);
}

export function evaluateCondition(condition: Condition, variables: Record<string, unknown>): boolean {
  if ('all' in condition) {
    return condition.all.every((c) => evaluateCondition(c, variables));
  }
  if ('any' in condition) {
    return condition.any.some((c) => evaluateCondition(c, variables));
  }
  if ('not' in condition) {
    return !evaluateCondition(condition.not, variables);
  }
  return compare(condition, resolve(variables, condition.var));
}

function parseAt(node: unknown, path: string, depth: number): Condition {
  if (depth > MAX_DEPTH) {
    throw new ConditionParseError(path, 'condition is nested too deeply');
  }
  if (!isPlainObject(node)) {
    throw new ConditionParseError(path, 'must be an object');
  }
  for (const combinator of ['all', 'any'] as const) {
    if (combinator in node) {
      requireOnly(node, combinator, path);
      const list = node[combinator];
      if (!Array.isArray(list)) {
        throw new ConditionParseError(`${path}.${combinator}`, 'must be a list');
      }
      const parsed = list.map((c, i) => parseAt(c, `${path}.${combinator}[${i}]`, depth + 1));
      return combinator === 'all' ? { all: parsed } : { any: parsed };
    }
  }
  if ('not' in node) {
    requireOnly(node, 'not', path);
    return { not: parseAt(node['not'], `${path}.not`, depth + 1) };
  }
  if ('var' in node) {
    return parseCompare(node, path);
  }
  throw new ConditionParseError(path, 'must contain one of all, any, not or var');
}

function parseCompare(node: Record<string, unknown>, path: string): Compare {
  for (const key of Object.keys(node)) {
    if (!COMPARE_KEYS.has(key)) {
      throw new ConditionParseError(path, `unexpected key '${key}'`);
    }
  }
  const variable = node['var'];
  if (typeof variable !== 'string' || variable.trim() === '') {
    throw new ConditionParseError(`${path}.var`, 'must be a non-empty string');
  }
  const opName = node['op'];
  if (typeof opName !== 'string') {
    throw new ConditionParseError(`${path}.op`, 'must be a string');
  }
  if (!(OPERATORS as readonly string[]).includes(opName)) {
    throw new ConditionParseError(`${path}.op`, `unknown operator '${opName}'`);
  }
  const op = opName as Operator;
  const needsValue = op !== 'isEmpty' && op !== 'isNotEmpty';
  const hasValue = 'value' in node;
  if (needsValue && !hasValue) {
    throw new ConditionParseError(`${path}.value`, `is required for ${op}`);
  }
  if (!needsValue && hasValue) {
    throw new ConditionParseError(`${path}.value`, `is not allowed for ${op}`);
  }
  if (!needsValue) {
    return { var: variable, op };
  }
  const value = literal(node['value'], `${path}.value`);
  if ((op === 'in' || op === 'notIn') && !Array.isArray(value)) {
    throw new ConditionParseError(`${path}.value`, `must be a list for ${op}`);
  }
  if ((op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') && typeof value !== 'number') {
    throw new ConditionParseError(`${path}.value`, `must be a number for ${op}`);
  }
  if ((op === 'before' || op === 'after') && toTime(value) === null) {
    throw new ConditionParseError(`${path}.value`, `must be an ISO date or date-time for ${op}`);
  }
  return { var: variable, op, value };
}

function literal(value: unknown, path: string): Literal {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ConditionParseError(path, 'must be a finite number');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => literal(item, `${path}[${i}]`));
  }
  throw new ConditionParseError(path, 'unsupported value type');
}

function requireOnly(node: Record<string, unknown>, key: string, path: string): void {
  for (const other of Object.keys(node)) {
    if (other !== key) {
      throw new ConditionParseError(path, `unexpected key '${other}'`);
    }
  }
}

function resolve(variables: Record<string, unknown>, path: string): unknown {
  let current: unknown = variables;
  for (const segment of path.split('.')) {
    // Own properties only: 'constructor' or 'toString' must not resolve to Object.prototype members.
    if (!isPlainObject(current) || !Object.hasOwn(current, segment)) {
      return null;
    }
    current = current[segment];
  }
  return current === undefined ? null : current;
}

function compare(condition: Compare, actual: unknown): boolean {
  const expected = condition.value ?? null;
  switch (condition.op) {
    case 'eq':
      return equalValues(actual, expected);
    case 'ne':
      if (actual === null || expected === null) {
        return !(actual === null && expected === null);
      }
      return sameKind(actual, expected) && !equalValues(actual, expected);
    case 'gt':
      return numeric(actual, expected, (r) => r > 0);
    case 'gte':
      return numeric(actual, expected, (r) => r >= 0);
    case 'lt':
      return numeric(actual, expected, (r) => r < 0);
    case 'lte':
      return numeric(actual, expected, (r) => r <= 0);
    case 'in':
      return Array.isArray(expected) && actual !== null && expected.some((item) => equalValues(actual, item));
    case 'notIn':
      return Array.isArray(expected) && (actual === null || !expected.some((item) => equalValues(actual, item)));
    case 'contains':
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.toLowerCase().includes(expected.toLowerCase());
      }
      return Array.isArray(actual) && actual.some((item) => equalValues(item, expected));
    case 'isEmpty':
      return isEmpty(actual);
    case 'isNotEmpty':
      return !isEmpty(actual);
    case 'before':
      return temporal(actual, expected, (r) => r < 0);
    case 'after':
      return temporal(actual, expected, (r) => r > 0);
    default:
      return false;
  }
}

function equalValues(a: unknown, b: unknown): boolean {
  if (a === null || b === null) {
    return a === null && b === null;
  }
  return sameKind(a, b) && a === b;
}

function sameKind(a: unknown, b: unknown): boolean {
  const kind = typeof a;
  return kind === typeof b && (kind === 'number' || kind === 'string' || kind === 'boolean');
}

function numeric(a: unknown, b: unknown, test: (r: number) => boolean): boolean {
  return typeof a === 'number' && typeof b === 'number' && test(Math.sign(a - b));
}

function temporal(a: unknown, b: unknown, test: (r: number) => boolean): boolean {
  const x = toTime(a);
  const y = toTime(b);
  return x !== null && y !== null && test(Math.sign(x - y));
}

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0) ||
    (isPlainObject(value) && Object.keys(value).length === 0)
  );
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Mirrors Java's strict ISO_OFFSET_DATE_TIME: case-insensitive T/Z, optional seconds and fraction,
// offsets of the form ±HH:MM or ±HH:MM:SS.
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:([Zz])|([+-])(\d{2}):(\d{2})(?::(\d{2}))?)$/;

/** ISO date (midnight UTC) or ISO date-time with offset, as epoch millis; otherwise null. Impossible values are null. */
export function toTime(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const date = DATE.exec(value);
  if (date) {
    const [year, month, day] = [Number(date[1]), Number(date[2]), Number(date[3])];
    return validDate(year, month, day) ? Date.UTC(year, month - 1, day) : null;
  }
  const m = DATE_TIME.exec(value);
  if (!m) {
    return null;
  }
  const [year, month, day, hour, minute] = [1, 2, 3, 4, 5].map((i) => Number(m[i]));
  const second = m[6] ? Number(m[6]) : 0;
  const millis = m[7] ? Number(m[7].padEnd(3, '0').slice(0, 3)) : 0;
  if (!validDate(year, month, day) || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  let offsetMillis = 0;
  if (!m[8]) {
    const [offsetHours, offsetMinutes] = [Number(m[10]), Number(m[11])];
    const offsetSeconds = m[12] ? Number(m[12]) : 0;
    if (offsetHours > 18 || offsetMinutes > 59 || offsetSeconds > 59) {
      return null;
    }
    offsetMillis = (m[9] === '+' ? 1 : -1) * ((offsetHours * 60 + offsetMinutes) * 60 + offsetSeconds) * 1000;
  }
  return Date.UTC(year, month - 1, day, hour, minute, second, millis) - offsetMillis;
}

function validDate(year: number, month: number, day: number): boolean {
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
