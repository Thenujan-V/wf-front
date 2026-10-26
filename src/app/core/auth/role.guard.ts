import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Lets through users who hold any one of the roles; everyone else goes to /forbidden. */
export function roleGuard(...roles: string[]): CanMatchFn {
  return () => {
    const auth = inject(AuthService);
    return roles.some((role) => auth.hasRole(role)) || inject(Router).createUrlTree(['/forbidden']);
  };
}
