import { Operator } from '../../../core/expression/condition';
import { FormField } from '../../../core/forms/form.models';

export interface RuleRow {
  field: string;
  op: Operator;
  value?: unknown;
}

export interface RuleModel {
  mode: 'all' | 'any';
  rows: RuleRow[];
}

/** A field the rule may use, optionally listed under a heading in the field picker. */
export type RuleField = FormField & { group?: string };

/** The kinds of value a hand-named field (one no form lists) can hold. */
export type CustomType = 'number' | 'text' | 'date' | 'checkbox';

export const CUSTOM_TYPES: { type: CustomType; label: string }[] = [
  { type: 'number', label: 'Number' },
  { type: 'text', label: 'Text' },
  { type: 'date', label: 'Date' },
  { type: 'checkbox', label: 'Yes / no' },
];

/** A stand-in field for a hand-named variable, so it gets the operators and value input of its type. */
export function customField(key: string, type: CustomType): FormField {
  return { key, label: key, type };
}

/** The type a saved condition on a hand-named field was built with, read back from its comparison and value. */
export function customTypeOf(row: RuleRow): CustomType {
  if (typeof row.value === 'number' || row.op === 'gt' || row.op === 'gte' || row.op === 'lt' || row.op === 'lte') {
    return 'number';
  }
  if (typeof row.value === 'boolean') {
    return 'checkbox';
  }
  return row.op === 'before' || row.op === 'after' ? 'date' : 'text';
}

export type ReadRule = { kind: 'none' } | { kind: 'rows'; model: RuleModel } | { kind: 'advanced' };

const LABELS: Record<Operator, string> = {
  eq: 'is', ne: 'is not', gt: 'is more than', gte: 'is at least', lt: 'is less than', lte: 'is at most',
  in: 'is one of', notIn: 'is none of', contains: 'contains', isEmpty: 'is empty', isNotEmpty: 'is filled in',
  before: 'is before', after: 'is after',
};

/**
 * A rule the builder can edit: one comparison, or all/any of a flat list of comparisons.
 * Row fields are variable paths with the prefix taken off: form field keys by default, or full paths with prefix ''.
 */
export function readRule(condition: unknown, prefix = 'form.'): ReadRule {
  if (condition === undefined || condition === null) {
    return { kind: 'none' };
  }
  const single = toRow(condition, prefix);
  if (single) {
    return { kind: 'rows', model: { mode: 'all', rows: [single] } };
  }
  if (typeof condition === 'object' && !Array.isArray(condition)) {
    const keys = Object.keys(condition);
    const mode = keys.length === 1 && (keys[0] === 'all' || keys[0] === 'any') ? keys[0] : null;
    const list = mode ? (condition as Record<string, unknown>)[mode] : null;
    if (mode && Array.isArray(list) && list.length > 0) {
      const rows = list.map((item) => toRow(item, prefix));
      if (rows.every((row): row is RuleRow => row !== null)) {
        return { kind: 'rows', model: { mode, rows } };
      }
    }
  }
  return { kind: 'advanced' };
}

export function writeRule(model: RuleModel, prefix = 'form.'): unknown {
  const compares = model.rows.map((row) =>
    needsValue(row.op) ? { var: `${prefix}${row.field}`, op: row.op, value: row.value } : { var: `${prefix}${row.field}`, op: row.op });
  if (compares.length === 0) {
    return undefined;
  }
  return compares.length === 1 ? compares[0] : { [model.mode]: compares };
}

export function needsValue(op: Operator): boolean {
  return op !== 'isEmpty' && op !== 'isNotEmpty';
}

export function operatorLabel(op: Operator): string {
  return LABELS[op];
}

export function operatorsFor(field: FormField | undefined): { op: Operator; label: string }[] {
  const ops: Operator[] = (() => {
    switch (field?.type) {
      case 'number':
      case 'currency':
        return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'];
      case 'date':
      case 'datetime':
        return ['before', 'after', 'isEmpty', 'isNotEmpty'];
      case 'select':
      case 'radio':
        return ['eq', 'ne', 'isEmpty', 'isNotEmpty'];
      case 'checkbox':
        return field.options?.length ? ['contains', 'isEmpty', 'isNotEmpty'] : ['eq'];
      case 'table':
        return ['isEmpty', 'isNotEmpty'];
      default:
        return ['eq', 'ne', 'contains', 'isEmpty', 'isNotEmpty'];
    }
  })();
  return ops.map((op) => ({ op, label: LABELS[op] }));
}

/** A starting value that makes the comparison valid straight away. */
export function defaultValue(field: FormField | undefined, op: Operator): unknown {
  if (!needsValue(op) || !field) {
    return undefined;
  }
  switch (field.type) {
    case 'number':
    case 'currency':
      return 0;
    case 'date':
    case 'datetime':
      return new Date().toISOString().slice(0, 10);
    case 'checkbox':
      return field.options?.length ? field.options[0].value : true;
    case 'select':
    case 'radio':
      return field.options?.[0]?.value ?? '';
    default:
      return '';
  }
}

function toRow(node: unknown, prefix: string): RuleRow | null {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    return null;
  }
  const compare = node as Record<string, unknown>;
  if (!Object.keys(compare).every((k) => k === 'var' || k === 'op' || k === 'value')) {
    return null;
  }
  const variable = compare['var'];
  if (typeof variable !== 'string' || !variable.startsWith(prefix) || variable.length === prefix.length
    || typeof compare['op'] !== 'string' || !(compare['op'] in LABELS)) {
    return null;
  }
  const row: RuleRow = { field: variable.slice(prefix.length), op: compare['op'] as Operator };
  if ('value' in compare) {
    row.value = compare['value'];
  }
  return row;
}
