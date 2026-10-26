import { FormDefinition, FormField } from './form.models';
import { columnsOf, effectiveSpan, gridClass, layoutOf, spanClass } from './form-layout';

const field = (patch: Partial<FormField> = {}): FormField => ({ key: 'a', type: 'text', label: 'A', ...patch });

describe('form layout', () => {
  it('puts fields in no known section first, then each section in order', () => {
    const definition: FormDefinition = {
      sections: [{ id: 'one', title: 'One', columns: 2 }, { id: 'two', title: 'Two' }],
      fields: [
        field({ key: 'a', section: 'two' }), field({ key: 'b', section: 'gone' }),
        field({ key: 'c', section: 'one' }), field({ key: 'd' }),
      ],
    };

    expect(layoutOf(definition).map((s) => [s.id, s.columns, s.real, s.fields.map((f) => f.key)])).toEqual([
      ['', 1, false, ['b', 'd']],
      ['one', 2, true, ['c']],
      ['two', 1, true, ['a']],
    ]);
    expect(layoutOf({ fields: [] })).toEqual([]);
  });

  it('a field takes one column unless it is a wide type or says otherwise', () => {
    expect(effectiveSpan(field(), 3)).toBe(1);
    expect(effectiveSpan(field({ type: 'textarea' }), 3)).toBe(3);
    expect(effectiveSpan(field({ type: 'heading' }), 2)).toBe(2);
    expect(effectiveSpan(field({ span: 2 }), 3)).toBe(2);
    expect(effectiveSpan(field({ type: 'table', span: 1 }), 3)).toBe(1);
  });

  it('a width larger than the section is the full width', () => {
    expect(effectiveSpan(field({ span: 4 }), 2)).toBe(2);
    expect(effectiveSpan(field({ span: 3 }), 1)).toBe(1);
  });

  it('a stored width that is not a whole number of columns is ignored', () => {
    for (const span of [0, -1, 2.5, '2', null, Number.NaN]) {
      expect(effectiveSpan(field({ span: span as number }), 3)).toBe(1);
      expect(effectiveSpan(field({ type: 'file', span: span as number }), 3)).toBe(3);
    }
  });

  it('a section has 1 to 4 columns whatever was stored', () => {
    expect([undefined, 0, -2, 2.5, '3', 1, 4, 9].map(columnsOf)).toEqual([1, 1, 1, 1, 1, 1, 4, 4]);
  });

  it('names the grid and width classes in full', () => {
    expect(gridClass(1)).toBe('grid gap-4');
    expect(gridClass(2)).toBe('grid gap-4 md:grid-cols-2');
    expect(gridClass(4)).toBe('grid gap-4 md:grid-cols-4');
    expect(gridClass(9)).toBe('grid gap-4 md:grid-cols-4');
    expect([1, 2, 3, 4].map(spanClass)).toEqual(['md:col-span-1', 'md:col-span-2', 'md:col-span-3', 'md:col-span-4']);
    expect(spanClass(7)).toBe('');
  });
});
