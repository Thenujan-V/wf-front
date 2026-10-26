import { HttpContext, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { WorkflowApi } from './workflow.api';

describe('WorkflowApi', () => {
  let api: WorkflowApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(WorkflowApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('reads the catalog, tasks and my requests', () => {
    api.catalog().subscribe();
    api.tasks('group').subscribe();
    api.myRequests().subscribe();

    controller.expectOne('/api/workflow/catalog').flush([]);
    controller.expectOne('/api/workflow/tasks?view=group').flush([]);
    controller.expectOne('/api/workflow/instances').flush([]);
  });

  it('sends task actions to encoded task urls', () => {
    api.claim('t/1').subscribe();
    api.unclaim('t1').subscribe();
    api.delegate('t1', 'dave').subscribe();
    api.complete('t1', 'APPROVE', { comment: 'Fine' }).subscribe();

    expect(controller.expectOne({ method: 'POST', url: '/api/workflow/tasks/t%2F1/claim' }).request.body).toBeNull();
    controller.expectOne({ method: 'POST', url: '/api/workflow/tasks/t1/unclaim' }).flush(null);
    expect(controller.expectOne({ method: 'POST', url: '/api/workflow/tasks/t1/delegate' }).request.body)
      .toEqual({ toUserId: 'dave' });
    expect(controller.expectOne({ method: 'POST', url: '/api/workflow/tasks/t1/complete' }).request.body)
      .toEqual({ outcome: 'APPROVE', data: { comment: 'Fine' } });
  });

  it('starts a request', () => {
    let id = '';
    api.start({ processKey: 'expense-approval', businessKey: null, data: { amount: 5 } }).subscribe((r) => (id = r.id));

    const req = controller.expectOne({ method: 'POST', url: '/api/workflow/instances' });
    expect(req.request.body).toEqual({ processKey: 'expense-approval', businessKey: null, data: { amount: 5 } });
    req.flush({ id: 'i1' });
    expect(id).toBe('i1');
  });

  it('marks detail and history reads silent when asked', () => {
    api.request('i/1', true).subscribe();
    api.history('i1').subscribe();

    const detail = controller.expectOne('/api/workflow/instances/i%2F1');
    const history = controller.expectOne('/api/workflow/instances/i1/history');
    expect(detail.request.context.get(SILENT_ERRORS)).toBe(true);
    expect(history.request.context.get(SILENT_ERRORS)).toBe(false);
    expect(new HttpContext().get(SILENT_ERRORS)).toBe(false);
  });

  it('sends a comment as its own field and reads a task form', () => {
    api.complete('t1', 'REJECT', { costCentre: 'FN-120' }, 'Wrong centre').subscribe();
    api.taskForm('t/1').subscribe();

    expect(controller.expectOne('/api/workflow/tasks/t1/complete').request.body)
      .toEqual({ outcome: 'REJECT', data: { costCentre: 'FN-120' }, comment: 'Wrong centre' });
    controller.expectOne('/api/workflow/tasks/t%2F1/form');
  });

  it('asks what the caller may do with a request', () => {
    let canAttach: boolean | undefined;
    api.access('i 1', true).subscribe((a) => (canAttach = a.canAttach));
    const req = controller.expectOne('/api/workflow/instances/i%201/access-check');
    expect(req.request.context.get(SILENT_ERRORS)).toBe(true);
    req.flush({ instanceId: 'i 1', processKey: 'expense', status: 'ACTIVE', canView: true, canAttach: true });
    expect(canAttach).toBe(true);
  });
});
