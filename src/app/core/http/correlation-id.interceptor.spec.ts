import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { correlationIdInterceptor } from './correlation-id.interceptor';

describe('correlationIdInterceptor', () => {
  it('tags API calls with a fresh UUID and leaves other URLs alone', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([correlationIdInterceptor])), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpClient);
    const controller = TestBed.inject(HttpTestingController);

    http.get('/api/identity/me').subscribe();
    http.get('/config.json').subscribe();

    expect(controller.expectOne('/api/identity/me').request.headers.get('X-Correlation-Id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(controller.expectOne('/config.json').request.headers.has('X-Correlation-Id')).toBe(false);
    controller.verify();
  });
});
