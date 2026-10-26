import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { OrgApi } from './org.api';

describe('OrgApi', () => {
  let api: OrgApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(OrgApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('asks which fields are kept here', () => {
    api.settings(true).subscribe();
    const req = controller.expectOne('/api/identity/org/settings');
    expect(req.request.context.get(SILENT_ERRORS)).toBe(true);
    req.flush({ manager: 'LOCAL', department: 'KEYCLOAK', position: 'LOCAL' });
  });

  it('lists people, including those who have left', () => {
    api.people(' car ', 2).subscribe();
    const req = controller.expectOne((r) => r.url === '/api/identity/users');
    expect(req.request.params.get('q')).toBe('car');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('20');
    expect(req.request.params.get('includeDisabled')).toBe('true');
    req.flush({ items: [], page: 2, size: 20, total: 0 });

    api.people('', 0).subscribe();
    const all = controller.expectOne((r) => r.url === '/api/identity/users');
    expect(all.request.params.has('q')).toBe(false);
    all.flush({ items: [], page: 0, size: 20, total: 0 });
  });

  it('asks who is above and below a person', () => {
    api.managers('c/1').subscribe();
    const up = controller.expectOne((r) => r.url === '/api/identity/users/c%2F1/managers');
    expect(up.request.params.get('levels')).toBe('10');
    up.flush([]);

    api.reports('c/1').subscribe();
    const down = controller.expectOne((r) => r.url === '/api/identity/users/c%2F1/reports');
    expect(down.request.params.get('includeDisabled')).toBe('true');
    down.flush({ items: [], total: 0 });
  });

  it('replaces a person\'s manager, department and position', () => {
    const change = { managerId: 'b', department: 'Finance', position: null };
    api.update('c', change).subscribe();
    const req = controller.expectOne('/api/identity/users/c/org');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(change);
    req.flush({});
  });
});
