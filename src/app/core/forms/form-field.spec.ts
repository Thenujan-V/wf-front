import { TestBed } from '@angular/core/testing';
import { FieldError, FormField } from './form.models';
import { FormFieldView } from './form-field';

const lines: FormField = {
  key: 'lines', type: 'table', label: 'Lines', totals: ['cost'],
  columns: [{ key: 'what', type: 'text', label: 'What' }, { key: 'cost', type: 'currency', label: 'Cost' }],
};

describe('FormFieldView', () => {
  function render(field: FormField, inputs: { value?: unknown; readOnly?: boolean; errors?: FieldError[]; design?: boolean } = {}) {
    TestBed.configureTestingModule({ imports: [FormFieldView] });
    const fixture = TestBed.createComponent(FormFieldView);
    fixture.componentRef.setInput('field', field);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    const changes: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe((value) => changes.push(value));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, changes };
  }

  it('draws the label, the control, the help text and the field\'s own problem', () => {
    const { element } = render(
      { key: 'amount', type: 'currency', label: 'Amount', help: 'In rupees', required: true },
      { value: 12.5, errors: [{ field: 'amount', code: 'MIN', message: 'Too small' }, { field: 'other', code: 'X', message: 'Not mine' }] });

    expect(element.querySelector('label')?.textContent).toContain('Amount');
    expect(element.querySelector('label')?.textContent).toContain('*');
    expect((element.querySelector('#f-amount') as HTMLInputElement).value).toBe('12.5');
    expect(element.textContent).toContain('In rupees');
    expect(element.textContent).toContain('Too small');
    expect(element.textContent).not.toContain('Not mine');
  });

  it('reports what is typed, as the right kind of value', () => {
    const { element, changes } = render({ key: 'amount', type: 'currency', label: 'Amount' });
    const input = element.querySelector('#f-amount') as HTMLInputElement;

    input.value = '99.5';
    input.dispatchEvent(new Event('input'));

    expect(changes).toEqual([99.5]);
  });

  it('edits a table\'s rows and totals a column', async () => {
    const { fixture, element, changes } = render(lines, { value: [{ what: 'Taxi', cost: 10 }, { what: 'Lunch', cost: 5 }] });

    expect(element.querySelector('[data-testid="total-lines-cost"]')?.textContent).toContain('15');
    const cost = element.querySelector('#f-lines-1-cost') as HTMLInputElement;
    cost.value = '7';
    cost.dispatchEvent(new Event('input'));
    (element.querySelector('[data-testid="add-row-lines"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(changes[0]).toEqual([{ what: 'Taxi', cost: 10 }, { what: 'Lunch', cost: 7 }]);
    expect(changes[1]).toEqual([{ what: 'Taxi', cost: 10 }, { what: 'Lunch', cost: 7 }, {}]);
  });

  it('changes made before the owner hands the value back build on each other', () => {
    const { element, changes } = render(lines, { value: [] });
    const add = element.querySelector('[data-testid="add-row-lines"]') as HTMLButtonElement;

    add.click();
    add.click();

    expect(changes).toEqual([[{}], [{}, {}]]);
  });

  it('a read-only field is disabled and loses its required mark', () => {
    const { element } = render({ key: 'amount', type: 'currency', label: 'Amount', required: true }, { readOnly: true, value: 3 });

    expect((element.querySelector('#f-amount') as HTMLInputElement).disabled).toBe(true);
    expect(element.querySelector('label')?.textContent).not.toContain('*');
  });

  it('in design mode shows the control as it will look but lets nothing change', () => {
    const { element, changes } = render({ key: 'amount', type: 'currency', label: 'Amount', required: true }, { design: true });
    const input = element.querySelector('#f-amount') as HTMLInputElement;

    expect(input.disabled).toBe(true);
    // Unlike a read-only field, the designer still sees that it is required.
    expect(element.querySelector('label')?.textContent).toContain('*');
    expect(changes).toEqual([]);
  });

  it('in design mode a table shows one empty row and no way to add another', () => {
    const { element } = render(lines, { design: true });

    expect(element.querySelectorAll('tbody tr').length).toBe(1);
    expect((element.querySelector('#f-lines-0-what') as HTMLInputElement).disabled).toBe(true);
    expect(element.querySelector('[data-testid="add-row-lines"]')).toBeNull();
    expect(element.querySelector('[aria-label="Remove row"]')).toBeNull();
  });

  it('in design mode person and file fields are drawn without their pickers', () => {
    const person = render({ key: 'who', type: 'user', label: 'Who' }, { design: true });
    expect(person.element.querySelector('app-user-picker')).toBeNull();
    expect((person.element.querySelector('#f-who') as HTMLInputElement).disabled).toBe(true);

    TestBed.resetTestingModule();
    const files = render({ key: 'docs', type: 'file', label: 'Docs' }, { design: true });
    expect(files.element.querySelector('app-file-field')).toBeNull();
    expect(files.element.textContent).toContain('Add files');
  });

  it('headings and text for the reader show only their label', () => {
    const { element } = render({ key: 'h', type: 'heading', label: 'Receipts' });

    expect(element.querySelector('h3')?.textContent).toBe('Receipts');
    expect(element.querySelector('label')).toBeNull();
  });
});
