import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormDefinition } from './form.models';
import { FormRenderer } from './form-renderer';
import { Subject } from 'rxjs';
import { DocumentView } from '../documents/document.models';
import { UploadEvent, Uploader } from '../documents/uploader';

const claim: FormDefinition = {
  sections: [{ id: 'claim', title: 'Claim', columns: 2 }],
  fields: [
    { key: 'amount', type: 'currency', label: 'Amount', section: 'claim', required: true, min: 1 },
    { key: 'category', type: 'select', label: 'Category', section: 'claim', required: true,
      options: [{ value: 'travel', label: 'Travel' }, { value: 'meals', label: 'Meals' }] },
    { key: 'justification', type: 'textarea', label: 'Why so much?', required: true,
      visibleWhen: { var: 'form.amount', op: 'gt', value: 10000 } },
    { key: 'itemsHeading', type: 'heading', label: 'Receipts' },
    { key: 'lines', type: 'table', label: 'Receipts', totals: ['cost'],
      columns: [
        { key: 'description', type: 'text', label: 'Description', required: true },
        { key: 'cost', type: 'currency', label: 'Cost', required: true },
      ] },
  ],
};

describe('FormRenderer', () => {
  function render(options: { access?: Record<string, 'EDITABLE' | 'READONLY' | 'HIDDEN'>; initial?: Record<string, unknown> } = {}) {
    TestBed.configureTestingModule({ imports: [FormRenderer], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(FormRenderer);
    fixture.componentRef.setInput('definition', claim);
    fixture.componentRef.setInput('access', options.access ?? {});
    fixture.componentRef.setInput('initial', options.initial ?? {});
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const input = (key: string) => element.querySelector(`#f-${key}`) as HTMLInputElement;
    const type = async (key: string, value: string) => {
      const el = input(key);
      el.value = value;
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input'));
      await fixture.whenStable();
    };
    return { fixture, element, input, type, renderer: fixture.componentInstance };
  }

  it('lays out sections and shows headings', () => {
    const { element } = render();

    expect(element.querySelector('fieldset legend')?.textContent).toContain('Claim');
    expect(element.textContent).toContain('Receipts');
    expect(element.querySelector('#f-justification')).toBeNull();
  });

  it('shows a field when its rule says so', async () => {
    const { element, type } = render();

    await type('amount', '20000');

    expect(element.querySelector('#f-justification')).not.toBeNull();
  });

  it('reports problems only after a submit attempt, and returns clean editable values', async () => {
    const { element, fixture, renderer, type } = render();
    expect(element.textContent).not.toContain('is required');

    expect(renderer.submit()).toBeNull();
    await fixture.whenStable();
    expect(element.textContent).toContain('Amount is required');

    await type('amount', '120.5');
    await type('category', 'meals');
    expect(renderer.submit()).toEqual({ amount: 120.5, category: 'meals' });
  });

  it('shows read-only values disabled, leaves hidden fields out, and never submits them', async () => {
    const { element, input, renderer, type } = render({
      access: { amount: 'READONLY', justification: 'HIDDEN' },
      initial: { amount: 20000, justification: 'secret' },
    });

    expect(input('amount').disabled).toBe(true);
    expect(input('amount').value).toBe('20000');
    expect(element.querySelector('#f-justification')).toBeNull();
    await type('category', 'travel');
    expect(renderer.submit()).toEqual({ category: 'travel' });
  });

  it('edits table rows and totals a column', async () => {
    const { element, fixture, renderer, type } = render();
    await type('amount', '50');
    await type('category', 'travel');

    (element.querySelector('[data-testid="add-row-lines"]') as HTMLButtonElement).click();
    (element.querySelector('[data-testid="add-row-lines"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    await type('lines-0-description', 'Taxi');
    await type('lines-0-cost', '12.25');
    await type('lines-1-description', 'Bus');
    await type('lines-1-cost', '2');

    expect(element.querySelector('[data-testid="total-lines-cost"]')?.textContent).toContain('14.25');
    expect(renderer.submit()).toEqual({
      amount: 50, category: 'travel',
      lines: [{ description: 'Taxi', cost: 12.25 }, { description: 'Bus', cost: 2 }],
    });
  });

  it('shows errors from the server next to their field', async () => {
    const { element, fixture } = render();
    fixture.componentRef.setInput('serverErrors', [{ field: 'category', code: 'NOT_AN_OPTION', message: 'Pick a category' }]);
    await fixture.whenStable();

    expect(element.querySelector('#e-category')?.textContent).toContain('Pick a category');
  });
});

describe('FormRenderer file fields', () => {
  const form: FormDefinition = {
    sections: [],
    fields: [
      { key: 'purpose', type: 'text', label: 'Purpose' },
      { key: 'receipts', type: 'file', label: 'Receipts', required: true },
    ],
  };

  function render(initial: Record<string, unknown> = {}, access: Record<string, 'EDITABLE' | 'READONLY' | 'HIDDEN'> = {}) {
    const uploads: Subject<UploadEvent>[] = [];
    TestBed.configureTestingModule({
      imports: [FormRenderer],
      providers: [{ provide: Uploader, useValue: { upload: () => {
        const events = new Subject<UploadEvent>();
        uploads.push(events);
        return events;
      } } }],
    });
    const fixture = TestBed.createComponent(FormRenderer);
    fixture.componentRef.setInput('definition', form);
    fixture.componentRef.setInput('access', access);
    fixture.componentRef.setInput('initial', initial);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const choose = (name: string) => {
      const input = element.querySelector('[data-testid="file-input"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [new File(['x'], name)], configurable: true });
      input.dispatchEvent(new Event('change'));
    };
    return { fixture, element, choose, uploads, renderer: fixture.componentInstance };
  }

  it('submits the uploaded files as references', async () => {
    const s = render();
    s.choose('Taxi.pdf');
    s.uploads[0].next({ stage: 'done', document: { id: 'd1', name: 'Taxi.pdf' } as DocumentView });
    await s.fixture.whenStable();

    expect(s.renderer.submit()).toEqual({ receipts: [{ documentId: 'd1', name: 'Taxi.pdf' }] });
  });

  it('asks to wait while a file is still uploading', async () => {
    const s = render({ receipts: [{ documentId: 'd0', name: 'Earlier.pdf' }] });
    s.choose('Taxi.pdf');
    s.uploads[0].next({ stage: 'sending', percent: 40 });
    await s.fixture.whenStable();

    expect(s.renderer.submit()).toBeNull();
    await s.fixture.whenStable();
    expect(s.element.textContent).toContain('Wait for the files to finish uploading');
  });

  it('shows the files of an earlier step read-only', () => {
    const s = render({ receipts: [{ documentId: 'd1', name: 'Taxi.pdf' }] }, { receipts: 'READONLY' });

    expect(s.element.querySelector('[data-testid="file-ref"] a')!.getAttribute('href')).toBe('/documents/d1');
    expect(s.element.querySelector('[data-testid="file-input"]')).toBeNull();
  });
});

describe('FormRenderer file fields that a rule hides', () => {
  const form: FormDefinition = {
    sections: [],
    fields: [
      { key: 'category', type: 'select', label: 'Category', options: [{ value: 'travel', label: 'Travel' }, { value: 'meals', label: 'Meals' }] },
      { key: 'receipts', type: 'file', label: 'Receipts', visibleWhen: { var: 'form.category', op: 'eq', value: 'travel' } },
    ],
  };

  it('can still be submitted after a file field is hidden while its upload was running', async () => {
    const uploads: Subject<UploadEvent>[] = [];
    TestBed.configureTestingModule({
      imports: [FormRenderer],
      providers: [{ provide: Uploader, useValue: { upload: () => {
        const events = new Subject<UploadEvent>();
        uploads.push(events);
        return events;
      } } }],
    });
    const fixture = TestBed.createComponent(FormRenderer);
    fixture.componentRef.setInput('definition', form);
    fixture.componentRef.setInput('initial', { category: 'travel' });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector('[data-testid="file-input"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'Taxi.pdf')], configurable: true });
    input.dispatchEvent(new Event('change'));
    uploads[0].next({ stage: 'sending', percent: 40 });
    await fixture.whenStable();

    const category = element.querySelector('#f-category') as HTMLSelectElement;
    category.value = 'meals';
    category.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(fixture.componentInstance.submit()).toEqual({ category: 'meals' });

    category.value = 'travel';
    category.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(fixture.componentInstance.submit()).toEqual({ category: 'travel' });
  });

  it('gives each field the width its definition asks for', () => {
    TestBed.configureTestingModule({ imports: [FormRenderer], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(FormRenderer);
    fixture.componentRef.setInput('definition', {
      sections: [{ id: 'main', title: 'Main', columns: 4 }],
      fields: [
        { key: 'when', type: 'date', label: 'When', section: 'main' },
        { key: 'what', type: 'text', label: 'What', section: 'main', span: 3 },
        { key: 'why', type: 'textarea', label: 'Why', section: 'main' },
        { key: 'short', type: 'textarea', label: 'Short', section: 'main', span: 2 },
        { key: 'huge', type: 'text', label: 'Huge', section: 'main', span: 9 },
      ],
    } satisfies FormDefinition);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const cell = (key: string) => element.querySelector(`[data-field="${key}"]`) as HTMLElement;

    expect((cell('when').parentElement as HTMLElement).className).toContain('md:grid-cols-4');
    expect(cell('when').className).toContain('md:col-span-1');
    expect(cell('what').className).toContain('md:col-span-3');
    expect(cell('why').className).toContain('md:col-span-4');
    expect(cell('short').className).toContain('md:col-span-2');
    expect(cell('huge').className).toContain('md:col-span-4');
  });
});
