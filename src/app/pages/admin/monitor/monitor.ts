import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { RouterLink } from '@angular/router';
import { UserName } from '../../../core/identity/user-name';
import { ToastService } from '../../../core/ui/toast.service';
import { humanize } from '../../../core/workflow/labels';
import { DeadJob, InstancePage, MonitorApi } from '../../../core/workflow/monitor.api';
import { WorkflowApi } from '../../../core/workflow/workflow.api';
import { StatusBadge } from '../../../core/workflow/status-badge';
import { InstanceSummary } from '../../../core/workflow/workflow.models';

const STATUSES = [
  { value: '', label: 'Any status' },
  { value: 'ACTIVE', label: 'In progress' },
  { value: 'SUSPENDED', label: 'On hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

type Action = 'suspend' | 'resume' | 'cancel';

/** The most dead jobs the server lists. */
const JOBS_CAP = 200;

const DONE: Record<Action, string> = {
  suspend: 'The request is on hold.',
  resume: 'The request is in progress again.',
  cancel: 'The request is cancelled.',
};

/** Spec §9 admin/monitor: every request, and the jobs that used up their retries (spec §4.4). */
@Component({
  selector: 'app-monitor',
  imports: [DatePipe, RouterLink, StatusBadge, UserName],
  templateUrl: './monitor.html',
})
export class MonitorPage {
  private readonly api = inject(MonitorApi);
  private readonly toasts = inject(ToastService);
  private readonly workflow = inject(WorkflowApi);

  protected readonly statuses = STATUSES;
  protected readonly humanize = humanize;
  protected readonly tab = signal<'requests' | 'jobs'>('requests');

  protected readonly status = signal('');
  protected readonly processKey = signal('');
  protected readonly q = signal('');
  protected readonly page = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly results = signal<InstancePage | null>(null);
  protected readonly pages = computed(() => {
    const r = this.results();
    return r ? Math.max(1, Math.ceil(r.total / r.size)) : 1;
  });

  protected readonly jobsState = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly jobs = signal<DeadJob[]>([]);
  /** The list stops at a cap; then the count is "at least". */
  protected readonly jobsCapped = computed(() => this.jobs().length >= JOBS_CAP);
  protected readonly jobsCount = computed(() => (this.jobsCapped() ? `${JOBS_CAP}+` : String(this.jobs().length)));
  /** Published processes, as suggestions for the "Process" filter (a retired one can still be typed). */
  protected readonly processKeys = signal<string[]>([]);

  /** The requests and jobs an action is running on; their buttons are disabled meanwhile. */
  protected readonly busy = signal<ReadonlySet<string>>(new Set());

  /** The list requests in flight; a newer one replaces it, so a slow answer never overwrites a later page or search. */
  private listRequest: Subscription | null = null;
  private jobsRequest: Subscription | null = null;

  constructor() {
    this.load();
    this.loadJobs();
    this.workflow.catalog(true).subscribe({
      next: (entries) => this.processKeys.set(entries.map((entry) => entry.key)),
      error: () => undefined, // suggestions only
    });
    inject(DestroyRef).onDestroy(() => {
      this.listRequest?.unsubscribe();
      this.jobsRequest?.unsubscribe();
    });
  }

  protected search(): void {
    this.page.set(0);
    this.load();
  }

  protected go(delta: number): void {
    this.page.update((p) => Math.min(Math.max(0, p + delta), this.pages() - 1));
    this.load();
  }

  protected retryLoad(): void {
    this.state.set('loading');
    this.load();
  }

  protected act(instance: InstanceSummary, action: Action): void {
    const reference = instance.businessKey ?? instance.id;
    if (action === 'cancel'
      && !window.confirm(`Cancel the request ${reference}? Its open tasks are closed and it cannot be started again.`)) {
      return;
    }
    this.setBusy(instance.id, true);
    this.api[action](instance.id).subscribe({
      next: () => {
        this.setBusy(instance.id, false);
        this.toasts.success(DONE[action]);
        this.load();
        this.loadJobs(); // cancelling a request cancels its jobs
      },
      // The failure has been shown as a toast. The request may have changed meanwhile: show what is true.
      error: () => {
        this.setBusy(instance.id, false);
        this.load();
        this.loadJobs();
      },
    });
  }

  protected retry(job: DeadJob): void {
    this.setBusy(job.id, true);
    this.api.retry(job.id).subscribe({
      next: () => {
        this.setBusy(job.id, false);
        this.toasts.success('The job will be tried again.');
        this.loadJobs();
      },
      error: () => {
        this.setBusy(job.id, false);
        this.loadJobs();
      },
    });
  }

  private setBusy(id: string, busy: boolean): void {
    this.busy.update((ids) => {
      const next = new Set(ids);
      if (busy) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  protected loadJobs(): void {
    this.jobsRequest?.unsubscribe();
    this.jobsRequest = this.api.deadJobs(true).subscribe({
      next: (list) => {
        this.jobs.set(list);
        this.jobsState.set('ready');
      },
      error: () => this.jobsState.set('failed'),
    });
  }

  private load(): void {
    this.listRequest?.unsubscribe();
    this.listRequest = this.api
      .instances({ status: this.status(), processKey: this.processKey(), q: this.q(), page: this.page() }, true)
      .subscribe({
        next: (r) => {
          if (r.items.length === 0 && r.total > 0 && this.page() > 0) {
            // The page we were on has emptied (its requests were cancelled or finished): step back.
            this.page.set(Math.max(0, Math.ceil(r.total / r.size) - 1));
            this.load();
            return;
          }
          this.results.set(r);
          this.state.set('ready');
        },
        error: () => this.state.set('failed'),
      });
  }
}
