import { TestBed } from '@angular/core/testing';
import { FormDefinition, FormField } from '../../../core/forms/form.models';
import { FieldProperties } from './field-properties';

const definition: FormDefinition = {
  sections: [{ id: 'claim', title: 'Claim', columns: 2 }],
  fields: [
    { key: 'amount', type: 'currency', label: 'Amount', section: 'claim' },
    { key: 'category', type: 'select', label: 'Category', section: 'claim', options: [{ value: 'a', label: 'A' }] },
    { key: 'lines', type: 'table', label: 'Lines', columns: [{ key: 'cost', type: 'currency', label: 'Cost' }] },
  ],
};

describe('FieldProperties', () => {
  function render(field: FormField) {
    TestBed.configureTestingModule({ imports: [FieldProperties] });
    const fixture = TestBed.createComponent(FieldProperties);
    fixture.componentRef.setInput('field', field);
    fixture.componentRef.setInput('definition', definition);
    const patches: Partial<FormField>[] = [];
    fixture.componentInstance.change.subscribe((p) => patches.push(p));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const type = (id: string, value: string, event = 'input') => {
      const input = el<HTMLInputElement>(id);
      input.value = value;
      input.dispatchEvent(new Event(event));
    };
    return { fixture, element, el, type, patches };
  }

  it('edits the label and number rules', () => {
    const { type, patches } = render(definition.fields[0]);

    type('prop-label', 'Total amount');
    type('prop-min', '1');
    type('prop-max', '');

    expect(patches).toEqual([{ label: 'Total amount' }, { min: 1 }, { max: undefined }]);
  });

  it('only accepts a valid, unused key', async () => {
    const { fixture, element, type, patches } = render(definition.fields[0]);

    type('prop-key', 'category', 'input');
    type('prop-key', 'category', 'change');
    await fixture.whenStable();
    expect(element.textContent).toContain('already used');
    type('prop-key', '9lives', 'input');
    type('prop-key', '9lives', 'change');
    await fixture.whenStable();
    expect(element.textContent).toContain('start with a letter');
    type('prop-key', 'total', 'input');
    type('prop-key', 'total', 'change');

    expect(patches).toEqual([{ key: 'total' }]);
  });

  it('edits options', () => {
    const { el, type, patches } = render(definition.fields[1]);

    type('option-label-0', 'Travel');
    el<HTMLButtonElement>('option-add').click();

    expect(patches).toEqual([
      { options: [{ value: 'a', label: 'Travel' }] },
      { options: [{ value: 'a', label: 'A' }, { value: 'option2', label: 'Option 2' }] },
    ]);
  });

  it('edits table columns and totals', () => {
    const { el, patches } = render(definition.fields[2]);

    el<HTMLInputElement>('column-total-0').click();
    el<HTMLButtonElement>('column-add').click();

    expect(patches[0]).toEqual({ totals: ['cost'] });
    expect(patches[1].columns?.[1]).toEqual({ key: 'column2', type: 'text', label: 'Column 2' });
  });

  it('offers rules built only from the fields above', () => {
    const { element } = render(definition.fields[1]);

    const fields = element.querySelector('[data-testid="rule-visible"]');
    expect(fields).not.toBeNull();
    expect(element.querySelector('[data-testid="rule-required"]')).not.toBeNull();
  });

  it('keeps totals in step with a column that is renamed or stops being numeric', () => {
    const { el, patches } = render({ ...definition.fields[2], totals: ['cost'] });

    const key = el<HTMLInputElement>('column-key-0');
    key.value = 'price';
    key.dispatchEvent(new Event('change'));
    const type = el<HTMLSelectElement>('column-type-0');
    type.value = 'text';
    type.dispatchEvent(new Event('change'));

    expect(patches).toContainEqual({ totals: ['price'] });
    expect(patches).toContainEqual({ totals: undefined });
  });

  it('offers the widths the field\'s section allows and reports the one chosen', () => {
    const { el, patches } = render(definition.fields[0]);
    const width = el<HTMLSelectElement>('prop-span');

    expect([...width.options].map((o) => o.textContent?.trim())).toEqual(['1 column', 'Full width']);
    expect(width.value).toBe('1');
    width.value = '2';
    width.dispatchEvent(new Event('change'));

    expect(patches).toEqual([{ span: 2 }]);
  });

  it('shows the width a field has, and no choice where there is only one column', () => {
    const wide = render({ ...definition.fields[0], span: 2 });
    expect(wide.el<HTMLSelectElement>('prop-span').value).toBe('2');

    TestBed.resetTestingModule();
    // "lines" is in no section, which is one column wide.
    expect(render(definition.fields[2]).el('prop-span')).toBeNull();
  });
});
