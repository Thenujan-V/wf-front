import { Component, computed, input } from '@angular/core';
import { statusLabel, statusTone } from './labels';

/** A request's status: in words, with a colour that supports them. */
@Component({
  selector: 'app-status-badge',
  template: `
    <span class="badge" [attr.data-tone]="tone()" [class.badge-accent]="tone() === 'accent'" [class.badge-ok]="tone() === 'ok'"
          [class.badge-danger]="tone() === 'danger'">{{ label() }}</span>
  `,
})
export class StatusBadge {
  readonly status = input.required<string>();
  readonly endStatus = input<string | null>(null);
  protected readonly label = computed(() => statusLabel(this.status(), this.endStatus()));
  protected readonly tone = computed(() => statusTone(this.status(), this.endStatus()));
}
