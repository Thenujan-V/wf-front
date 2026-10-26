import { TestBed } from '@angular/core/testing';
import { CanMatchFn, Route, Router, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { roleGuard } from './role.guard';

describe('roleGuard', () => {
  function run(roles: string[]): boolean | UrlTree {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { hasRole: (r: string) => roles.includes(r) } }],
    });
    return TestBed.runInInjectionContext(() => roleGuard('wms-admin')({} as Route, [], {} as Parameters<CanMatchFn>[2])) as boolean | UrlTree;
  }

  it('allows users with the role', () => {
    expect(run(['wms-admin'])).toBe(true);
  });

  it('redirects others to /forbidden', () => {
    const result = run(['user']);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/forbidden');
  });

  it('accepts any one of several roles', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { hasRole: (r: string) => r === 'process-designer' } }],
    });
    const result = TestBed.runInInjectionContext(() =>
      roleGuard('process-designer', 'wms-admin')({} as Route, [], {} as Parameters<CanMatchFn>[2]));

    expect(result).toBe(true);
  });
});
