import { DecimalPipe } from '@angular/common';
import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { UserSummary } from '../identity/identity.models';
import { UserName } from '../identity/user-name';
import { UserPicker } from '../identity/user-picker';
import { FileField } from './file-field';
import { FieldError, FileRef, FormField } from './form.models';
import { columnTotal, isoToLocalInput, localInputToIso, toNumber } from './form-values';

/**
 * Draws one field of a form: label, control, help and problem. The renderer uses it to fill a form in; the form
 * designer uses it in design mode, where it looks the same but nothing can be changed.
 */
@Component({
  selector: 'app-form-field',
  imports: [DecimalPipe, FileField, UserName, UserPicker],
  templateUrl: './form-field.html',
  host: { class: 'block' },
})
export class FormFieldView {
  readonly field = input.required<FormField>();
  readonly value = input<unknown>(undefined);
  readonly readOnly = input(false);
  /** Problems to show; the field picks out its own, and a table those of its cells. */
  readonly errors = input<FieldError[]>([]);
  /** On the designer's canvas: drawn as it will look, but nothing can be changed. */
  readonly design = input(false);
  readonly valueChange = output<unknown>();
  /** A file field says while an upload is running. */
  readonly busy = output<boolean>();

  /**
   * The value as last changed here. Several changes can arrive before the owner hands the new value back (two quick
   * clicks on "Add a row"); each must build on the one before, not on the value the field was last given.
   */
  protected readonly current = linkedSignal(() => this.value());
  protected readonly locked = computed(() => this.readOnly() || this.design());
  protected readonly rows = computed<Record<string, unknown>[]>(() => {
    const value = this.current();
    const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    return this.design() && !rows.length ? [{}] : rows;
  });
  protected readonly fileRefs = computed<FileRef[]>(() => {
    const value = this.current();
    return Array.isArray(value) ? (value as FileRef[]) : [];
  });
  protected readonly canAddRow = computed(() => {
    const max = this.field().maxRows;
    return !this.locked() && (max == null || this.rows().length < max);
  });

  protected emit(value: unknown): void {
    this.current.set(value);
    this.valueChange.emit(value);
  }

  protected text(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  protected localDateTime(): string {
    return isoToLocalInput(this.current());
  }

  protected checked(option: string): boolean {
    const value = this.current();
    return Array.isArray(value) && value.includes(option);
  }

  protected errorFor(path: string): string | undefined {
    return this.errors().find((error) => error.field === path)?.message;
  }

  protected setText(event: Event): void {
    this.emit((event.target as HTMLInputElement).value);
  }

  protected setNumber(event: Event): void {
    this.emit(toNumber((event.target as HTMLInputElement).value));
  }

  protected setDateTime(event: Event): void {
    this.emit(localInputToIso((event.target as HTMLInputElement).value));
  }

  protected toggle(option: string, event: Event): void {
    const value = this.current();
    const current = Array.isArray(value) ? (value as string[]) : [];
    const on = (event.target as HTMLInputElement).checked;
    this.emit(on ? [...current.filter((v) => v !== option), option] : current.filter((v) => v !== option));
  }

  protected pickUser(user: UserSummary): void {
    this.emit(user.id);
  }

  protected addRow(): void {
    this.emit([...this.rows(), {}]);
  }

  protected removeRow(index: number): void {
    this.emit(this.rows().filter((_, i) => i !== index));
  }

  protected setCell(index: number, column: FormField, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const cell = column.type === 'number' || column.type === 'currency' ? toNumber(raw) : raw;
    this.emit(this.rows().map((row, i) => (i === index ? { ...row, [column.key]: cell } : row)));
  }

  protected total(column: string): number {
    return columnTotal(this.current(), column);
  }
}
