import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { UserDetail } from '../../core/identity/identity.models';
import { Component } from '@angular/core';
import { NotificationPreferences } from './notification-preferences';

@Component({ selector: 'app-notification-preferences', template: '' })
class PreferencesStub {}
import { ProfilePage } from './profile';

const carol: UserDetail = {
  id: 'c', username: 'carol', displayName: 'Carol Clerk', email: 'carol@example.com', department: 'Finance',
  position: 'Accountant', managerId: 'b', enabled: true, roles: ['user'], groups: [{ id: 'g', name: 'Finance', path: '/Finance' }],
};

describe('ProfilePage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.overrideComponent(ProfilePage, { remove: { imports: [NotificationPreferences] }, add: { imports: [PreferencesStub] } });
  });

  it('shows the signed-in user with their manager', async () => {
    const fixture = TestBed.createComponent(ProfilePage);
    const controller = TestBed.inject(HttpTestingController);

    controller.expectOne('/api/identity/me').flush(carol);
    controller.expectOne('/api/identity/users/c/managers?levels=1').flush([{ id: 'b', displayName: 'Bob Manager' }]);
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Carol Clerk');
    expect(text).toContain('Accountant');
    expect(text).toContain('Bob Manager');
    expect(text).toContain('/Finance');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-notification-preferences')).not.toBeNull();
    controller.verify();
  });

  it('does not ask for a manager when there is none', async () => {
    const fixture = TestBed.createComponent(ProfilePage);
    const controller = TestBed.inject(HttpTestingController);

    controller.expectOne('/api/identity/me').flush({ ...carol, managerId: null });
    await fixture.whenStable();

    controller.verify();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No manager');
  });

  it('shows an error state when the profile cannot load', async () => {
    const fixture = TestBed.createComponent(ProfilePage);
    TestBed.inject(HttpTestingController).expectOne('/api/identity/me').flush(null, { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('could not be loaded');
  });
});
