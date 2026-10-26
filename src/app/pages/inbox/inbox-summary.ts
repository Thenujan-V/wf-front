import { Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { Icon } from '../../core/ui/icon';
import { NOW } from '../../core/workflow/clock';
import { slaState } from '../../core/workflow/sla';
import { WorkflowApi } from '../../core/workflow/workflow.api';

/**
 * Three counts above the task list: assigned to me, available to my group, overdue. Each list is asked for on its
 * own, so one that fails shows a dash (not a misleading 0) and the others still count.
 */
@Component({
  selector: 'app-inbox-summary',
  imports: [Icon],
  host: { class: 'block' },
  template: `
    <div class="grid gap-3 sm:grid-cols-3">
      <button type="button" data-testid="summary-mine" class="card flex items-center gap-3 p-3 text-left hover:border-line-strong"
              (click)="choose.emit('mine')">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text"><app-icon name="inbox" /></span>
        <span>
          <span data-testid="count" class="block text-xl font-bold leading-tight">{{ show(mine()) }}</span>
          <span class="text-xs text-muted">Assigned to me</span>
        </span>
      </button>
      <button type="button" data-testid="summary-group" class="card flex items-center gap-3 p-3 text-left hover:border-line-strong"
              (click)="choose.emit('group')">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text"><app-icon name="users" /></span>
        <span>
          <span data-testid="count" class="block text-xl font-bold leading-tight">{{ show(group()) }}</span>
          <span class="text-xs text-muted">Available to my group</span>
        </span>
      </button>
      <button type="button" data-testid="summary-overdue" class="card flex items-center gap-3 p-3 text-left hover:border-line-strong"
              (click)="choose.emit('mine')">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg" [class.bg-danger-soft]="(overdue() ?? 0) > 0"
              [class.text-danger-text]="(overdue() ?? 0) > 0" [class.bg-field]="!overdue()" [class.text-muted]="!overdue()">
          <app-icon name="clock" />
        </span>
        <span>
          <span data-testid="count" class="block text-xl font-bold leading-tight">{{ show(overdue()) }}</span>
          <span class="text-xs text-muted">Overdue</span>
        </span>
      </button>
    </div>
  `,
})
export class InboxSummary {
  private readonly api = inject(WorkflowApi);
  private readonly now = inject(NOW);

  /** Counted again whenever this changes; the Inbox raises it after each load. */
  readonly version = input(0);
  /** The list a card leads to. */
  readonly choose = output<'mine' | 'group'>();

  /** null: not known (still loading, or the list could not be loaded). */
  protected readonly mine = signal<number | null>(null);
  protected readonly group = signal<number | null>(null);
  protected readonly overdue = signal<number | null>(null);

  private mineRequest: Subscription | null = null;
  private groupRequest: Subscription | null = null;

  constructor() {
    effect(() => {
      this.version();
      untracked(() => this.load());
    });
    inject(DestroyRef).onDestroy(() => {
      this.mineRequest?.unsubscribe();
      this.groupRequest?.unsubscribe();
    });
  }

  protected show(count: number | null): string {
    return count === null ? '—' : String(count);
  }

  private load(): void {
    // A newer count replaces one still under way, so a slow answer never overwrites a later one.
    this.mineRequest?.unsubscribe();
    this.groupRequest?.unsubscribe();
    this.mineRequest = this.api.tasks('mine', true).subscribe({
      next: (tasks) => {
        const now = this.now();
        this.mine.set(tasks.length);
        this.overdue.set(tasks.filter((t) => slaState(t.createdAt, t.dueAt, now) === 'overdue').length);
      },
      error: () => {
        this.mine.set(null);
        this.overdue.set(null);
      },
    });
    this.groupRequest = this.api.tasks('group', true).subscribe({
      next: (tasks) => this.group.set(tasks.length),
      error: () => this.group.set(null),
    });
  }
}
