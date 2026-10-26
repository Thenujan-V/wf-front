import { DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { Icon } from '../ui/icon';
import { NOW } from './clock';
import { slaState } from './sla';

@Component({
  selector: 'app-sla-badge',
  imports: [DatePipe, Icon],
  template: `
    @switch (state()) {
      @case ('overdue') {
        <span class="badge badge-danger" [title]="'Due ' + (dueAt() | date: 'medium')"><app-icon name="clock" />Overdue</span>
      }
      @case ('due-soon') {
        <span class="badge badge-warn" [title]="'Due ' + (dueAt() | date: 'medium')"><app-icon name="clock" />Due soon</span>
      }
      @case ('on-track') {
        <span class="badge badge-ok" [title]="'Due ' + (dueAt() | date: 'medium')"><app-icon name="clock" />On track</span>
      }
    }
  `,
})
export class SlaBadge {
  private readonly now = inject(NOW);
  readonly createdAt = input.required<string>();
  readonly dueAt = input<string | null>(null);
  protected readonly state = computed(() => slaState(this.createdAt(), this.dueAt(), this.now()));
}
