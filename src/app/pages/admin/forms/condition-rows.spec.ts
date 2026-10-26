import { FormField } from '../../../core/forms/form.models';
import { defaultValue, needsValue, operatorsFor, readRule, writeRule } from './condition-rows';

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
