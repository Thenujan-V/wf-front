import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { fileNames } from '../../core/forms/form-values';
import { UserName } from '../../core/identity/user-name';
import { commentKey, isCommentKey } from '../../core/workflow/comments';
import { SlaBadge } from '../../core/workflow/sla-badge';
import { StatusBadge } from '../../core/workflow/status-badge';
import { WorkflowApi } from '../../core/workflow/workflow.api';
import { HistoryEntry, InstanceDetail } from '../../core/workflow/workflow.models';
import { Attachments } from '../documents/attachments';
import { describeEvent } from './timeline';

type LoadState = 'loading' | 'ready' | 'not-found' | 'failed';

@Component({
  selector: 'app-request-detail',
  imports: [Attachments, DatePipe, RouterLink, SlaBadge, StatusBadge, UserName],
  templateUrl: './request-detail.html',
})
export class RequestDetailPage {
  private readonly api = inject(WorkflowApi);

  /** Route parameter :id. */
  readonly id = input.required<string>();
  protected readonly state = signal<LoadState>('loading');
  protected readonly detail = signal<InstanceDetail | null>(null);
  private readonly history = signal<HistoryEntry[]>([]);

  protected readonly openTasks = computed(() =>
    (this.detail()?.tasks ?? []).filter((t) => t.status === 'OPEN' || t.status === 'CLAIMED'));
  private readonly form = computed(() => {
    const form = this.detail()?.variables['form'];
    return form && typeof form === 'object' ? (form as Record<string, unknown>) : {};
  });
  /** What the requester submitted; approvers' comments are shown on the timeline instead. */
  protected readonly details = computed(() => Object.entries(this.form()).filter(([key]) => !isCommentKey(key)));
  protected readonly timeline = computed(() => {
    const names = new Map((this.detail()?.tasks ?? []).map((t) => [t.id, t.name]));
    return this.history()
      .map((entry) => ({ entry, text: describeEvent(entry, names), comment: this.commentFor(entry) }))
      .filter((line): line is { entry: HistoryEntry; text: string; comment: string | null } => line.text !== null);
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  protected load(id = this.id()): void {
    this.state.set('loading');
    forkJoin([this.api.request(id, true), this.api.history(id, true)]).subscribe({
      next: ([detail, history]) => {
        this.detail.set(detail);
        this.history.set(history);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        const hidden = error instanceof HttpErrorResponse && (error.status === 404 || error.status === 403);
        this.state.set(hidden ? 'not-found' : 'failed');
      },
    });
  }

  private commentFor(entry: HistoryEntry): string | null {
    if (entry.type !== 'TaskCompleted') {
      return null;
    }
    const comment = this.form()[commentKey(String(entry.data['taskId']))];
    return typeof comment === 'string' && comment ? comment : null;
  }

  protected format(value: unknown): string {
    if (value === null || value === undefined) {
      return '—';
    }
    return fileNames(value) ?? (typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
}
