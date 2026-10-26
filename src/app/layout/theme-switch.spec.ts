import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Theme, ThemeService } from '../core/ui/theme.service';
import { ThemeSwitch } from './theme-switch';

describe('ThemeSwitch', () => {
  it('says what it will switch to, and switches', () => {
    const theme = signal<Theme>('light');
    const toggle = vi.fn(() => theme.set(theme() === 'dark' ? 'light' : 'dark'));
    TestBed.configureTestingModule({ imports: [ThemeSwitch], providers: [{ provide: ThemeService, useValue: { theme, toggle } }] });
    const fixture = TestBed.createComponent(ThemeSwitch);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="theme-switch"]')!;

    expect(button.getAttribute('aria-label')).toBe('Switch to the dark theme');

    button.click();
    fixture.detectChanges();
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-label')).toBe('Switch to the light theme');
  });
});
