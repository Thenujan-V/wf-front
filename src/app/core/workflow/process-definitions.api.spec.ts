import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { ProcessDefinitionsApi } from './process-definitions.api';
import { ProcessGraph } from './process.models';

describe('ProcessDefinitionsApi', () => {
  let api: ProcessDefinitionsApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ProcessDefinitionsApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  const graph: ProcessGraph = { nodes: [{ id: 'start', type: 'START', name: 'Start' }], edges: [] };

  it('lists processes and reads a draft quietly when asked', () => {
    api.list().subscribe();
    controller.expectOne({ method: 'GET', url: '/api/workflow/definitions' }).flush([]);

    api.draft('expense-request', true).subscribe();
    const draft = controller.expectOne('/api/workflow/definitions/expense-request/draft');
    expect(draft.request.context.get(SILENT_ERRORS)).toBe(true);
    draft.flush({});
  });

  it('saves a draft with its name and graph', () => {
    api.saveDraft('expense-request', 'Expense request', graph).subscribe();
    const save = controller.expectOne({ method: 'PUT', url: '/api/workflow/definitions/expense-request/draft' });
    expect(save.request.body).toEqual({ name: 'Expense request', graph });
    save.flush({});
  });

  it('validates, publishes, reads a version and retires', () => {
    api.validate('expense-request').subscribe();
    controller.expectOne({ method: 'POST', url: '/api/workflow/definitions/expense-request/validate' }).flush({ valid: true, errors: [] });
    api.publish('expense-request').subscribe();
    controller.expectOne({ method: 'POST', url: '/api/workflow/definitions/expense-request/publish' }).flush({});
    api.version('expense-request', 2).subscribe();
    controller.expectOne({ method: 'GET', url: '/api/workflow/definitions/expense-request/versions/2' }).flush({});
    api.retire('expense-request').subscribe();
    controller.expectOne({ method: 'POST', url: '/api/workflow/definitions/expense-request/retire' }).flush(null);
  });
});
