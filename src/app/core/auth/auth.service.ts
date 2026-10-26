import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthConfig, OAuthService } from 'angular-oauth2-oidc';
import { RUNTIME_CONFIG } from '../config/runtime-config';
import { decodeJwtPayload, realmRoles, stringClaim } from './jwt';

const REAUTH_KEY = 'wms.reauthenticatedAt';
const REAUTH_WINDOW_MS = 60_000;

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Where the person was going, carried through the Keycloak redirect (e.g. a request opened inside auraDOCS). */
function currentPath(): string {
  return window.location.pathname + window.location.search;
}

/** Only a path inside the app is restored; the state comes back through the address bar. */
function returnPath(state: string | undefined): string | null {
  try {
    const path = decodeURIComponent(state ?? '');
    return path.startsWith('/') && !path.startsWith('//') ? path : null;
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode, policy): the in-memory rate limit is lost, sign-in still works.
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly oauth = inject(OAuthService);
  private readonly runtimeConfig = inject(RUNTIME_CONFIG);
  private readonly token = signal<string | null>(null);

  readonly claims = computed(() => {
    const token = this.token();
    return token ? decodeJwtPayload(token) : null;
  });
  readonly isAuthenticated = computed(() => this.claims() !== null);
  readonly roles = computed(() => realmRoles(this.claims()));
  readonly username = computed(() => stringClaim(this.claims(), 'preferred_username'));
  readonly displayName = computed(() => stringClaim(this.claims(), 'name') || this.username());
  /** Keycloak user id (the token subject); matches assignee and initiator ids from the workflow API. */
  readonly userId = computed(() => stringClaim(this.claims(), 'sub'));

  /** Runs before the app renders: completes the Keycloak redirect or starts one. */
  async init(): Promise<void> {
    this.oauth.configure(this.authConfig());
    this.oauth.events.subscribe((event) => {
      if (event.type === 'token_received' || event.type === 'token_refreshed' || event.type === 'logout') {
        this.syncToken();
      }
    });
    const signedIn = await this.oauth.loadDiscoveryDocumentAndLogin({ state: currentPath() });
    if (!signedIn) {
      // The browser is navigating to Keycloak; keep the app from rendering and firing API calls meanwhile.
      return new Promise<void>(() => undefined);
    }
    const path = returnPath(this.oauth.state);
    if (path) {
      // Before the router starts, so its first navigation is to the page the person asked for.
      history.replaceState(null, '', path);
    }
    this.oauth.setupAutomaticSilentRefresh();
    this.syncToken();
  }

  accessToken(): string | null {
    return this.token();
  }

  hasRole(role: string): boolean {
    return this.roles().includes(role);
  }

  login(): void {
    this.oauth.initCodeFlow();
  }

  /**
   * Restarts sign-in after the backend rejected our token. If that already happened within the last minute
   * (remembered across the redirect), the backend is rejecting fresh tokens too, e.g. a misconfigured
   * audience or issuer, so returns false instead of sending the browser into an endless redirect loop.
   */
  reauthenticate(): boolean {
    const now = Date.now();
    const last = Number(readSession(REAUTH_KEY) ?? 0);
    if (now - last < REAUTH_WINDOW_MS) {
      return false;
    }
    writeSession(REAUTH_KEY, String(now));
    this.oauth.initCodeFlow(currentPath());
    return true;
  }

  logout(): void {
    this.oauth.logOut();
  }

  private syncToken(): void {
    this.token.set(this.oauth.hasValidAccessToken() ? this.oauth.getAccessToken() : null);
  }

  private authConfig(): AuthConfig {
    const origin = window.location.origin;
    return {
      issuer: this.runtimeConfig.issuer,
      clientId: this.runtimeConfig.clientId,
      responseType: 'code',
      scope: 'openid profile email',
      redirectUri: `${origin}/`,
      postLogoutRedirectUri: `${origin}/`,
      useSilentRefresh: false,
    };
  }
}
