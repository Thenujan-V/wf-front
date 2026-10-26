import { HttpInterceptorFn } from '@angular/common/http';

export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { 'X-Correlation-Id': crypto.randomUUID() } }));
};
