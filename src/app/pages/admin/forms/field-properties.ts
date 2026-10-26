import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { FieldType, FormDefinition, FormField, FormOption, holdsValue } from '../../../core/forms/form.models';
import { columnsOf, effectiveSpan } from '../../../core/forms/form-layout';
import { toNumber } from '../../../core/forms/form-values';
import { FIELD_KEY, earlierInputs, typeLabel } from './builder-model';
import { ConditionEditor } from './condition-editor';

const COLUMN_TYPES: FieldType[] = ['text', 'number', 'currency', 'date'];

/** Everything a designer can set on one field; emits small patches for the editor to apply. */
@Component({
  selector: 'app-field-properties',
  imports: [ConditionEditor],
  templateUrl: './field-properties.html',
})
export class FieldProperties {
  readonly field = input.required<FormField>();
  readonly definition = input.required<FormDefinition>();
  readonly change = output<Partial<FormField>>();

  protected readonly keyDraft = linkedSignal(() => this.field().key);
  protected readonly keyError = computed(() => {
    const key = this.keyDraft();
    if (!FIELD_KEY.test(key)) {
      return 'Keys start with a letter and use only letters, digits or _.';
    }
    if (key !== this.field().key && this.definition().fields.some((f) => f.key === key)) {
      return `"${key}" is already used by another field.`;
    }
    return null;
  });
  protected readonly earlier = computed(() => earlierInputs(this.definition(), this.field().key));
  protected readonly sections = computed(() => this.definition().sections ?? []);
  /** Columns of the field's section; a field in no section has one. */
  protected readonly sectionColumns = computed(() => {
    const section = this.sections().find((s) => s.id === this.field().section);
    return section ? columnsOf(section.columns) : 1;
  });
  protected readonly widths = computed(() => Array.from({ length: this.sectionColumns() }, (_, i) => i + 1));
  protected readonly width = computed(() => effectiveSpan(this.field(), this.sectionColumns()));
  protected readonly isInput = computed(() => holdsValue(this.field()));
  protected readonly type = computed(() => this.field().type);
  protected readonly typeLabel = typeLabel;
  protected readonly columnTypes = COLUMN_TYPES;

  protected commitKey(): void {
    if (!this.keyError() && this.keyDraft() !== this.field().key) {
      this.change.emit({ key: this.keyDraft() });
    }
  }

  protected set<K extends keyof FormField>(property: K, value: FormField[K]): void {
    this.change.emit({ [property]: value } as Partial<FormField>);
  }

  protected setText(property: 'label' | 'help' | 'pattern', text: string): void {
    this.set(property, property === 'label' ? text : text.trim() === '' ? undefined : text);
  }

  protected setNumber(property: 'min' | 'max' | 'minLength' | 'maxLength' | 'minRows' | 'maxRows', text: string): void {
    this.set(property, toNumber(text) ?? undefined);
  }

  protected setSection(id: string): void {
    this.set('section', id === '' ? undefined : id);
  }

  protected widthLabel(columns: number): string {
    return columns === this.sectionColumns() ? 'Full width' : columns === 1 ? '1 column' : `${columns} columns`;
  }

  // ---- options

  protected options(): FormOption[] {
    return this.field().options ?? [];
  }

  protected setOption(index: number, part: 'value' | 'label', text: string): void {
    this.set('options', this.options().map((o, i) => (i === index ? { ...o, [part]: text } : o)));
  }

  protected addOption(): void {
    const n = this.options().length + 1;
    this.set('options', [...this.options(), { value: `option${n}`, label: `Option ${n}` }]);
  }

  protected removeOption(index: number): void {
    const next = this.options().filter((_, i) => i !== index);
    this.set('options', next.length ? next : undefined);
  }

  // ---- table columns

  protected columns(): FormField[] {
    return this.field().columns ?? [];
  }

  protected setColumn(index: number, patch: Partial<FormField>): void {
    const column = this.columns()[index];
    this.set('columns', this.columns().map((c, i) => (i === index ? { ...c, ...patch } : c)));
    if (!this.totalled(column.key)) {
      return;
    }
    // A totalled column that is renamed keeps its total; one that stops being numeric loses it.
    const renamed = patch.key !== undefined && patch.key !== column.key;
    const notNumeric = patch.type !== undefined && !this.numeric(patch.type);
    if (renamed || notNumeric) {
      const others = (this.field().totals ?? []).filter((t) => t !== column.key);
      const next = notNumeric ? others : [...others, patch.key!];
      this.set('totals', next.length ? next : undefined);
    }
  }

  protected addColumn(): void {
    const n = this.columns().length + 1;
    this.set('columns', [...this.columns(), { key: `column${n}`, type: 'text', label: `Column ${n}` }]);
  }

  protected removeColumn(index: number): void {
    const removed = this.columns()[index].key;
    this.set('columns', this.columns().filter((_, i) => i !== index));
    if (this.field().totals?.includes(removed)) {
      this.set('totals', this.field().totals!.filter((t) => t !== removed));
    }
  }

  protected totalled(key: string): boolean {
    return this.field().totals?.includes(key) ?? false;
  }

  protected toggleTotal(key: string, on: boolean): void {
    const totals = (this.field().totals ?? []).filter((t) => t !== key);
    this.set('totals', on ? [...totals, key] : totals.length ? totals : undefined);
  }

  protected numeric(type: FieldType): boolean {
    return type === 'number' || type === 'currency';
  }
}
