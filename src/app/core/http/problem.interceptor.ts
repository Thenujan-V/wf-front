import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../ui/toast.service';

/** Set on requests whose caller renders its own error state, so the failure is not also toasted. */
export const SILENT_ERRORS = new HttpContextToken<boolean>(() => false);

export const problemInterceptor: HttpInterceptorFn = (req, next) => {
  const toasts = inject(ToastService);
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && req.url.startsWith('/api/')) {
        const silent = req.context.get(SILENT_ERRORS);
        if (error.status === 401) {
          if (!auth.reauthenticate() && !silent) {
            toasts.show('Your sign-in could not be verified. If this keeps happening, contact your administrator.');
          }
        } else if (!silent) {
          toasts.show(problemMessage(error));
        }
      }
      return throwError(() => error);
    }),
  );
};

export function problemMessage(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'The server could not be reached. Check your connection and try again.';
  }
  const body = error.error as { detail?: unknown; title?: unknown } | null;
  if (typeof body?.detail === 'string' && body.detail) {
    return body.detail;
  }
  if (typeof body?.title === 'string' && body.title) {
    return body.title;
  }
  return `Request failed (HTTP ${error.status}).`;
}
