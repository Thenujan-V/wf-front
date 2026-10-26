import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { RUNTIME_CONFIG } from '../config/runtime-config';
import { ThemeService } from '../ui/theme.service';

/** Remembers for the browser tab (the iframe) that the app is embedded, so it survives the sign-in redirect. */
export const EMBED_KEY = 'wms.embed';
/** Query parameters only the embedding page uses; they are left out of the paths reported back to it. */
const EMBED_PARAMS = ['embed', 'theme'];

export type EmbedMessage =
  | { type: 'ready' }
  | { type: 'navigated'; path: string }
  | { type: 'open-document'; docId: string }
  | { type: 'instance-started'; instanceId: string };

function remembered(view: Window): boolean {
  const flag = new URLSearchParams(view.location.search).get('embed') === '1';
  try {
    if (flag) {
      view.sessionStorage.setItem(EMBED_KEY, '1');
    }
    return flag || view.sessionStorage.getItem(EMBED_KEY) === '1';
  } catch {
    return flag; // storage blocked: embedded only while the address says so
  }
}

/** A path inside the app; anything else from the parent (other sites, protocol-relative urls) is refused. */
function isAppPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

/** Running inside an auraDOCS iframe: no shell chrome, and a postMessage bridge to the page around it. */
@Injectable({ providedIn: 'root' })
export class EmbedService {
  private readonly window = inject(DOCUMENT).defaultView!;
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(RUNTIME_CONFIG, { optional: true });
  private readonly origins = this.config?.embedAllowedOrigins ?? [];
  private started = false;

  readonly embedded = signal(remembered(this.window)).asReadonly();
  /** Documents open in the auraDOCS page around the app, or in a new tab when a viewer address is configured. */
  readonly canOpenDocuments = computed(() => this.embedded() || !!this.config?.auradocsViewerUrl);

  /** Runs once the app is signed in and rendering: applies the parent's theme and starts talking to it. */
  start(): void {
    if (!this.embedded() || this.started) {
      return;
    }
    this.started = true;
    this.useTheme(new URLSearchParams(this.window.location.search).get('theme'));
    const listener = (event: MessageEvent) => this.receive(event);
    this.window.addEventListener('message', listener);
    this.destroyRef.onDestroy(() => this.window.removeEventListener('message', listener));
    const navigations = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.post({ type: 'navigated', path: this.withoutEmbedParams(event.urlAfterRedirects) }));
    this.destroyRef.onDestroy(() => navigations.unsubscribe());
    this.post({ type: 'ready' });
  }

  openDocument(docId: string): void {
    if (this.embedded()) {
      this.post({ type: 'open-document', docId });
      return;
    }
    const viewer = this.config?.auradocsViewerUrl;
    if (viewer) {
      this.window.open(viewer.replace('{docId}', encodeURIComponent(docId)), '_blank', 'noopener');
    }
  }

  instanceStarted(instanceId: string): void {
    if (this.embedded()) {
      this.post({ type: 'instance-started', instanceId });
    }
  }

  /** Sent to every allowed origin: the browser delivers it only if the parent is one of them. */
  private post(message: EmbedMessage): void {
    for (const origin of this.origins) {
      this.window.parent.postMessage({ source: 'wms', ...message }, origin);
    }
  }

  private receive(event: MessageEvent): void {
    if (!this.origins.includes(event.origin)) {
      return;
    }
    const data = event.data as { source?: unknown; type?: unknown; path?: unknown; theme?: unknown } | null;
    if (data?.source !== 'auradocs') {
      return;
    }
    if (data.type === 'navigate' && isAppPath(data.path)) {
      void this.router.navigateByUrl(data.path);
    } else if (data.type === 'theme') {
      this.useTheme(data.theme);
    }
  }

  private useTheme(theme: unknown): void {
    if (theme === 'light' || theme === 'dark') {
      this.theme.use(theme);
    }
  }

  private withoutEmbedParams(url: string): string {
    const tree = this.router.parseUrl(url);
    for (const param of EMBED_PARAMS) {
      delete tree.queryParams[param];
    }
    return this.router.serializeUrl(tree);
  }
}
