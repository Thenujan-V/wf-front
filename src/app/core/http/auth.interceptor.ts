import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';

/** Only relative /api/ URLs get the token, so it can never leak to another origin. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).accessToken();
  if (!token || !req.url.startsWith('/api/')) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
