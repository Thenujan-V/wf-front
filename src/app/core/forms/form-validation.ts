import { Condition, evaluateCondition, parseCondition, toTime } from '../expression/condition';
import { Access, FieldError, FormDefinition, FormField, MAX_FILES, holdsValue } from './form.models';

export interface ValidationResult {
  data: Record<string, unknown>;
  errors: FieldError[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const USER_ID_MAX = 255;
const parsed = new WeakMap<object, Condition>();
const patterns = new Map<string, RegExp>();

/** Evaluates a stored condition (parsed once per condition object). */
export function conditionHolds(condition: unknown, scope: Record<string, unknown>): boolean {
  if (typeof condition !== 'object' || condition === null) {
    return false;
  }
  let compiled = parsed.get(condition);
  if (!compiled) {
    try {
      compiled = parseCondition(condition);
    } catch {
      // A rule still being written in the form builder; form-service refuses it at publish.
      return false;
    }
    parsed.set(condition, compiled);
  }
  return evaluateCondition(compiled, scope);
}

/**
 * The browser's copy of form-service's SubmissionValidator; shared/forms/validation-vectors.json keeps them in step.
 * The server's answer is authoritative.
 */
export function validateSubmission(
  form: FormDefinition,
  submitted: Record<string, unknown>,
  access: Record<string, Access> = {},
  baseline: Record<string, unknown> = {},
): ValidationResult {
  const errors: FieldError[] = [];
  const clean: Record<string, unknown> = {};
  const inputs = new Set(form.fields.filter(holdsValue).map((f) => f.key));
  for (const key of Object.keys(submitted)) {
    if (!inputs.has(key)) {
      errors.push({ field: key, code: 'UNKNOWN_FIELD', message: `This form has no field '${key}'` });
    }
  }
  // Conditions see the values accepted so far; they only reference earlier fields.
  const scope = { form: clean };
  for (const field of form.fields) {
    if (!holdsValue(field)) {
      continue;
    }
    if (field.visibleWhen != null && !conditionHolds(field.visibleWhen, scope)) {
      continue;
    }
    const key = field.key;
    if ((access[key] ?? 'EDITABLE') !== 'EDITABLE') {
      if (Object.hasOwn(submitted, key) && !same(submitted[key], baseline[key])) {
        errors.push({ field: key, code: 'READ_ONLY', message: `${field.label} cannot be changed at this step` });
      }
      if (Object.hasOwn(baseline, key)) {
        clean[key] = baseline[key];
      }
      continue;
    }
    const required = !!field.required || (field.requiredWhen != null && conditionHolds(field.requiredWhen, scope));
    if (checkValue(field, key, submitted[key], required, errors)) {
      clean[key] = submitted[key];
    }
  }
  return { data: errors.length ? {} : clean, errors };
}

function checkValue(field: FormField, path: string, value: unknown, required: boolean, errors: FieldError[]): boolean {
  const flag = field.type === 'checkbox' && !field.options?.length;
  if (isEmpty(value) || (flag && required && value === false)) {
    if (required) {
      errors.push({ field: path, code: 'REQUIRED', message: `${field.label} is required` });
    }
    return false;
  }
  const before = errors.length;
  switch (field.type) {
    case 'text':
    case 'textarea':
      text(field, path, value, errors);
      break;
    case 'user':
      if (typeof value !== 'string') {
        errors.push(invalidType(field, path));
      } else if (value.length > USER_ID_MAX) {
        errors.push({ field: path, code: 'TOO_LONG', message: `${field.label} is not a valid person` });
      }
      break;
    case 'number':
    case 'currency':
      number(field, path, value, errors);
      break;
    case 'date':
      if (typeof value !== 'string' || !DATE.test(value) || toTime(value) === null) {
        errors.push({ field: path, code: 'INVALID_DATE', message: `${field.label} must be a date (YYYY-MM-DD)` });
      }
      break;
    case 'datetime':
      if (typeof value !== 'string' || DATE.test(value) || toTime(value) === null) {
        errors.push({ field: path, code: 'INVALID_DATE', message: `${field.label} must be a date and time with a time zone` });
      }
      break;
    case 'select':
    case 'radio':
      if (typeof value !== 'string') {
        errors.push(invalidType(field, path));
      } else if (!offered(field, value)) {
        errors.push(notAnOption(field, path));
      }
      break;
    case 'checkbox':
      checkbox(field, path, value, errors);
      break;
    case 'file':
      files(field, path, value, errors);
      break;
    case 'table':
      table(field, path, value, errors);
      break;
    default:
      errors.push({ field: path, code: 'UNKNOWN_FIELD', message: `This form has no field '${path}'` });
  }
  return errors.length === before;
}

function text(field: FormField, path: string, value: unknown, errors: FieldError[]): void {
  if (typeof value !== 'string') {
    errors.push(invalidType(field, path));
    return;
  }
  const before = errors.length;
  if (field.minLength != null && value.length < field.minLength) {
    errors.push({ field: path, code: 'TOO_SHORT', message: `${field.label} must be at least ${field.minLength} characters` });
  }
  if (field.maxLength != null && value.length > field.maxLength) {
    errors.push({ field: path, code: 'TOO_LONG', message: `${field.label} must be at most ${field.maxLength} characters` });
  }
  // A length error already rejects the value; skipping the pattern also bounds its work.
  if (field.pattern != null && errors.length === before && !wholeMatch(field.pattern, value)) {
    errors.push({ field: path, code: 'PATTERN_MISMATCH', message: `${field.label} is not in the expected format` });
  }
}

function number(field: FormField, path: string, value: unknown, errors: FieldError[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(invalidType(field, path));
    return;
  }
  if (field.type === 'currency' && decimals(value) > 2) {
    errors.push({ field: path, code: 'TOO_MANY_DECIMALS', message: `${field.label} can have at most 2 decimal places` });
  }
  if (field.min != null && value < field.min) {
    errors.push({ field: path, code: 'TOO_SMALL', message: `${field.label} must be at least ${field.min}` });
  }
  if (field.max != null && value > field.max) {
    errors.push({ field: path, code: 'TOO_LARGE', message: `${field.label} must be at most ${field.max}` });
  }
}

function checkbox(field: FormField, path: string, value: unknown, errors: FieldError[]): void {
  if (!field.options?.length) {
    if (typeof value !== 'boolean') {
      errors.push(invalidType(field, path));
    }
    return;
  }
  if (!Array.isArray(value) || !value.every((choice) => typeof choice === 'string')) {
    errors.push(invalidType(field, path));
    return;
  }
  const seen = new Set<string>();
  if (!value.every((choice: string) => offered(field, choice) && !seen.has(choice) && seen.add(choice))) {
    errors.push(notAnOption(field, path));
  }
}

function table(field: FormField, path: string, value: unknown, errors: FieldError[]): void {
  if (!Array.isArray(value) || !value.every(isPlainObject)) {
    errors.push(invalidType(field, path));
    return;
  }
  if (field.minRows != null && value.length < field.minRows) {
    errors.push({ field: path, code: 'TOO_FEW_ROWS', message: `${field.label} needs at least ${field.minRows} rows` });
  }
  if (field.maxRows != null && value.length > field.maxRows) {
    errors.push({ field: path, code: 'TOO_MANY_ROWS', message: `${field.label} can have at most ${field.maxRows} rows` });
  }
  const columns = field.columns ?? [];
  const known = new Set(columns.map((c) => c.key));
  value.forEach((row: Record<string, unknown>, i: number) => {
    const rowPath = `${path}[${i}]`;
    for (const key of Object.keys(row)) {
      if (!known.has(key)) {
        errors.push({ field: `${rowPath}.${key}`, code: 'UNKNOWN_FIELD', message: `${field.label} has no column '${key}'` });
      }
    }
    for (const column of columns) {
      checkValue(column, `${rowPath}.${column.key}`, row[column.key], !!column.required, errors);
    }
  });
}

/** Decimal places of the shortest decimal form, as Java's BigDecimal(Double.toString(v)).stripTrailingZeros(). */
function decimals(value: number): number {
  const [mantissa, exponent] = String(value).toLowerCase().split('e');
  const fraction = (mantissa.split('.')[1] ?? '').replace(/0+$/, '');
  return fraction.length - Number(exponent ?? 0);
}

function wholeMatch(pattern: string, value: string): boolean {
  let regex = patterns.get(pattern);
  if (!regex) {
    try {
      regex = new RegExp(`^(?:${pattern})$`);
    } catch {
      return true; // a pattern still being typed in the form builder; form-service refuses it at publish
    }
    patterns.set(pattern, regex);
  }
  return regex.test(value);
}

function offered(field: FormField, choice: string): boolean {
  return (field.options ?? []).some((option) => option.value === choice);
}

function files(field: FormField, path: string, value: unknown, errors: FieldError[]): void {
  if (!Array.isArray(value) || !value.every(fileReference)) {
    errors.push(invalidType(field, path));
    return;
  }
  if (value.length > MAX_FILES) {
    errors.push({ field: path, code: 'TOO_MANY_FILES', message: `${field.label} can have at most ${MAX_FILES} files` });
  }
  if (new Set(value.map((ref) => (ref as { documentId: string }).documentId)).size !== value.length) {
    errors.push({ field: path, code: 'DUPLICATE_FILE', message: `${field.label} lists the same file twice` });
  }
}

function fileReference(item: unknown): boolean {
  if (!isPlainObject(item) || Object.keys(item).length !== 2) {
    return false;
  }
  const { documentId, name } = item;
  return typeof documentId === 'string' && documentId.trim() !== '' && documentId.length <= 36
    && typeof name === 'string' && name.trim() !== '' && name.length <= 255;
}

function invalidType(field: FormField, path: string): FieldError {
  return { field: path, code: 'INVALID_TYPE', message: `${field.label} has a value of the wrong kind` };
}

function notAnOption(field: FormField, path: string): FieldError {
  return { field: path, code: 'NOT_AN_OPTION', message: `Choose one of the offered options for ${field.label}` };
}

/** "No value" has several spellings; browsers send disabled fields as "" or false. */
function same(a: unknown, b: unknown): boolean {
  if (noValue(a) && noValue(b)) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => same(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]));
  }
  return a === b;
}

function noValue(value: unknown): boolean {
  return isEmpty(value) || value === false;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
