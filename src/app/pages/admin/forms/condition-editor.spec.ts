import { TestBed } from '@angular/core/testing';
import { FormField } from '../../../core/forms/form.models';
import { ConditionEditor } from './condition-editor';

const fields: FormField[] = [
  { key: 'amount', type: 'currency', label: 'Amount' },
  { key: 'category', type: 'select', label: 'Category', options: [{ value: 'travel', label: 'Travel' }, { value: 'meals', label: 'Meals' }] },
];

describe('ConditionEditor', () => {
  function render(condition: unknown, available = fields) {
    TestBed.configureTestingModule({ imports: [ConditionEditor] });
    const fixture = TestBed.createComponent(ConditionEditor);
    fixture.componentRef.setInput('label', 'Show this field only when');
    fixture.componentRef.setInput('testId', 'visible');
    fixture.componentRef.setInput('fields', available);
    fixture.componentRef.setInput('condition', condition);
    const emitted: unknown[] = [];
    fixture.componentInstance.conditionChange.subscribe((c) => emitted.push(c));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const all = (id: string) => Array.from(element.querySelectorAll(`[data-testid="${id}"]`)) as HTMLSelectElement[];
    return { fixture, element, emitted, all };
  }

  it('adds a condition on the first field above', () => {
    const { element, emitted } = render(undefined);
    expect(element.textContent).toContain('Always');

    (element.querySelector('[data-testid="rule-add"]') as HTMLButtonElement).click();

    expect(emitted).toEqual([{ var: 'form.amount', op: 'eq', value: 0 }]);
  });

  it('only offers the fields above and changes operator and value', () => {
    const { all, emitted } = render({ var: 'form.category', op: 'eq', value: 'travel' });
    expect(Array.from(all('rule-field')[0].options).map((o) => o.value)).toEqual(['amount', 'category']);

    const value = all('rule-value')[0];
    value.value = 'meals';
    value.dispatchEvent(new Event('change'));
    const op = all('rule-op')[0];
    op.value = 'isEmpty';
    op.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([
      { var: 'form.category', op: 'eq', value: 'meals' },
      { var: 'form.category', op: 'isEmpty' },
    ]);
  });

  it('removing the last condition removes the rule', () => {
    const { element, emitted } = render({ var: 'form.amount', op: 'gt', value: 5 });

    (element.querySelector('[aria-label="Remove condition"]') as HTMLButtonElement).click();

    expect(emitted).toEqual([undefined]);
  });

  it('keeps hand-written rules but lets them be removed', () => {
    const { element, emitted } = render({ not: { var: 'form.amount', op: 'isEmpty' } });
    expect(element.textContent).toContain('written by hand');

    (element.querySelector('[data-testid="rule-clear"]') as HTMLButtonElement).click();

    expect(emitted).toEqual([undefined]);
  });

  it('explains when no field above can be used', () => {
    const { element } = render(undefined, []);
    expect(element.querySelector('[data-testid="rule-add"]')).toBeNull();
    expect(element.textContent).toContain('fields above this one');
  });

  it('shows a rule value that is no longer one of the options instead of hiding it', () => {
    const { all } = render({ var: 'form.category', op: 'eq', value: 'books' });

    const value = all('rule-value')[0];
    expect(value.options[value.selectedIndex].textContent).toContain('books');
  });
});
