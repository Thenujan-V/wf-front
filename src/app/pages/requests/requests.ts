import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormRenderer } from '../../core/forms/form-renderer';
import { FieldError, FormDefinition } from '../../core/forms/form.models';
import { FormsApi } from '../../core/forms/forms.api';
import { ToastService } from '../../core/ui/toast.service';
import { StatusBadge } from '../../core/workflow/status-badge';
import { WorkflowApi } from '../../core/workflow/workflow.api';
import { CatalogEntry, InstanceSummary } from '../../core/workflow/workflow.models';
import { DetailRow, parseDetails } from './details';

@Component({
  selector: 'app-requests',
  imports: [DatePipe, FormRenderer, RouterLink, StatusBadge],
  templateUrl: './requests.html',
})
export class RequestsPage {
  private readonly api = inject(WorkflowApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly formsApi = inject(FormsApi);
  private readonly renderer = viewChild(FormRenderer);
  protected readonly startForm = signal<FormDefinition | null>(null);
  protected readonly formFailed = signal(false);
  protected readonly serverErrors = signal<FieldError[]>([]);

  protected readonly catalog = signal<CatalogEntry[] | null>(null);
  protected readonly requests = signal<InstanceSummary[] | null>(null);
  protected readonly failed = signal(false);

  protected readonly starting = signal<CatalogEntry | null>(null);
  protected readonly businessKey = signal('');
  protected readonly rows = signal<DetailRow[]>([{ name: '', value: '' }]);
  protected readonly errors = signal<string[]>([]);
  protected readonly submitting = signal(false);

  constructor() {
    // Load failures show on the page, so they are not toasted as well.
    this.api.catalog(true).subscribe({ next: (c) => this.catalog.set(c), error: () => this.failed.set(true) });
    this.api.myRequests(true).subscribe({ next: (r) => this.requests.set(r), error: () => this.failed.set(true) });
  }

  protected open(entry: CatalogEntry): void {
    this.starting.set(entry);
    this.businessKey.set('');
    this.rows.set([{ name: '', value: '' }]);
    this.errors.set([]);
    this.serverErrors.set([]);
    this.startForm.set(null);
    this.formFailed.set(false);
    const ref = entry.startForm;
    if (ref) {
      this.formsApi.version(ref.key, ref.version, true).subscribe({
        next: (form) => {
          if (this.starting() === entry) {
            this.startForm.set(form.definition);
          }
        },
        error: () => this.formFailed.set(true),
      });
    }
  }

  protected setRow(index: number, field: keyof DetailRow, value: string): void {
    this.rows.update((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  protected addRow(): void {
    this.rows.update((rows) => [...rows, { name: '', value: '' }]);
  }

  protected removeRow(index: number): void {
    this.rows.update((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : [{ name: '', value: '' }]));
  }

  protected submit(): void {
    const entry = this.starting();
    if (!entry || this.submitting()) {
      return;
    }
    let data: Record<string, unknown>;
    if (entry.startForm) {
      const values = this.renderer()?.submit();
      if (!values) {
        return; // the renderer shows what needs fixing
      }
      data = values;
    } else {
      const parsed = parseDetails(this.rows());
      this.errors.set(parsed.errors);
      if (parsed.errors.length) {
        return;
      }
      data = parsed.data;
    }
    this.submitting.set(true);
    this.serverErrors.set([]);
    const businessKey = this.businessKey().trim() || null;
    this.api.start({ processKey: entry.key, businessKey, data }).subscribe({
      next: (started) => {
        this.submitting.set(false);
        this.toasts.success('Request submitted');
        void this.router.navigate(['/requests', started.id]);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        const body = error instanceof HttpErrorResponse ? (error.error as { code?: string; errors?: FieldError[] }) : null;
        if (body?.code === 'FORM_VALIDATION_FAILED' && Array.isArray(body.errors)) {
          this.serverErrors.set(body.errors);
        }
      },
    });
  }
}
