import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../ui/toast.service';
import { SILENT_ERRORS, problemInterceptor } from './problem.interceptor';

describe('problemInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  const reauthenticate = vi.fn();

  beforeEach(() => {
    reauthenticate.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { reauthenticate } },
        provideHttpClient(withInterceptors([problemInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  function messages(): string[] {
    return TestBed.inject(ToastService).toasts().map((t) => t.message);
  }

  it('shows the ProblemDetail detail and still errors the caller', () => {
    let failed = false;
    http.get('/api/x').subscribe({ error: () => (failed = true) });
    controller.expectOne('/api/x').flush(
      { status: 409, code: 'DOC_CHECKED_OUT', detail: 'Document is checked out' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(messages()).toEqual(['Document is checked out']);
    expect(failed).toBe(true);
  });

  it('falls back to the HTTP status when there is no problem body', () => {
    http.get('/api/x').subscribe({ error: () => undefined });
    controller.expectOne('/api/x').flush(null, { status: 500, statusText: 'Server Error' });
    expect(messages()).toEqual(['Request failed (HTTP 500).']);
  });

  it('restarts sign-in on 401 without a toast', () => {
    reauthenticate.mockReturnValue(true);
    http.get('/api/x').subscribe({ error: () => undefined });
    controller.expectOne('/api/x').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(reauthenticate).toHaveBeenCalled();
    expect(messages()).toEqual([]);
  });

  it('explains the problem instead of looping when sign-in was just restarted', () => {
    reauthenticate.mockReturnValue(false);
    http.get('/api/x').subscribe({ error: () => undefined });
    controller.expectOne('/api/x').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(messages()).toEqual([
      'Your sign-in could not be verified. If this keeps happening, contact your administrator.',
    ]);
  });

  it('stays quiet for requests that show their own error state', () => {
    let failed = false;
    http.get('/api/x', { context: new HttpContext().set(SILENT_ERRORS, true) }).subscribe({ error: () => (failed = true) });
    controller.expectOne('/api/x').flush({ status: 404, detail: 'Request not found' }, { status: 404, statusText: 'Not Found' });

    expect(messages()).toEqual([]);
    expect(failed).toBe(true);
  });
});
