import { TestBed } from '@angular/core/testing';
import { OAuthEvent, OAuthService, OAuthSuccessEvent } from 'angular-oauth2-oidc';
import { Subject } from 'rxjs';
import { tokenWith } from '../../../testing/test-tokens';
import { RUNTIME_CONFIG } from '../config/runtime-config';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let events: Subject<OAuthEvent>;
  let currentToken: string | null;
  let oauth: Record<string, unknown> & { configure: ReturnType<typeof vi.fn>; initCodeFlow: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    events = new Subject<OAuthEvent>();
    currentToken = tokenWith({ preferred_username: 'carol', name: 'Carol Clerk', realm_access: { roles: ['user'] } });
    oauth = {
      events,
      configure: vi.fn(),
      loadDiscoveryDocumentAndLogin: vi.fn().mockResolvedValue(true),
      setupAutomaticSilentRefresh: vi.fn(),
      hasValidAccessToken: vi.fn(() => currentToken !== null),
      getAccessToken: vi.fn(() => currentToken),
      logOut: vi.fn(),
      initCodeFlow: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: OAuthService, useValue: oauth },
        { provide: RUNTIME_CONFIG, useValue: { issuer: 'http://kc/realms/wms', clientId: 'wms-frontend' } },
      ],
    });
  });

  it('configures code flow from runtime config and exposes the signed-in user', async () => {
    const auth = TestBed.inject(AuthService);
    await auth.init();

    expect(oauth.configure).toHaveBeenCalledWith(
      expect.objectContaining({ issuer: 'http://kc/realms/wms', clientId: 'wms-frontend', responseType: 'code' }),
    );
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.displayName()).toBe('Carol Clerk');
    expect(auth.hasRole('user')).toBe(true);
    expect(auth.hasRole('wms-admin')).toBe(false);
    expect(auth.accessToken()).toBe(currentToken);
  });

  it('picks up refreshed tokens', async () => {
    const auth = TestBed.inject(AuthService);
    await auth.init();

    currentToken = tokenWith({ preferred_username: 'carol', realm_access: { roles: ['user', 'wms-admin'] } });
    events.next(new OAuthSuccessEvent('token_refreshed'));

    expect(auth.hasRole('wms-admin')).toBe(true);
    expect(auth.displayName()).toBe('carol');
  });

  it('starts the login flow on demand', () => {
    TestBed.inject(AuthService).login();
    expect(oauth.initCodeFlow).toHaveBeenCalled();
  });

  it('re-authenticates after a rejection at most once a minute, even across page loads', () => {
    sessionStorage.clear();
    const auth = TestBed.inject(AuthService);

    expect(auth.reauthenticate()).toBe(true);
    expect(auth.reauthenticate()).toBe(false);
    expect(oauth.initCodeFlow).toHaveBeenCalledTimes(1);

    // The redirect reloads the app; a backend that keeps rejecting tokens must not cause a redirect loop.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: OAuthService, useValue: oauth },
        { provide: RUNTIME_CONFIG, useValue: { issuer: 'http://kc/realms/wms', clientId: 'wms-frontend' } },
      ],
    });
    expect(TestBed.inject(AuthService).reauthenticate()).toBe(false);
    expect(oauth.initCodeFlow).toHaveBeenCalledTimes(1);
    sessionStorage.clear();
  });

  it('exposes the token subject as the user id', async () => {
    currentToken = tokenWith({ sub: 'user-123', preferred_username: 'carol', realm_access: { roles: [] } });
    const auth = TestBed.inject(AuthService);
    await auth.init();

    expect(auth.userId()).toBe('user-123');
  });
});
