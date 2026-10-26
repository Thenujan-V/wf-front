import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { UserName } from '../../core/identity/user-name';
import { NOW } from '../../core/workflow/clock';
import { slaState } from '../../core/workflow/sla';
import { SlaBadge } from '../../core/workflow/sla-badge';
import { WorkflowApi } from '../../core/workflow/workflow.api';
import { TaskView, TaskViewName } from '../../core/workflow/workflow.models';
import { InboxSummary } from './inbox-summary';
import { TaskPanel } from './task-panel';

interface Tab {
  view: TaskViewName;
  label: string;
  empty: string;
}

const TABS: Tab[] = [
  { view: 'mine', label: 'My tasks', empty: 'No tasks waiting for you.' },
  { view: 'group', label: 'Group tasks', empty: 'Nothing to pick up from your groups.' },
  { view: 'all', label: 'All tasks', empty: 'No open tasks.' },
];

@Component({
  selector: 'app-inbox',
  imports: [DatePipe, InboxSummary, SlaBadge, TaskPanel, UserName],
  templateUrl: './inbox.html',
})
export class InboxPage {
  private readonly api = inject(WorkflowApi);
  private readonly auth = inject(AuthService);
  private readonly now = inject(NOW);

  protected readonly tabs = computed(() => TABS.filter((tab) => tab.view !== 'all' || this.auth.hasRole('wms-admin')));
  protected readonly view = signal<TaskViewName>('mine');
  protected readonly tab = computed(() => TABS.find((tab) => tab.view === this.view())!);
  protected readonly tasks = signal<TaskView[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly query = signal('');
  protected readonly overdueOnly = signal(false);
  /** Raised on every load, so the summary strip counts again. */
  protected readonly version = signal(0);
  readonly selected = signal<TaskView | null>(null);

  protected readonly visible = computed(() => {
    const query = this.query().trim().toLowerCase();
    const now = this.now();
    return (this.tasks() ?? [])
      .filter((t) => !query || [t.name, t.processKey, t.businessKey ?? ''].some((v) => v.toLowerCase().includes(query)))
      .filter((t) => !this.overdueOnly() || slaState(t.createdAt, t.dueAt, now) === 'overdue')
      .sort(byDueThenCreated);
  });

  constructor() {
    this.reload();
  }

  protected show(view: TaskViewName): void {
    if (view !== this.view()) {
      this.view.set(view);
      this.selected.set(null);
      this.reload();
    }
  }

  protected afterChange(): void {
    this.selected.set(null);
    this.reload();
  }

  reload(): void {
    this.version.update((v) => v + 1);
    this.tasks.set(null);
    this.failed.set(false);
    // The page shows its own error state, so the interceptor must not toast as well.
    this.api.tasks(this.view(), true).subscribe({
      next: (tasks) => this.tasks.set(tasks),
      error: () => this.failed.set(true),
    });
  }
}

function byDueThenCreated(a: TaskView, b: TaskView): number {
  const dueA = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
  const dueB = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
  return dueA !== dueB ? dueA - dueB : Date.parse(a.createdAt) - Date.parse(b.createdAt);
}
