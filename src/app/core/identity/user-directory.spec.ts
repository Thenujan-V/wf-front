import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { problemInterceptor } from '../http/problem.interceptor';
import { ToastService } from '../ui/toast.service';
import { UserDirectory } from './user-directory';

describe('UserDirectory', () => {
  let directory: UserDirectory;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { reauthenticate: () => false } },
        provideHttpClient(withInterceptors([problemInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    directory = TestBed.inject(UserDirectory);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('looks a user up once and shows their display name', () => {
    const first = directory.name('u/1');
    const second = directory.name('u/1');
    expect(first()).toBe('…');

    controller.expectOne('/api/identity/users/u%2F1').flush({ id: 'u/1', username: 'bob', displayName: 'Bob Manager' });

    expect(first()).toBe('Bob Manager');
    expect(second()).toBe('Bob Manager');
  });

  it('shows unknown users without toasting an error', () => {
    const name = directory.name('ghost');
    controller.expectOne('/api/identity/users/ghost').flush({ detail: 'User not found' }, { status: 404, statusText: 'Not Found' });

    expect(name()).toBe('Unknown user');
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
  });

  it('needs no lookup for the system or a missing id', () => {
    expect(directory.name('system')()).toBe('System');
    expect(directory.name(null)()).toBe('—');
  });

  it('searches users by name', () => {
    let found: string[] = [];
    directory.search('bo').subscribe((users) => (found = users.map((u) => u.username)));

    controller.expectOne('/api/identity/users?q=bo&size=10').flush({ items: [{ id: 'b', username: 'bob' }], page: 0, size: 10, total: 1 });

    expect(found).toEqual(['bob']);
  });

  it('lists groups', () => {
    let names: string[] = [];
    directory.groups().subscribe((groups) => (names = groups.map((g) => g.name)));
    controller.expectOne('/api/identity/groups').flush([{ id: 'g1', name: 'Finance', path: '/Finance' }]);
    expect(names).toEqual(['Finance']);
  });
});
