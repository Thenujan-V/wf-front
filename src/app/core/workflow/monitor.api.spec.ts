import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { MonitorApi } from './monitor.api';

describe('MonitorApi', () => {
  let api: MonitorApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(MonitorApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('asks for a page of every request with only the filters that are set', () => {
    api.instances({ status: 'ACTIVE', processKey: ' ', q: ' EXP ', page: 2 }, true).subscribe();

    const req = controller.expectOne((r) => r.url === '/api/workflow/admin/instances');
    expect(req.request.params.keys().sort()).toEqual(['page', 'q', 'size', 'status']);
    expect(req.request.params.get('status')).toBe('ACTIVE');
    expect(req.request.params.get('q')).toBe('EXP');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('20');
    expect(req.request.context.get(SILENT_ERRORS)).toBe(true);
    req.flush({ items: [], total: 0, page: 2, size: 20 });
  });

  it('lists dead jobs and retries one', () => {
    api.deadJobs().subscribe();
    const list = controller.expectOne((r) => r.url === '/api/workflow/jobs');
    expect(list.request.params.get('status')).toBe('DEAD');
    list.flush([]);

    api.retry('j/1').subscribe();
    const retry = controller.expectOne('/api/workflow/jobs/j%2F1/retry');
    expect(retry.request.method).toBe('POST');
    retry.flush(null);
  });

  it('cancels, suspends and resumes a request', () => {
    for (const action of ['cancel', 'suspend', 'resume'] as const) {
      api[action]('i1').subscribe();
      const req = controller.expectOne(`/api/workflow/instances/i1/${action}`);
      expect(req.request.method).toBe('POST');
      req.flush(null);
    }
  });
});
