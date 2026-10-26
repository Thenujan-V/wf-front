import { Component, computed, inject } from '@angular/core';
import { Icon } from '../core/ui/icon';
import { ThemeService } from '../core/ui/theme.service';

/** Light or dark. The button says what it will switch to. */
@Component({
  selector: 'app-theme-switch',
  imports: [Icon],
  template: `
    <button type="button" data-testid="theme-switch" class="icon-button" [attr.aria-label]="label()" [attr.title]="label()"
            (click)="theme.toggle()">
      <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
    </button>
  `,
})
export class ThemeSwitch {
  protected readonly theme = inject(ThemeService);
  protected readonly label = computed(() =>
    this.theme.theme() === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme');
}
