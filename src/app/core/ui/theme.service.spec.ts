import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let deviceListener: ((event: { matches: boolean }) => void) | null;

  /** Stands in for the device's light or dark setting. */
  function device(dark: boolean): void {
    deviceListener = null;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: dark && query.includes('dark'),
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => (deviceListener = listener),
      removeEventListener: () => undefined,
    }));
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    device(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const service = () => TestBed.inject(ThemeService);
  const shown = () => document.documentElement.getAttribute('data-theme');

  it('follows the device until the person chooses', () => {
    device(true);

    expect(service().theme()).toBe('dark');
    expect(shown()).toBe('dark');

    deviceListener!({ matches: false });
    expect(service().theme()).toBe('light');
    expect(shown()).toBe('light');
  });

  it('remembers the choice and stops following the device', () => {
    const theme = service();
    theme.toggle();

    expect(theme.theme()).toBe('dark');
    expect(shown()).toBe('dark');
    expect(localStorage.getItem('wms.theme')).toBe('dark');

    deviceListener!({ matches: false });
    expect(theme.theme()).toBe('dark');

    theme.toggle();
    expect(theme.theme()).toBe('light');
    expect(localStorage.getItem('wms.theme')).toBe('light');
  });

  it('starts with the stored choice, whatever the device says', () => {
    localStorage.setItem('wms.theme', 'light');
    device(true);

    expect(service().theme()).toBe('light');
    expect(shown()).toBe('light');
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem('wms.theme', 'purple');
    device(true);

    expect(service().theme()).toBe('dark');
  });

  it('still switches for this visit when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const theme = service();
    expect(theme.theme()).toBe('light');
    theme.toggle();
    expect(theme.theme()).toBe('dark');
    expect(shown()).toBe('dark');
  });

  it('shows the light theme where the device setting cannot be read', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(service().theme()).toBe('light');
  });
});
