import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { DesignCanvas } from './design-canvas';
import { FormDefinition } from '../../../core/forms/form.models';
import { ToastService } from '../../../core/ui/toast.service';
import { FormEditorPage } from './form-editor';
import { unsavedChangesGuard } from './unsaved-changes.guard';

const claim: FormDefinition = {
  sections: [{ id: 'claim', title: 'Claim', columns: 2 }],
  fields: [
    { key: 'amount', type: 'currency', label: 'Amount', section: 'claim' },
    { key: 'justification', type: 'textarea', label: 'Justification', section: 'claim',
      visibleWhen: { var: 'form.amount', op: 'gt', value: 10000 } },
    { key: 'lines', type: 'table', label: 'Lines', section: 'claim', columns: [{ key: 'cost', type: 'text', label: 'Cost' }] },
  ],
};

describe('FormEditorPage', () => {
  function setup(name?: string) {
    TestBed.configureTestingModule({
      imports: [FormEditorPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(FormEditorPage);
    fixture.componentRef.setInput('key', 'expense-claim');
    if (name) {
      fixture.componentRef.setInput('name', name);
    }
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const controller = TestBed.inject(HttpTestingController);
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const toasts = () => TestBed.inject(ToastService).toasts().map((t) => t.message);
    return { fixture, element, controller, el, toasts, page: fixture.componentInstance };
  }

  async function loadDraft(s: ReturnType<typeof setup>, definition = claim) {
    s.controller.expectOne('/api/forms/definitions/expense-claim/draft')
      .flush({ key: 'expense-claim', name: 'Expense claim', definition, updatedAt: '2026-09-25T10:00:00Z', updatedBy: 'bob' });
    await s.fixture.whenStable();
  }

  it('loads the draft and lays out its sections and fields', async () => {
    const s = setup();
    await loadDraft(s);

    // Section titles are editable in place.
    expect((s.element.querySelector('input[aria-label="Section title"]') as HTMLInputElement).value).toBe('Claim');
    expect(s.element.querySelectorAll('[data-testid="canvas-field"]').length).toBe(3);
    expect(s.page.hasUnsavedChanges()).toBe(false);
  });

  it('adds a field from the palette, edits it and saves the draft', async () => {
    const s = setup();
    await loadDraft(s);

    s.el<HTMLButtonElement>('palette-text').click();
    await s.fixture.whenStable();
    const label = s.el<HTMLInputElement>('prop-label');
    label.value = 'Purpose';
    label.dispatchEvent(new Event('input'));
    await s.fixture.whenStable();
    expect(s.page.hasUnsavedChanges()).toBe(true);
    s.el<HTMLButtonElement>('save').click();

    const save = s.controller.expectOne({ method: 'PUT', url: '/api/forms/definitions/expense-claim/draft' });
    expect(save.request.body.name).toBe('Expense claim');
    expect(save.request.body.definition.fields[3]).toEqual({ key: 'text1', type: 'text', label: 'Purpose', section: 'claim' });
    save.flush({});
    await s.fixture.whenStable();
    expect(s.page.hasUnsavedChanges()).toBe(false);
    expect(s.toasts()).toContain('Draft saved');
  });

  it('puts new fields in a section just added, and in whichever section is picked after that', async () => {
    const s = setup();
    await loadDraft(s);
    const sections = () => [...s.element.querySelectorAll('[data-testid="canvas-section"]')];
    const fieldsIn = (index: number) => sections()[index].querySelectorAll('[data-testid="canvas-field"]').length;

    s.el<HTMLButtonElement>('add-section').click();
    await s.fixture.whenStable();
    expect(sections()[1].textContent).toContain('New fields go here');
    s.el<HTMLButtonElement>('palette-text').click();
    await s.fixture.whenStable();
    expect(fieldsIn(0)).toBe(3);
    expect(fieldsIn(1)).toBe(1);

    // An existing section is reached the same way, without selecting one of its fields.
    s.el<HTMLButtonElement>('pick-claim').click();
    await s.fixture.whenStable();
    expect(sections()[0].textContent).toContain('New fields go here');
    s.el<HTMLButtonElement>('palette-number').click();
    await s.fixture.whenStable();
    expect(fieldsIn(0)).toBe(4);
    expect(fieldsIn(1)).toBe(1);

    // Selecting a field still sends the next one to that field's section.
    s.el<HTMLButtonElement>('select-text1').click();
    await s.fixture.whenStable();
    s.el<HTMLButtonElement>('palette-date').click();
    await s.fixture.whenStable();
    expect(fieldsIn(1)).toBe(2);
  });

  it('starts from the latest published version when there is no draft', async () => {
    const s = setup();
    s.controller.expectOne('/api/forms/definitions/expense-claim/draft').flush(null, { status: 404, statusText: 'Not Found' });
    s.controller.expectOne('/api/forms/definitions/expense-claim/versions')
      .flush([{ version: 3, status: 'PUBLISHED', publishedAt: 'x' }, { version: 2, status: 'PUBLISHED', publishedAt: 'x' }]);
    s.controller.expectOne('/api/forms/definitions/expense-claim/versions/3')
      .flush({ key: 'expense-claim', version: 3, name: 'Expense claim', status: 'PUBLISHED', definition: claim });
    await s.fixture.whenStable();

    expect(s.element.textContent).toContain('copy of version 3');
    expect(s.element.querySelectorAll('[data-testid="canvas-field"]').length).toBe(3);
  });

  it('starts an empty form when the key is new', async () => {
    const s = setup('Travel request');
    s.controller.expectOne('/api/forms/definitions/expense-claim/draft').flush(null, { status: 404, statusText: 'Not Found' });
    s.controller.expectOne('/api/forms/definitions/expense-claim/versions').flush([]);
    await s.fixture.whenStable();

    expect(s.el<HTMLInputElement>('form-name').value).toBe('Travel request');
    expect(s.page.hasUnsavedChanges()).toBe(true);
  });

  it('lists the problems form-service finds and selects the field of each', async () => {
    const s = setup();
    await loadDraft(s);

    s.el<HTMLButtonElement>('check').click();
    s.controller.expectOne('/api/forms/definitions/expense-claim/validate').flush({
      valid: false, errors: [{ field: 'lines.cost', code: 'TOTAL_INVALID', message: 'Only number or currency columns can be totalled' }],
    });
    await s.fixture.whenStable();

    const problem = s.el<HTMLButtonElement>('problem-0');
    expect(problem.textContent).toContain('Only number or currency columns');
    problem.click();
    await s.fixture.whenStable();
    expect(s.el<HTMLInputElement>('prop-key').value).toBe('lines');
  });

  it('publishing saves unsaved changes first, then publishes', async () => {
    const s = setup();
    await loadDraft(s);
    const name = s.el<HTMLInputElement>('form-name');
    name.value = 'Expense claim (2026)';
    name.dispatchEvent(new Event('input'));
    await s.fixture.whenStable();

    s.el<HTMLButtonElement>('publish').click();
    const save = s.controller.expectOne({ method: 'PUT', url: '/api/forms/definitions/expense-claim/draft' });
    expect(save.request.body.name).toBe('Expense claim (2026)');
    save.flush({});
    s.controller.expectOne({ method: 'POST', url: '/api/forms/definitions/expense-claim/publish' })
      .flush({ id: 'x', key: 'expense-claim', version: 4, name: 'Expense claim (2026)', publishedAt: 'x' });
    await s.fixture.whenStable();

    expect(s.toasts()).toContain('Published version 4');
  });

  it('a refused publish shows why', async () => {
    const s = setup();
    await loadDraft(s);

    s.el<HTMLButtonElement>('publish').click();
    s.controller.expectOne('/api/forms/definitions/expense-claim/publish').flush(
      { code: 'FORM_DEFINITION_INVALID', errors: [{ field: 'amount', code: 'LABEL_MISSING', message: 'Every field needs a label' }] },
      { status: 400, statusText: 'Bad Request' });
    await s.fixture.whenStable();

    expect(s.el<HTMLButtonElement>('problem-0').textContent).toContain('Every field needs a label');
  });

  it('deleting a field removes the rules that used it and says so', async () => {
    const s = setup();
    await loadDraft(s);

    s.el<HTMLButtonElement>('delete-amount').click();
    await s.fixture.whenStable();

    expect(s.element.textContent).toContain('Removed the rules of Justification');
    expect(s.element.querySelectorAll('[data-testid="canvas-field"]').length).toBe(2);
  });

  it('asks before leaving with unsaved changes', async () => {
    const s = setup();
    await loadDraft(s);
    const guard = (page: FormEditorPage) =>
      TestBed.runInInjectionContext(() => unsavedChangesGuard(page, null!, null!, null!));
    expect(guard(s.page)).toBe(true);

    s.el<HTMLButtonElement>('palette-number').click();
    await s.fixture.whenStable();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    expect(guard(s.page)).toBe(false);
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('previews the form with the real renderer', async () => {
    const s = setup();
    await loadDraft(s);

    s.el<HTMLButtonElement>('toggle-preview').click();
    await s.fixture.whenStable();

    expect(s.element.querySelector('app-form-renderer #f-amount')).not.toBeNull();
  });

  it('refuses a move that would put a rule below the field it uses, and says why', async () => {
    const s = setup();
    await loadDraft(s);

    (s.element.querySelector('[aria-label="Move Amount down"]') as HTMLButtonElement).click();
    await s.fixture.whenStable();

    expect(s.element.textContent).toContain('Justification');
    expect(Array.from(s.element.querySelectorAll('[data-testid="canvas-field"]')).map((li) => li.textContent)[0]).toContain('Amount');
    expect(s.page.hasUnsavedChanges()).toBe(false);
  });

  it('renaming an option value keeps the rules that use it', async () => {
    const s = setup();
    await loadDraft(s, {
      fields: [
        { key: 'type', type: 'select', label: 'Type', options: [{ value: 'option1', label: 'Travel' }] },
        { key: 'extra', type: 'text', label: 'Extra', visibleWhen: { var: 'form.type', op: 'eq', value: 'option1' } },
      ],
    });
    s.el<HTMLButtonElement>('select-type').click();
    await s.fixture.whenStable();

    const value = s.el<HTMLInputElement>('option-value-0');
    value.value = 'travel';
    value.dispatchEvent(new Event('input'));
    await s.fixture.whenStable();
    s.el<HTMLButtonElement>('save').click();

    const saved = s.controller.expectOne({ method: 'PUT', url: '/api/forms/definitions/expense-claim/draft' }).request.body;
    expect(saved.definition.fields[1].visibleWhen).toEqual({ var: 'form.type', op: 'eq', value: 'travel' });
  });

  it('changes a field\'s width from the properties panel', async () => {
    const s = setup();
    await loadDraft(s);
    s.el<HTMLButtonElement>('select-amount').click();
    await s.fixture.whenStable();

    const width = s.el<HTMLSelectElement>('prop-span');
    width.value = '2';
    width.dispatchEvent(new Event('change'));
    await s.fixture.whenStable();

    expect(s.page.hasUnsavedChanges()).toBe(true);
    s.el<HTMLButtonElement>('save').click();
    const saved = s.controller.expectOne({ method: 'PUT', url: '/api/forms/definitions/expense-claim/draft' }).request.body;
    expect(saved.definition.fields[0]).toMatchObject({ key: 'amount', span: 2 });
  });

  const canvasOf = (s: ReturnType<typeof setup>) => s.fixture.debugElement.query(By.directive(DesignCanvas));
  const labels = (s: ReturnType<typeof setup>) =>
    [...s.element.querySelectorAll('[data-testid="canvas-field"]')].map((tile) => tile.querySelector('label')?.textContent?.trim());

  it('moves a field to where it was dropped', async () => {
    const s = setup();
    await loadDraft(s);

    canvasOf(s).triggerEventHandler('fieldPlace', { key: 'lines', section: 'claim', index: 0 });
    await s.fixture.whenStable();

    expect(labels(s)).toEqual(['Lines', 'Amount', 'Justification']);
    expect(s.page.hasUnsavedChanges()).toBe(true);
    expect(s.el<HTMLInputElement>('prop-key').value).toBe('lines');
  });

  it('refuses a drop that would put a rule above the field it uses', async () => {
    const s = setup();
    await loadDraft(s);

    canvasOf(s).triggerEventHandler('fieldPlace', { key: 'amount', section: 'claim', index: 2 });
    await s.fixture.whenStable();

    expect(s.element.textContent).toContain("Can't move it there");
    expect(labels(s)).toEqual(['Amount', 'Justification', 'Lines']);
    expect(s.page.hasUnsavedChanges()).toBe(false);
  });

  it('adds a field where a palette item was dropped, and selects it', async () => {
    const s = setup();
    await loadDraft(s);

    canvasOf(s).triggerEventHandler('fieldAdd', { type: 'date', section: 'claim', index: 1 });
    await s.fixture.whenStable();

    expect(labels(s)).toEqual(['Amount', 'Date', 'Justification', 'Lines']);
    expect(s.el<HTMLInputElement>('prop-key').value).toBe('date1');
    expect(s.page.hasUnsavedChanges()).toBe(true);
  });

  it('a field resized on the canvas keeps that width', async () => {
    const s = setup();
    await loadDraft(s);

    canvasOf(s).triggerEventHandler('fieldSpan', { key: 'amount', span: 2 });
    await s.fixture.whenStable();

    const tile = s.el('select-amount').closest('[data-testid="canvas-field"]') as HTMLElement;
    expect(tile.className).toContain('md:col-span-2');
    expect(s.page.hasUnsavedChanges()).toBe(true);
  });

  it('refuses a palette drop that would break a rule in a form stored in another order than it is drawn', async () => {
    const s = setup();
    // "b" is drawn first (its section comes first) but stored after "a", whose value its rule uses.
    await loadDraft(s, {
      sections: [{ id: 'top', title: 'Top', columns: 2 }, { id: 'rest', title: 'Rest', columns: 1 }],
      fields: [
        { key: 'a', type: 'text', label: 'A', section: 'rest' },
        { key: 'b', type: 'text', label: 'B', section: 'top', visibleWhen: { var: 'form.a', op: 'isNotEmpty' } },
      ],
    });

    canvasOf(s).triggerEventHandler('fieldAdd', { type: 'date', section: 'rest', index: 0 });
    await s.fixture.whenStable();

    expect(s.element.textContent).toContain("Can't add it there");
    expect(s.element.querySelectorAll('[data-testid="canvas-field"]').length).toBe(2);
    expect(s.page.hasUnsavedChanges()).toBe(false);
  });
});
