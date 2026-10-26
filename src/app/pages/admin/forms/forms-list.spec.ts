import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FormsListPage } from './forms-list';

describe('FormsListPage', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [FormsListPage], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(FormsListPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const controller = TestBed.inject(HttpTestingController);
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const type = (id: string, value: string) => {
      el<HTMLInputElement>(id).value = value;
      el<HTMLInputElement>(id).dispatchEvent(new Event('input'));
    };
    return { fixture, element, controller, el, type };
  }

  const forms = [
    { key: 'expense-claim', name: 'Expense claim', latestVersion: 3, status: 'PUBLISHED', hasDraft: true, draftUpdatedAt: '2026-09-25T10:00:00Z' },
    { key: 'leave', name: 'Leave request', latestVersion: null, status: 'DRAFT', hasDraft: true, draftUpdatedAt: '2026-09-25T10:00:00Z' },
  ];

  it('lists forms with their state and links to the editor', async () => {
    const { fixture, element, controller } = setup();
    controller.expectOne('/api/forms/definitions').flush(forms);
    await fixture.whenStable();

    const rows = element.querySelectorAll('[data-testid="form-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('version 3');
    expect(rows[1].textContent).toContain('Not published yet');
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/admin/forms/expense-claim');
  });

  it('starts a new form with a valid, unused key', async () => {
    const { fixture, element, controller, el, type } = setup();
    controller.expectOne('/api/forms/definitions').flush(forms);
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    type('new-key', 'Expense Claim');
    await fixture.whenStable();
    expect(element.textContent).toContain('lowercase letters');
    type('new-key', 'expense-claim');
    await fixture.whenStable();
    expect(element.textContent).toContain('already exists');
    type('new-key', 'travel-request');
    type('new-name', 'Travel request');
    await fixture.whenStable(); // the button re-enables once the valid key renders
    el<HTMLButtonElement>('create').click();

    expect(navigate).toHaveBeenCalledWith(['/admin/forms', 'travel-request'], { queryParams: { name: 'Travel request' } });
  });

  it('says whether each form is published and when its draft was saved', async () => {
    const { fixture, element, controller } = setup();
    controller.expectOne('/api/forms/definitions').flush([
      ...forms,
      { key: 'old', name: 'Old', latestVersion: 1, status: 'RETIRED', hasDraft: false, draftUpdatedAt: null },
    ]);
    await fixture.whenStable();

    const rows = element.querySelectorAll('[data-testid="form-row"]');
    expect(rows[0].querySelector('.badge-ok')?.textContent).toContain('Published');
    expect(rows[0].querySelector('[data-testid="draft-saved"]')?.textContent).toContain('Draft saved Sep 25, 2026');
    expect(rows[1].querySelector('.badge')?.textContent).toContain('Not published yet');
    expect(rows[2].querySelector('.badge')?.textContent).toContain('Retired');
    expect(rows[2].querySelector('[data-testid="draft-saved"]')).toBeNull();
    expect(rows[2].querySelector('button')).toBeNull();
  });

  it('fills in the key from the name until a key is typed', async () => {
    const { fixture, controller, el, type } = setup();
    controller.expectOne('/api/forms/definitions').flush(forms);
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    type('new-name', 'T');
    await fixture.whenStable();
    expect(el<HTMLInputElement>('new-key').value).toBe('t');
    expect(el('key-error')).toBeNull(); // too short, but not something the person typed
    expect(el<HTMLButtonElement>('create').disabled).toBe(true);

    type('new-name', 'Travel Request');
    await fixture.whenStable();
    expect(el<HTMLInputElement>('new-key').value).toBe('travel-request');

    type('new-key', 'trips');
    type('new-name', 'Business trips');
    await fixture.whenStable();
    expect(el<HTMLInputElement>('new-key').value).toBe('trips');
    el<HTMLButtonElement>('create').click();

    expect(navigate).toHaveBeenCalledWith(['/admin/forms', 'trips'], { queryParams: { name: 'Business trips' } });
  });

  it('retires a published form after asking', async () => {
    const { fixture, controller, el } = setup();
    controller.expectOne('/api/forms/definitions').flush(forms);
    await fixture.whenStable();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    el<HTMLButtonElement>('retire-expense-claim').click();
    controller.expectOne({ method: 'POST', url: '/api/forms/definitions/expense-claim/retire' }).flush(null);
    controller.expectOne('/api/forms/definitions').flush([]);
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });
});
