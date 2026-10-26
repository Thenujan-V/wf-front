import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { FormsAdminApi } from './forms-admin.api';

describe('FormsAdminApi', () => {
  let api: FormsAdminApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(FormsAdminApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('reads the form list, drafts and versions', () => {
    api.list().subscribe();
    api.draft('expense claim', true).subscribe();
    api.versions('expense-claim').subscribe();

    controller.expectOne('/api/forms/definitions').flush([]);
    const draft = controller.expectOne('/api/forms/definitions/expense%20claim/draft');
    expect(draft.request.context.get(SILENT_ERRORS)).toBe(true);
    draft.flush({});
    controller.expectOne('/api/forms/definitions/expense-claim/versions').flush([]);
  });

  it('saves, checks, publishes and retires', () => {
    api.saveDraft('expense-claim', 'Expense claim', { fields: [] }).subscribe();
    api.validate('expense-claim').subscribe();
    api.publish('expense-claim').subscribe();
    api.retire('expense-claim').subscribe();

    const save = controller.expectOne({ method: 'PUT', url: '/api/forms/definitions/expense-claim/draft' });
    expect(save.request.body).toEqual({ name: 'Expense claim', definition: { fields: [] } });
    controller.expectOne({ method: 'POST', url: '/api/forms/definitions/expense-claim/validate' });
    controller.expectOne({ method: 'POST', url: '/api/forms/definitions/expense-claim/publish' });
    controller.expectOne({ method: 'POST', url: '/api/forms/definitions/expense-claim/retire' });
  });
});
