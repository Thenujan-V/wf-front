import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

/** Where the person's choice is kept. index.html reads the same key before the app starts, so there is no flash. */
export const THEME_KEY = 'wms.theme';

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null; // storage blocked (private mode, policy)
  }
}

/** Light or dark: the person's choice if they made one, otherwise the device's setting, followed as it changes. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly chosen = signal<Theme | null>(stored());
  private readonly device = signal<Theme>('light');

  readonly theme = computed<Theme>(() => this.chosen() ?? this.device());

  constructor() {
    const view = this.document.defaultView;
    const media = typeof view?.matchMedia === 'function' ? view.matchMedia('(prefers-color-scheme: dark)') : null;
    if (media) {
      this.device.set(media.matches ? 'dark' : 'light');
      media.addEventListener('change', (event) => {
        this.device.set(event.matches ? 'dark' : 'light');
        this.apply();
      });
    }
    this.apply();
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.chosen.set(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked: the choice holds for this visit only.
    }
    this.apply();
  }

  private apply(): void {
    this.document.documentElement.setAttribute('data-theme', this.theme());
  }
}
