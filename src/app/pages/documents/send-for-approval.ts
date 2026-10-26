import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DocumentView } from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents.api';
import { FormRenderer } from '../../core/forms/form-renderer';
import { FieldError, FormDefinition } from '../../core/forms/form.models';
import { FormsApi } from '../../core/forms/forms.api';
import { problemMessage } from '../../core/http/problem.interceptor';
import { ToastService } from '../../core/ui/toast.service';
import { WorkflowApi } from '../../core/workflow/workflow.api';
import { CatalogEntry, InstanceSummary } from '../../core/workflow/workflow.models';

/**
 * Spec §6 "Send for approval…": start a chosen process (with its start form, if it has one), then attach this
 * document to the new request. A request that started but could not take the document says so and can try again.
 */
@Component({
  selector: 'app-send-for-approval',
  imports: [FormRenderer, RouterLink],
  templateUrl: './send-for-approval.html',
})
export class SendForApproval {
  private readonly workflow = inject(WorkflowApi);
  private readonly documents = inject(DocumentsApi);
  private readonly formsApi = inject(FormsApi);
  private readonly toasts = inject(ToastService);
  private readonly renderer = viewChild(FormRenderer);

  readonly document = input.required<DocumentView>();
  readonly linked = output<DocumentView>();
  readonly closed = output<void>();

  protected readonly catalog = signal<CatalogEntry[] | null>(null);
  protected readonly catalogFailed = signal(false);
  protected readonly chosen = signal<CatalogEntry | null>(null);
  protected readonly startForm = signal<FormDefinition | null>(null);
  protected readonly formFailed = signal(false);
  protected readonly serverErrors = signal<FieldError[]>([]);
  protected readonly businessKey = signal('');
  protected readonly working = signal(false);
  /** The request started here; the document may not be attached to it yet. */
  protected readonly started = signal<InstanceSummary | null>(null);
  protected readonly linkError = signal<string | null>(null);

  constructor() {
    this.workflow.catalog(true).subscribe({ next: (c) => this.catalog.set(c), error: () => this.catalogFailed.set(true) });
  }

  protected choose(key: string): void {
    const entry = this.catalog()?.find((e) => e.key === key) ?? null;
    this.chosen.set(entry);
    this.startForm.set(null);
    this.formFailed.set(false);
    this.serverErrors.set([]);
    const ref = entry?.startForm;
    if (!ref) {
      return;
    }
    this.formsApi.version(ref.key, ref.version, true).subscribe({
      next: (form) => this.chosen() === entry && this.startForm.set(form.definition),
      error: () => this.chosen() === entry && this.formFailed.set(true),
    });
  }

  protected submit(): void {
    const entry = this.chosen();
    if (!entry || this.working()) {
      return;
    }
    let data: Record<string, unknown> = {};
    if (entry.startForm) {
      const values = this.renderer()?.submit();
      if (!values) {
        return; // the form shows what needs fixing
      }
      data = values;
    }
    this.working.set(true);
    this.serverErrors.set([]);
    this.workflow.start({ processKey: entry.key, businessKey: this.businessKey().trim() || null, data }).subscribe({
      next: (instance) => {
        this.started.set(instance);
        this.link();
      },
      error: (error: unknown) => {
        this.working.set(false);
        const body = error instanceof HttpErrorResponse ? (error.error as { code?: string; errors?: FieldError[] }) : null;
        if (body?.code === 'FORM_VALIDATION_FAILED' && Array.isArray(body.errors)) {
          this.serverErrors.set(body.errors);
        }
      },
    });
  }

  protected link(): void {
    const instance = this.started();
    if (!instance) {
      return;
    }
    this.working.set(true);
    this.linkError.set(null);
    this.documents.link(this.document().id, instance.id).subscribe({
      next: (document) => {
        this.working.set(false);
        this.toasts.success('Sent for approval');
        this.linked.emit(document);
      },
      error: (error: unknown) => {
        this.working.set(false);
        this.linkError.set(error instanceof HttpErrorResponse ? problemMessage(error) : 'The document could not be attached.');
      },
    });
  }
}
