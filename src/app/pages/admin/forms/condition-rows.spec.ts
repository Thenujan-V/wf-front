import { FormField } from '../../../core/forms/form.models';
import { customTypeOf, defaultValue, needsValue, operatorsFor, readRule, writeRule } from './condition-rows';

const amount: FormField = { key: 'amount', type: 'currency', label: 'Amount' };
const agree: FormField = { key: 'agree', type: 'checkbox', label: 'Agree' };
const category: FormField = { key: 'category', type: 'select', label: 'Category', options: [{ value: 'travel', label: 'Travel' }] };

describe('condition rows', () => {
  it('reads plain comparisons and lists of them', () => {
    expect(readRule(undefined)).toEqual({ kind: 'none' });
    expect(readRule({ var: 'form.amount', op: 'gt', value: 10 }))
      .toEqual({ kind: 'rows', model: { mode: 'all', rows: [{ field: 'amount', op: 'gt', value: 10 }] } });
    expect(readRule({ any: [{ var: 'form.amount', op: 'isEmpty' }, { var: 'form.category', op: 'eq', value: 'travel' }] }))
      .toEqual({ kind: 'rows', model: { mode: 'any', rows: [
        { field: 'amount', op: 'isEmpty' }, { field: 'category', op: 'eq', value: 'travel' }] } });
  });

  it('treats anything else as a hand-written rule', () => {
    expect(readRule({ not: { var: 'form.amount', op: 'isEmpty' } })).toEqual({ kind: 'advanced' });
    expect(readRule({ var: 'initiator', op: 'isNotEmpty' })).toEqual({ kind: 'advanced' });
    expect(readRule({ all: [{ any: [] }] })).toEqual({ kind: 'advanced' });
  });

  it('writes the shared condition format', () => {
    expect(writeRule({ mode: 'all', rows: [] })).toBeUndefined();
    expect(writeRule({ mode: 'all', rows: [{ field: 'amount', op: 'isNotEmpty', value: 3 }] }))
      .toEqual({ var: 'form.amount', op: 'isNotEmpty' });
    expect(writeRule({ mode: 'any', rows: [{ field: 'amount', op: 'gt', value: 5 }, { field: 'agree', op: 'eq', value: true }] }))
      .toEqual({ any: [{ var: 'form.amount', op: 'gt', value: 5 }, { var: 'form.agree', op: 'eq', value: true }] });
  });

  it('reads and writes full variable paths with an empty prefix', () => {
    const outcome = { var: 'nodes.task1.outcome', op: 'eq', value: 'APPROVE' };
    const department = { var: 'requester.department', op: 'eq', value: 'Legal' };
    const read = readRule({ all: [outcome, department] }, '');
    expect(read).toEqual({ kind: 'rows', model: { mode: 'all', rows: [
      { field: 'nodes.task1.outcome', op: 'eq', value: 'APPROVE' }, { field: 'requester.department', op: 'eq', value: 'Legal' }] } });
    expect(writeRule(read.kind === 'rows' ? read.model : { mode: 'all', rows: [] }, '')).toEqual({ all: [outcome, department] });
    expect(readRule({ var: 'form.amount', op: 'gt', value: 1 }, ''))
      .toEqual({ kind: 'rows', model: { mode: 'all', rows: [{ field: 'form.amount', op: 'gt', value: 1 }] } });
  });

  it('reads back the type of a hand-named field from its comparison', () => {
    expect(customTypeOf({ field: 'form.amount', op: 'gt', value: 5 })).toBe('number');
    expect(customTypeOf({ field: 'form.amount', op: 'eq', value: 0 })).toBe('number');
    expect(customTypeOf({ field: 'form.urgent', op: 'eq', value: true })).toBe('checkbox');
    expect(customTypeOf({ field: 'form.due', op: 'before', value: '2026-01-01' })).toBe('date');
    expect(customTypeOf({ field: 'form.note', op: 'contains', value: 'x' })).toBe('text');
  });

  it('offers operators and starting values that fit the field', () => {
    expect(operatorsFor(amount).map((o) => o.op)).toContain('gt');
    expect(operatorsFor(agree).map((o) => o.op)).toEqual(['eq']);
    expect(operatorsFor(category).map((o) => o.op)).not.toContain('gt');
    expect(needsValue('isEmpty')).toBe(false);
    expect(defaultValue(amount, 'gt')).toBe(0);
    expect(defaultValue(agree, 'eq')).toBe(true);
    expect(defaultValue(category, 'eq')).toBe('travel');
  });
});
