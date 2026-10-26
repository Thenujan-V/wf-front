import { Component, computed, input, output, signal } from '@angular/core';
import { Operator } from '../../../core/expression/condition';
import { FormField } from '../../../core/forms/form.models';
import { toNumber } from '../../../core/forms/form-values';
import {
  CUSTOM_TYPES, CustomType, RuleField, RuleModel, RuleRow, customField, customTypeOf, defaultValue, needsValue, operatorsFor,
  readRule, writeRule,
} from './condition-rows';

type ValueKind = 'boolean' | 'options' | 'number' | 'date' | 'text';

/** The field picker's choice for "a field I name myself". */
export const CUSTOM_FIELD = '__custom__';

/** Builds a "show when" / "required when" rule from the fields above the one being edited. */
@Component({
  selector: 'app-condition-editor',
  templateUrl: './condition-editor.html',
})
export class ConditionEditor {
  readonly label = input.required<string>();
  readonly testId = input.required<string>();
  /** The input fields the rule may use: those above the field being edited. */
  readonly fields = input.required<RuleField[]>();
  readonly condition = input<unknown>(undefined);
  /** What field keys stand for: form fields by default; with '' each key is a full variable path. */
  readonly prefix = input('form.');
  /** Lets a rule test a field that is not listed, named and typed by hand (e.g. amount, as a number). */
  readonly allowCustom = input(false);
  /** Shown instead of "Add a condition" when there is nothing to build a rule on. */
  readonly emptyHint = input('Rules can only use fields above this one, and there are none yet.');
  readonly conditionChange = output<unknown>();

  protected readonly customField = CUSTOM_FIELD;
  protected readonly customTypes = CUSTOM_TYPES;
  /** The type chosen for each hand-named field, so it survives comparisons that drop the value (is empty). */
  private readonly chosenTypes = signal<Record<string, CustomType>>({});

  protected readonly read = computed(() => readRule(this.condition(), this.prefix()));
  /** The fields in picker order, under their headings; fields without a group come first, unheaded. */
  protected readonly groups = computed(() => {
    const groups: { name: string; fields: RuleField[] }[] = [];
    for (const field of this.fields()) {
      const name = field.group ?? '';
      const group = groups.find((g) => g.name === name);
      if (group) {
        group.fields.push(field);
      } else {
        groups.push({ name, fields: [field] });
      }
    }
    return groups;
  });
  protected readonly model = computed(() => {
    const read = this.read();
    return read.kind === 'rows' ? read.model : null;
  });
  protected readonly needsValue = needsValue;

  /** A row on a field the picker doesn't list, which the author named by hand. */
  protected isCustom(r: RuleRow): boolean {
    return this.allowCustom() && !this.listed(r.field);
  }

  protected customType(r: RuleRow): CustomType {
    return this.chosenTypes()[r.field] ?? customTypeOf(r);
  }

  /** The name shown for a hand-named field: form fields without their form. prefix. */
  protected customName(r: RuleRow): string {
    return r.field.startsWith('form.') ? r.field.slice('form.'.length) : r.field;
  }

  protected fieldOf(r: RuleRow): FormField | undefined {
    return this.listed(r.field) ?? (this.isCustom(r) ? customField(r.field, this.customType(r)) : undefined);
  }

  protected operators(r: RuleRow) {
    return operatorsFor(this.fieldOf(r));
  }

  protected optionsOf(r: RuleRow) {
    return this.fieldOf(r)?.options ?? [];
  }

  protected hasOption(r: RuleRow): boolean {
    return this.optionsOf(r).some((o) => o.value === r.value);
  }

  protected valueKind(r: RuleRow): ValueKind {
    const field = this.fieldOf(r);
    switch (field?.type) {
      case 'checkbox':
        return field.options?.length ? 'options' : 'boolean';
      case 'select':
      case 'radio':
        return 'options';
      case 'number':
      case 'currency':
        return 'number';
      case 'date':
      case 'datetime':
        return 'date';
      default:
        return 'text';
    }
  }

  protected text(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  protected add(): void {
    const field = this.fields()[0];
    const next = field ? fresh(field) : this.freshCustom('form.amount', 'number');
    const current = this.model() ?? { mode: 'all' as const, rows: [] };
    this.emit({ ...current, rows: [...current.rows, next] });
  }

  protected addCustom(): void {
    const current = this.model() ?? { mode: 'all' as const, rows: [] };
    this.emit({ ...current, rows: [...current.rows, this.freshCustom('form.amount', 'number')] });
  }

  protected setMode(mode: 'all' | 'any'): void {
    const current = this.model();
    if (current) {
      this.emit({ ...current, mode });
    }
  }

  protected setField(index: number, key: string): void {
    if (key === CUSTOM_FIELD) {
      this.replace(index, this.freshCustom('form.amount', 'number'));
      return;
    }
    this.replace(index, fresh(this.listed(key)!));
  }

  /** A bare name is a form field (amount → form.amount); a dotted one is a variable path (status.paid). */
  protected setCustomName(index: number, text: string): void {
    const name = text.trim();
    const current = this.model()!.rows[index];
    if (!name) {
      return;
    }
    const field = this.prefix() === '' && !name.includes('.') ? `form.${name}` : name;
    const type = this.customType(current);
    this.chosenTypes.update((types) => ({ ...types, [field]: type }));
    this.replace(index, { ...current, field });
  }

  protected setCustomType(index: number, type: CustomType): void {
    this.replace(index, this.freshCustom(this.model()!.rows[index].field, type));
  }

  protected setOp(index: number, op: Operator): void {
    const current = this.model()!.rows[index];
    const keep = needsValue(op) && current.value !== undefined ? current.value : defaultValue(this.fieldOf(current), op);
    this.replace(index, row(current.field, op, keep));
  }

  protected setValue(index: number, value: unknown): void {
    const current = this.model()!.rows[index];
    this.replace(index, { ...current, value });
  }

  protected setNumber(index: number, text: string): void {
    this.setValue(index, toNumber(text));
  }

  protected remove(index: number): void {
    const current = this.model()!;
    this.emit({ ...current, rows: current.rows.filter((_, i) => i !== index) });
  }

  protected clear(): void {
    this.conditionChange.emit(undefined);
  }

  private listed(key: string): FormField | undefined {
    return this.fields().find((f) => f.key === key);
  }

  private freshCustom(field: string, type: CustomType): RuleRow {
    this.chosenTypes.update((types) => ({ ...types, [field]: type }));
    return fresh(customField(field, type));
  }

  private replace(index: number, next: RuleRow): void {
    const current = this.model()!;
    this.emit({ ...current, rows: current.rows.map((r, i) => (i === index ? next : r)) });
  }

  private emit(model: RuleModel): void {
    this.conditionChange.emit(writeRule(model, this.prefix()));
  }
}

/** A row on this field with its first comparison and a value that makes it valid straight away. */
function fresh(field: FormField): RuleRow {
  const op = operatorsFor(field)[0].op;
  return row(field.key, op, defaultValue(field, op));
}

function row(field: string, op: Operator, value: unknown): RuleRow {
  return value === undefined ? { field, op } : { field, op, value };
}
