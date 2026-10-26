import { Component, computed, input, linkedSignal, signal } from '@angular/core';
import { FormFieldView } from './form-field';
import { effectiveSpan, gridClass, layoutOf, spanClass } from './form-layout';
import { Access, FieldError, FormDefinition, FormField, holdsValue } from './form.models';
import { conditionHolds, validateSubmission } from './form-validation';

/**
 * Renders a form definition (spec §9 "form renderer"): one component for start forms and task forms.
 * Validation uses the same rules as form-service; the server's answer is still authoritative.
 */
@Component({
  selector: 'app-form-renderer',
  imports: [FormFieldView],
  templateUrl: './form-renderer.html',
})
export class FormRenderer {
  readonly definition = input.required<FormDefinition>();
  readonly access = input<Record<string, Access>>({});
  readonly initial = input<Record<string, unknown>>({});
  readonly serverErrors = input<FieldError[]>([]);

  protected readonly values = linkedSignal<Record<string, unknown>>(() => ({ ...this.initial() }));
  protected readonly attempted = signal(false);
  private readonly result = computed(() =>
    validateSubmission(this.definition(), this.editableValues(), this.access(), this.initial()));
  /** File fields with an upload still running: submitting now would leave those files out. */
  private readonly uploading = signal<ReadonlySet<string>>(new Set());
  protected readonly errors = computed(() => [
    ...(this.attempted() ? [...this.result().errors, ...this.uploadErrors()] : []),
    ...this.serverErrors(),
  ]);
  protected readonly sections = computed(() => layoutOf(this.definition()));

  /** Validates; returns the editable fields' values to submit, or null after showing what needs fixing. */
  submit(): Record<string, unknown> | null {
    this.attempted.set(true);
    const { data, errors } = this.result();
    if (errors.length || this.activeUploads().length) {
      return null;
    }
    const submission: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (this.accessOf(key) === 'EDITABLE') {
        submission[key] = value;
      }
    }
    return submission;
  }

  protected accessOf(key: string): Access {
    return this.access()[key] ?? 'EDITABLE';
  }

  protected shown(field: FormField): boolean {
    return this.accessOf(field.key) !== 'HIDDEN'
      && (field.visibleWhen == null || conditionHolds(field.visibleWhen, { form: this.values() }));
  }

  protected readOnly(field: FormField): boolean {
    return this.accessOf(field.key) === 'READONLY';
  }

  protected readonly gridClass = gridClass;

  protected spanClass(field: FormField, columns: number): string {
    return spanClass(effectiveSpan(field, columns));
  }

  protected value(key: string): unknown {
    return this.values()[key];
  }

  protected set(key: string, value: unknown): void {
    this.values.update((values) => ({ ...values, [key]: value }));
  }

  protected setBusy(key: string, busy: boolean): void {
    this.uploading.update((keys) => {
      const next = new Set(keys);
      if (busy) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  private uploadErrors(): FieldError[] {
    return this.activeUploads().map((key) => ({ field: key, code: 'UPLOADING', message: 'Wait for the files to finish uploading' }));
  }

  /** Uploads of fields on screen: a field a rule hides has stopped its uploads, and its value is not sent. */
  private activeUploads(): string[] {
    const shown = new Set(this.definition().fields.filter((f) => this.shown(f)).map((f) => f.key));
    return [...this.uploading()].filter((key) => shown.has(key));
  }

  /** Editable, shown fields as entered; hidden and read-only values stay with the server. */
  private editableValues(): Record<string, unknown> {
    const values = this.values();
    const editable: Record<string, unknown> = {};
    for (const field of this.definition().fields) {
      if (holdsValue(field) && this.accessOf(field.key) === 'EDITABLE' && Object.hasOwn(values, field.key)) {
        editable[field.key] = values[field.key];
      }
    }
    return editable;
  }
}
