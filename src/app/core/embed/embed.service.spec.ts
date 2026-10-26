import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RUNTIME_CONFIG, RuntimeConfig } from '../config/runtime-config';
import { ThemeService } from '../ui/theme.service';
import { EMBED_KEY, EmbedService } from './embed.service';

@Component({ template: '' })
class Page {}

const DOCS = 'http://localhost:4200';

describe('EmbedService', () => {
  let posted: ReturnType<typeof vi.fn>;

  function setup(url: string, config: Partial<RuntimeConfig> = { embedAllowedOrigins: [DOCS] }) {
    history.replaceState(null, '', url);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Page }]),
        { provide: RUNTIME_CONFIG, useValue: { issuer: 'i', clientId: 'c', ...config } },
      ],
    });
    posted = vi.fn();
    vi.spyOn(window.parent, 'postMessage').mockImplementation(posted as never);
    return TestBed.inject(EmbedService);
  }

  const messages = () => posted.mock.calls.map(([message, origin]) => ({ message, origin }));
  const fromParent = (data: unknown, origin = DOCS) => window.dispatchEvent(new MessageEvent('message', { data, origin }));

  beforeEach(() => sessionStorage.clear());

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    history.replaceState(null, '', '/');
  });

  it('is not embedded on its own, and then says nothing', () => {
    const embed = setup('/inbox');
    embed.start();
    embed.instanceStarted('i1');

    expect(embed.embedded()).toBe(false);
    expect(posted).not.toHaveBeenCalled();
  });

  it('stays embedded for the session once opened with ?embed=1', () => {
    expect(setup('/inbox?embed=1').embedded()).toBe(true);
    expect(sessionStorage.getItem(EMBED_KEY)).toBe('1');

    TestBed.resetTestingModule();
    expect(setup('/requests/7').embedded()).toBe(true);
  });

  it('tells the parent it is ready, in the theme it asked for', () => {
    const embed = setup('/inbox?embed=1&theme=dark');
    embed.start();

    expect(messages()).toEqual([{ message: { source: 'wms', type: 'ready' }, origin: DOCS }]);
    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
    expect(localStorage.length).toBe(0);
  });

  it('reports navigations without its own parameters', async () => {
    const embed = setup('/inbox?embed=1');
    embed.start();
    posted.mockClear();

    await TestBed.inject(Router).navigateByUrl('/requests?businessKey=auradocs-doc:42&embed=1&theme=light');

    expect(messages()).toEqual([
      { message: { source: 'wms', type: 'navigated', path: '/requests?businessKey=auradocs-doc:42' }, origin: DOCS },
    ]);
  });

  it('follows navigate and theme messages from an allowed origin', () => {
    const embed = setup('/inbox?embed=1');
    embed.start();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fromParent({ source: 'auradocs', type: 'navigate', path: '/requests/7' });
    fromParent({ source: 'auradocs', type: 'theme', theme: 'dark' });

    expect(navigate).toHaveBeenCalledWith('/requests/7');
    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
  });

  it('ignores messages from other origins, other senders and paths outside the app', () => {
    const embed = setup('/inbox?embed=1&theme=light');
    embed.start();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fromParent({ source: 'auradocs', type: 'navigate', path: '/admin' }, 'http://evil.example');
    fromParent({ source: 'auradocs', type: 'theme', theme: 'dark' }, 'http://evil.example');
    fromParent({ source: 'wms', type: 'navigate', path: '/admin' });
    fromParent({ source: 'auradocs', type: 'navigate', path: '//evil.example/x' });
    fromParent({ source: 'auradocs', type: 'navigate', path: 'https://evil.example' });
    fromParent('navigate');

    expect(navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(ThemeService).theme()).toBe('light');
  });

  it('asks the parent to open a document and reports started requests', () => {
    const embed = setup('/requests/7?embed=1');

    embed.openDocument('42');
    embed.instanceStarted('i9');

    expect(embed.canOpenDocuments()).toBe(true);
    expect(messages().map((m) => m.message)).toEqual([
      { source: 'wms', type: 'open-document', docId: '42' },
      { source: 'wms', type: 'instance-started', instanceId: 'i9' },
    ]);
  });

  it('opens a document in auraDOCS in a new tab when not embedded', () => {
    const embed = setup('/requests/7', { auradocsViewerUrl: `${DOCS}/file-explorer?docId={docId}` });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    embed.openDocument('42');

    expect(open).toHaveBeenCalledWith(`${DOCS}/file-explorer?docId=42`, '_blank', 'noopener');
    expect(posted).not.toHaveBeenCalled();
  });

  it('offers no document link when not embedded and no viewer is configured', () => {
    expect(setup('/requests/7').canOpenDocuments()).toBe(false);
  });
});
