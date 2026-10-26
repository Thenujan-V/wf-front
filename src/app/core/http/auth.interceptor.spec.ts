import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let token: string | null;
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    token = 'abc';
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { accessToken: () => token } },
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('adds the bearer token to same-origin API calls', () => {
    http.get('/api/identity/me').subscribe();
    expect(controller.expectOne('/api/identity/me').request.headers.get('Authorization')).toBe('Bearer abc');
  });

  it('never sends the token to absolute or non-API URLs', () => {
    http.get('https://other.example/api/steal').subscribe();
    http.get('/config.json').subscribe();
    expect(controller.expectOne('https://other.example/api/steal').request.headers.has('Authorization')).toBe(false);
    expect(controller.expectOne('/config.json').request.headers.has('Authorization')).toBe(false);
  });

  it('sends nothing when signed out', () => {
    token = null;
    http.get('/api/identity/me').subscribe();
    expect(controller.expectOne('/api/identity/me').request.headers.has('Authorization')).toBe(false);
  });
});
