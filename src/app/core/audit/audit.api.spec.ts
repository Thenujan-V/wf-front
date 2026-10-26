import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { AuditApi } from './audit.api';

describe('AuditApi', () => {
  let api: AuditApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AuditApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('asks for a page of the log with only the filters that are set', () => {
    api.entries({ actor: 'bob', entityType: 'TASK', entityId: 't-1', from: '2026-10-01T00:00:00.000Z', page: 2 }, true).subscribe();

    const req = controller.expectOne((r) => r.url === '/api/audit/entries');
    expect(req.request.context.get(SILENT_ERRORS)).toBe(true);
    expect(req.request.params.keys().sort()).toEqual(['actor', 'entityId', 'entityType', 'from', 'page', 'size']);
    expect(req.request.params.get('actor')).toBe('bob');
    expect(req.request.params.get('from')).toBe('2026-10-01T00:00:00.000Z');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('20');
    req.flush({ items: [], total: 0, page: 2, size: 20 });
  });
});
