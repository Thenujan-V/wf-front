import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { StatsApi } from './stats.api';

describe('StatsApi', () => {
  it('asks for a period in the viewer\'s days', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const controller = TestBed.inject(HttpTestingController);

    TestBed.inject(StatsApi).stats(7, 330, true).subscribe();

    const req = controller.expectOne((r) => r.url === '/api/workflow/stats');
    expect(req.request.params.get('days')).toBe('7');
    expect(req.request.params.get('offsetMinutes')).toBe('330');
    expect(req.request.context.get(SILENT_ERRORS)).toBe(true);
    req.flush({});
    controller.verify();
  });
});
