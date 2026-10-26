import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, linkedSignal, output, signal, untracked, viewChild } from '@angular/core';
import { DocumentType, DocumentView, FormRef } from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents.api';
import { FormRenderer } from '../../core/forms/form-renderer';
import { Access, FieldError, FormDefinition } from '../../core/forms/form.models';
import { FormsApi } from '../../core/forms/forms.api';
import { ToastService } from '../../core/ui/toast.service';

/** A document's type and its metadata, entered through the type's published form (spec §6). */
@Component({
  selector: 'app-metadata-editor',
  imports: [FormRenderer],
  templateUrl: './metadata-editor.html',
})
export class MetadataEditor {
  private readonly api = inject(DocumentsApi);
  private readonly forms = inject(FormsApi);
  private readonly toasts = inject(ToastService);
  private readonly renderer = viewChild(FormRenderer);

  readonly document = input.required<DocumentView>();
  readonly editable = input(false);
  readonly saved = output<DocumentView>();

  protected readonly types = signal<DocumentType[] | null>(null);
  protected readonly typesFailed = signal(false);
  /**
   * The saved type and metadata. A check-out or rename also replaces the document, but must not throw away what
   * the person is typing, so only a change to these (or another document) resets the form.
   */
  private readonly stored = computed(
    () => ({ id: this.document().id, typeId: this.document().typeId, metadata: this.document().metadata }),
    { equal: (a, b) => a.id === b.id && a.typeId === b.typeId && JSON.stringify(a.metadata) === JSON.stringify(b.metadata) },
  );
  protected readonly typeId = linkedSignal<string | null>(() => this.stored().typeId);
  protected readonly type = computed(() => this.types()?.find((t) => t.id === this.typeId()) ?? null);
  protected readonly definition = signal<FormDefinition | null>(null);
  protected readonly formFailed = signal(false);
  protected readonly serverErrors = signal<FieldError[]>([]);
  protected readonly saving = signal(false);
  /** Everything read-only for people who cannot change the document. */
  protected readonly access = computed<Record<string, Access>>(() => this.editable() ? {}
    : Object.fromEntries((this.definition()?.fields ?? []).map((f) => [f.key, 'READONLY' as Access])));
  protected readonly initial = computed(() => (this.typeId() === this.stored().typeId ? this.stored().metadata : {}));
  /** Saving is only offered when what is shown is what would be saved: the type is known and its fields loaded. */
  protected readonly canSave = computed(() => {
    if (!this.editable() || this.types() === null || this.typesFailed()) {
      return false;
    }
    if (!this.typeId()) {
      return true;
    }
    const type = this.type();
    return !!type && (!type.form || this.definition() !== null);
  });

  constructor() {
    this.api.types(true).subscribe({
      next: (types) => this.types.set(types),
      error: () => {
        this.typesFailed.set(true);
        this.types.set([]);
      },
    });
    effect(() => {
      const form = this.type()?.form ?? null;
      untracked(() => this.loadForm(form));
    });
  }

  private loadForm(form: FormRef | null): void {
    this.definition.set(null);
    this.formFailed.set(false);
    this.serverErrors.set([]);
    if (!form) {
      return;
    }
    this.forms.version(form.key, form.version, true).subscribe({
      next: (published) => {
        if (this.type()?.form === form) {
          this.definition.set(published.definition);
        }
      },
      error: () => this.formFailed.set(true),
    });
  }

  protected setType(id: string): void {
    this.typeId.set(id || null);
  }

  protected save(): void {
    let metadata: Record<string, unknown> = {};
    if (this.type()?.form) {
      const values = this.renderer()?.submit();
      if (!values) {
        return;
      }
      metadata = values;
    }
    this.saving.set(true);
    this.api.setMetadata(this.document().id, this.typeId(), metadata).subscribe({
      next: (document) => {
        this.saving.set(false);
        this.serverErrors.set([]);
        this.toasts.success('Metadata saved');
        this.saved.emit(document);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        const body = error instanceof HttpErrorResponse ? (error.error as { code?: string; errors?: FieldError[] } | null) : null;
        if (body?.code === 'DOC_METADATA_INVALID' && Array.isArray(body.errors)) {
          this.serverErrors.set(body.errors);
        }
      },
    });
  }
}
