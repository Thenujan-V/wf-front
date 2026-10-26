import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, linkedSignal, output, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { UserSummary } from '../../core/identity/identity.models';
import { UserName } from '../../core/identity/user-name';
import { UserPicker } from '../../core/identity/user-picker';
import { ToastService } from '../../core/ui/toast.service';
import { FormRenderer } from '../../core/forms/form-renderer';
import { FieldError, FormDefinition } from '../../core/forms/form.models';
import { FormsApi } from '../../core/forms/forms.api';
import { goesAgainst, humanize } from '../../core/workflow/labels';
import { SlaBadge } from '../../core/workflow/sla-badge';
import { WorkflowApi } from '../../core/workflow/workflow.api';
import { TaskFormView, TaskView } from '../../core/workflow/workflow.models';
import { Attachments } from '../documents/attachments';

@Component({
  selector: 'app-task-panel',
  imports: [Attachments, FormRenderer, RouterLink, SlaBadge, UserName, UserPicker],
  templateUrl: './task-panel.html',
})
export class TaskPanel {
  private readonly api = inject(WorkflowApi);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);

  readonly task = input.required<TaskView>();
  /** Fires after any action, successful or not, so the inbox reloads. */
  readonly changed = output<void>();

  protected readonly me = computed(() => this.auth.userId());
  protected readonly mine = computed(() => this.task().assigneeId === this.me());
  protected readonly claimable = computed(() => !this.task().assigneeId && this.task().candidates.length > 0);
  protected readonly releasable = computed(() => this.mine() && this.task().status === 'CLAIMED');
  protected readonly working = signal(false);
  /** Drafts belong to one task: they reset whenever the panel shows a different task. */
  protected readonly comment = linkedSignal({ source: () => this.task().id, computation: () => '' });
  protected readonly delegating = linkedSignal({ source: () => this.task().id, computation: () => false });
  protected readonly humanize = humanize;

  /**
   * One main button per panel: the first outcome, in the order the process designer gave them, that does not go
   * against the request. Outcomes that do (reject, decline, deny) get the red outline; the rest are plain.
   */
  protected tone(outcome: string): 'primary' | 'secondary' | 'danger' {
    if (goesAgainst(outcome)) {
      return 'danger';
    }
    return outcome === this.task().outcomes.find((o) => !goesAgainst(o)) ? 'primary' : 'secondary';
  }

  private readonly formsApi = inject(FormsApi);
  private readonly renderer = viewChild(FormRenderer);
  /** The task form's parts; they reset whenever the panel shows a different task. */
  protected readonly formView = linkedSignal<string, TaskFormView | null>({ source: () => this.task().id, computation: () => null });
  protected readonly formDefinition = linkedSignal<string, FormDefinition | null>({ source: () => this.task().id, computation: () => null });
  protected readonly formFailed = linkedSignal({ source: () => this.task().id, computation: () => false });
  protected readonly serverErrors = linkedSignal<string, FieldError[]>({ source: () => this.task().id, computation: () => [] });

  constructor() {
    effect(() => {
      const task = this.task();
      if (task.formKey && task.formVersion != null && task.assigneeId === this.auth.userId()) {
        untracked(() => this.loadForm(task.id, task.formKey!, task.formVersion!));
      }
    });
  }

  private loadForm(taskId: string, key: string, version: number): void {
    forkJoin([this.api.taskForm(taskId, true), this.formsApi.version(key, version, true)]).subscribe({
      next: ([view, form]) => {
        if (this.task().id === taskId) {
          this.formView.set(view);
          this.formDefinition.set(form.definition);
        }
      },
      error: () => {
        if (this.task().id === taskId) {
          this.formFailed.set(true);
        }
      },
    });
  }

  protected complete(outcome: string): void {
    let data: Record<string, unknown> = {};
    if (this.task().formKey) {
      const values = this.renderer()?.submit();
      if (!values) {
        return; // the form shows what needs fixing
      }
      data = values;
    }
    const comment = this.comment().trim() || undefined;
    this.serverErrors.set([]);
    this.run(this.api.complete(this.task().id, outcome, data, comment), `${this.task().name}: ${humanize(outcome)}`);
  }

  protected claim(): void {
    this.run(this.api.claim(this.task().id), 'Task claimed. It is now in My tasks.');
  }

  protected unclaim(): void {
    this.run(this.api.unclaim(this.task().id), 'Task released back to the group.');
  }

  protected delegate(user: UserSummary): void {
    this.run(this.api.delegate(this.task().id, user.id), `Task delegated to ${user.displayName || user.username}.`);
  }

  private run(action: Observable<void>, success: string): void {
    if (this.working()) {
      return;
    }
    this.working.set(true);
    action.subscribe({
      next: () => {
        this.working.set(false);
        this.toasts.success(success);
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.working.set(false);
        const body = error instanceof HttpErrorResponse ? (error.error as { code?: string; errors?: FieldError[] }) : null;
        if (body?.code === 'FORM_VALIDATION_FAILED' && Array.isArray(body.errors)) {
          this.serverErrors.set(body.errors); // the person fixes the form; the task is not stale
          return;
        }
        // The problem interceptor has already told the user why; refresh so a stale task disappears.
        this.changed.emit();
      },
    });
  }
}
