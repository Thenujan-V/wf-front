import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NodeFormRef } from '../../../core/workflow/process.models';
import { FormCatalog } from './form-catalog';
import { FormSettings } from './form-settings';

describe('FormSettings', () => {
  function setup(formRef: NodeFormRef | undefined, withAccess = false) {
    TestBed.configureTestingModule({ imports: [FormSettings], providers: [FormCatalog, provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(FormSettings);
    fixture.componentRef.setInput('formRef', formRef);
    fixture.componentRef.setInput('withAccess', withAccess);
    const changes: (NodeFormRef | undefined)[] = [];
    fixture.componentInstance.formRefChange.subscribe((r) => changes.push(r));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const controller = TestBed.inject(HttpTestingController);
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const choose = (id: string, value: string) => {
      el<HTMLSelectElement>(id).value = value;
      el<HTMLSelectElement>(id).dispatchEvent(new Event('change'));
    };
    return { fixture, element, controller, el, choose, changes };
  }

  const summaries = [
    { key: 'expense-claim', name: 'Expense claim', latestVersion: 2, status: 'PUBLISHED', hasDraft: false, draftUpdatedAt: null },
    { key: 'finance-review', name: 'Finance review', latestVersion: 1, status: 'PUBLISHED', hasDraft: false, draftUpdatedAt: null },
  ];
  const review = {
    key: 'finance-review', version: 1, name: 'Finance review', status: 'PUBLISHED',
    definition: { fields: [{ key: 'amount', type: 'currency', label: 'Amount' }, { key: 'note', type: 'text', label: 'Note' }] },
  };

  it('picks a form at its latest version, and clears it', async () => {
    const s = setup(undefined);
    s.controller.expectOne('/api/forms/definitions').flush(summaries);
    await s.fixture.whenStable();

    s.choose('form-key', 'expense-claim');
    expect(s.changes.at(-1)).toEqual({ key: 'expense-claim', version: 2 });
    s.choose('form-key', '');
    expect(s.changes.at(-1)).toBeUndefined();
  });

  it('switches to another published version', async () => {
    const s = setup({ key: 'expense-claim', version: 1 });
    s.controller.expectOne('/api/forms/definitions').flush(summaries);
    s.controller.expectOne('/api/forms/definitions/expense-claim/versions').flush([
      { version: 2, status: 'PUBLISHED', publishedAt: '2026-09-25T10:00:00Z' },
      { version: 1, status: 'PUBLISHED', publishedAt: '2026-09-20T10:00:00Z' },
    ]);
    await s.fixture.whenStable();

    s.choose('form-version', '2');
    expect(s.changes.at(-1)).toEqual({ key: 'expense-claim', version: 2 });
  });

  it('sets per-field access for a task, storing only what is not editable', async () => {
    const s = setup({ key: 'finance-review', version: 1, access: { amount: 'READONLY' } }, true);
    s.controller.expectOne('/api/forms/definitions').flush(summaries);
    s.controller.expectOne('/api/forms/definitions/finance-review/versions').flush([{ version: 1, status: 'PUBLISHED', publishedAt: 'x' }]);
    s.controller.expectOne('/api/forms/definitions/finance-review/versions/1').flush(review);
    await s.fixture.whenStable();

    expect(s.el<HTMLSelectElement>('access-amount').value).toBe('READONLY');
    s.choose('access-note', 'HIDDEN');
    expect(s.changes.at(-1)).toEqual({ key: 'finance-review', version: 1, access: { amount: 'READONLY', note: 'HIDDEN' } });
    s.choose('access-amount', 'EDITABLE');
    expect(s.changes.at(-1)).toEqual({ key: 'finance-review', version: 1 });
  });

  it('shows access for fields the chosen version no longer has, so they can be removed', async () => {
    const s = setup({ key: 'finance-review', version: 1, access: { gone: 'HIDDEN' } }, true);
    s.controller.expectOne('/api/forms/definitions').flush(summaries);
    s.controller.expectOne('/api/forms/definitions/finance-review/versions').flush([{ version: 1, status: 'PUBLISHED', publishedAt: 'x' }]);
    s.controller.expectOne('/api/forms/definitions/finance-review/versions/1').flush(review);
    await s.fixture.whenStable();

    s.el<HTMLButtonElement>('access-stale-gone').click();
    expect(s.changes.at(-1)).toEqual({ key: 'finance-review', version: 1 });
  });

  it('says so when the chosen form version cannot be found', async () => {
    const s = setup({ key: 'old-form', version: 3 }, true);
    s.controller.expectOne('/api/forms/definitions').flush(summaries);
    s.controller.expectOne('/api/forms/definitions/old-form/versions').flush([]);
    s.controller.expectOne('/api/forms/definitions/old-form/versions/3').flush(null, { status: 404, statusText: 'Not Found' });
    await s.fixture.whenStable();

    expect(s.el('form-missing').textContent).toContain('Version 3 of old-form is not available');
    // The current choice stays visible even though it cannot be picked again.
    expect(s.el<HTMLSelectElement>('form-key').value).toBe('old-form');
  });
});
