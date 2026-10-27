import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { problemInterceptor } from '../../core/http/problem.interceptor';
import { ToastService } from '../../core/ui/toast.service';
import { RequestsPage } from './requests';

describe('RequestsPage', () => {
  function setup(businessKey?: string) {
    TestBed.configureTestingModule({
      imports: [RequestsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(RequestsPage);
    if (businessKey) {
      fixture.componentRef.setInput('businessKey', businessKey);
    }
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const controller = TestBed.inject(HttpTestingController);
    const byTestId = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const type = (el: HTMLInputElement, value: string) => {
      el.value = value;
      el.dispatchEvent(new Event('input'));
    };
    return { fixture, element, controller, byTestId, type };
  }

  const summary = {
    id: 'i1', processKey: 'expense-approval', processVersion: 2, businessKey: 'EXP-7', status: 'COMPLETED',
    endStatus: 'APPROVED', initiatorId: 'me', startedAt: '2026-09-28T09:00:00Z', endedAt: '2026-09-29T09:00:00Z',
  };

  it('lists startable processes and my requests', async () => {
    const { fixture, element, controller } = setup();
    controller.expectOne('/api/workflow/catalog').flush([{ key: 'expense-approval', name: 'Expense approval', version: 2, startForm: null }]);
    controller.expectOne('/api/workflow/instances').flush([summary]);
    await fixture.whenStable();

    expect(element.textContent).toContain('Expense approval');
    const row = element.querySelector('[data-testid="request-row"]') as HTMLElement;
    expect(row.textContent).toContain('EXP-7');
    expect(row.textContent).toContain('Approved');
    expect(row.querySelector('a')?.getAttribute('href')).toBe('/requests/i1');
    controller.verify();
  });

  it('starts a request with typed details and opens it', async () => {
    const { fixture, controller, byTestId, type } = setup();
    controller.expectOne('/api/workflow/catalog').flush([{ key: 'expense-approval', name: 'Expense approval', version: 2, startForm: null }]);
    controller.expectOne('/api/workflow/instances').flush([]);
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    byTestId<HTMLButtonElement>('start-expense-approval').click();
    await fixture.whenStable();
    type(byTestId('detail-name-0'), 'amount');
    type(byTestId('detail-value-0'), '20000');
    byTestId<HTMLButtonElement>('submit-request').click();

    const req = controller.expectOne({ method: 'POST', url: '/api/workflow/instances' });
    expect(req.request.body).toEqual({ processKey: 'expense-approval', businessKey: null, data: { amount: 20000 } });
    req.flush({ ...summary, id: 'new-1', status: 'ACTIVE' });
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/requests', 'new-1']);
    expect(TestBed.inject(ToastService).toasts().map((t) => t.message)).toEqual(['Request submitted']);
    controller.verify();
  });

  it('lists only the requests for a business key, e.g. one auraDOCS document', async () => {
    const { fixture, element, controller, byTestId } = setup('auradocs-doc:42');
    controller.expectOne('/api/workflow/catalog').flush([]);
    controller.expectOne('/api/workflow/instances?businessKey=auradocs-doc:42').flush([{ ...summary, businessKey: 'auradocs-doc:42' }]);
    await fixture.whenStable();

    expect(byTestId('requests-heading').textContent).toContain('Requests for this document');
    expect(element.querySelectorAll('[data-testid="request-row"]').length).toBe(1);
    controller.verify();
  });

  it('says when a document has no requests yet', async () => {
    const { fixture, element, controller } = setup('auradocs-doc:42');
    controller.expectOne('/api/workflow/catalog').flush([]);
    controller.expectOne('/api/workflow/instances?businessKey=auradocs-doc:42').flush([]);
    await fixture.whenStable();

    expect(element.textContent).toContain('No requests have been started for this document yet');
  });

  it('starts a request for the filtered key', async () => {
    const { fixture, controller, byTestId } = setup('auradocs-doc:42');
    controller.expectOne('/api/workflow/catalog').flush([{ key: 'expense-approval', name: 'Expense approval', version: 2, startForm: null }]);
    controller.expectOne('/api/workflow/instances?businessKey=auradocs-doc:42').flush([]);
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    byTestId<HTMLButtonElement>('start-expense-approval').click();
    await fixture.whenStable();
    expect(byTestId<HTMLInputElement>('submit-request').form?.querySelector<HTMLInputElement>('#business-key')?.value).toBe('auradocs-doc:42');
    byTestId<HTMLButtonElement>('submit-request').click();

    const req = controller.expectOne({ method: 'POST', url: '/api/workflow/instances' });
    expect(req.request.body.businessKey).toBe('auradocs-doc:42');
    req.flush({ ...summary, id: 'new-3' });
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/requests', 'new-3']);
  });

  it('explains invalid details instead of sending them', async () => {
    const { fixture, element, controller, byTestId, type } = setup();
    controller.expectOne('/api/workflow/catalog').flush([{ key: 'expense-approval', name: 'Expense approval', version: 2, startForm: null }]);
    controller.expectOne('/api/workflow/instances').flush([]);
    await fixture.whenStable();

    byTestId<HTMLButtonElement>('start-expense-approval').click();
    await fixture.whenStable();
    type(byTestId('detail-name-0'), '1st');
    type(byTestId('detail-value-0'), 'x');
    byTestId<HTMLButtonElement>('submit-request').click();
    await fixture.whenStable();

    expect(element.textContent).toContain('is not a valid name');
    controller.verify();
  });

  it('says when there is nothing to start or no requests yet', async () => {
    const { fixture, element, controller } = setup();
    controller.expectOne('/api/workflow/catalog').flush([]);
    controller.expectOne('/api/workflow/instances').flush([]);
    await fixture.whenStable();

    expect(element.textContent).toContain('No processes are published yet');
    expect(element.textContent).toContain('You have not submitted any requests');
  });

  it('shows a load failure on the page only, not also as toasts', async () => {
    TestBed.configureTestingModule({
      imports: [RequestsPage],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([problemInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { reauthenticate: () => false } },
      ],
    });
    const fixture = TestBed.createComponent(RequestsPage);
    fixture.detectChanges();
    const controller = TestBed.inject(HttpTestingController);
    controller.expectOne('/api/workflow/catalog').flush({ detail: 'down' }, { status: 503, statusText: 'Unavailable' });
    controller.expectOne('/api/workflow/instances').flush({ detail: 'down' }, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Requests could not be loaded');
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
  });

  it('starts a process through its start form', async () => {
    const { fixture, element, controller, byTestId } = setup();
    controller.expectOne('/api/workflow/catalog').flush([
      { key: 'expense-request', name: 'Expense request', version: 1, startForm: { key: 'expense-claim', version: 3 } },
    ]);
    controller.expectOne('/api/workflow/instances').flush([]);
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    byTestId<HTMLButtonElement>('start-expense-request').click();
    controller.expectOne('/api/forms/definitions/expense-claim/versions/3').flush({
      key: 'expense-claim', version: 3, name: 'Expense claim', status: 'PUBLISHED',
      definition: { fields: [
        { key: 'amount', type: 'currency', label: 'Amount', required: true },
        { key: 'purpose', type: 'text', label: 'Purpose', required: true },
      ] },
    });
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="detail-name-0"]')).toBeNull();

    byTestId<HTMLButtonElement>('submit-request').click();
    await fixture.whenStable();
    expect(element.textContent).toContain('Amount is required');
    controller.verify();

    const amount = element.querySelector('#f-amount') as HTMLInputElement;
    amount.value = '250';
    amount.dispatchEvent(new Event('input'));
    const purpose = element.querySelector('#f-purpose') as HTMLInputElement;
    purpose.value = 'Taxi';
    purpose.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    byTestId<HTMLButtonElement>('submit-request').click();

    const req = controller.expectOne({ method: 'POST', url: '/api/workflow/instances' });
    expect(req.request.body).toEqual({ processKey: 'expense-request', businessKey: null, data: { amount: 250, purpose: 'Taxi' } });
    req.flush({ id: 'new-2' });
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/requests', 'new-2']);
  });

  it('shows the server\'s field errors next to the start form fields', async () => {
    const { fixture, element, controller, byTestId } = setup();
    controller.expectOne('/api/workflow/catalog').flush([
      { key: 'expense-request', name: 'Expense request', version: 1, startForm: { key: 'expense-claim', version: 3 } },
    ]);
    controller.expectOne('/api/workflow/instances').flush([]);
    await fixture.whenStable();
    byTestId<HTMLButtonElement>('start-expense-request').click();
    controller.expectOne('/api/forms/definitions/expense-claim/versions/3').flush({
      key: 'expense-claim', version: 3, name: 'Expense claim', status: 'PUBLISHED',
      definition: { fields: [{ key: 'code', type: 'text', label: 'Code' }] },
    });
    await fixture.whenStable();

    byTestId<HTMLButtonElement>('submit-request').click();
    controller.expectOne('/api/workflow/instances').flush(
      { code: 'FORM_VALIDATION_FAILED', errors: [{ field: 'code', code: 'PATTERN_MISMATCH', message: 'Code is not in the expected format' }] },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();

    expect(element.querySelector('#e-code')?.textContent).toContain('Code is not in the expected format');
  });
});
