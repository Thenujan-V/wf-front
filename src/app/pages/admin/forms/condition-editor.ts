import { Component, computed, input, output } from '@angular/core';
import { Operator } from '../../../core/expression/condition';
import { FormField } from '../../../core/forms/form.models';
import { toNumber } from '../../../core/forms/form-values';
import { RuleModel, RuleRow, defaultValue, needsValue, operatorsFor, readRule, writeRule } from './condition-rows';

type ValueKind = 'boolean' | 'options' | 'number' | 'date' | 'text';

/** Builds a "show when" / "required when" rule from the fields above the one being edited. */
@Component({
  selector: 'app-condition-editor',
  templateUrl: './condition-editor.html',
})
export class ConditionEditor {
  readonly label = input.required<string>();
  readonly testId = input.required<string>();
  /** The input fields the rule may use: those above the field being edited. */
  readonly fields = input.required<FormField[]>();
  readonly condition = input<unknown>(undefined);
  readonly conditionChange = output<unknown>();

  protected readonly read = computed(() => readRule(this.condition()));
  protected readonly model = computed(() => {
    const read = this.read();
    return read.kind === 'rows' ? read.model : null;
  });
  protected readonly needsValue = needsValue;

  protected fieldOf(key: string): FormField | undefined {
    return this.fields().find((f) => f.key === key);
  }

  protected operators(key: string) {
    return operatorsFor(this.fieldOf(key));
  }

  protected optionsOf(key: string) {
    return this.fieldOf(key)?.options ?? [];
  }

  protected hasOption(key: string, value: unknown): boolean {
    return this.optionsOf(key).some((o) => o.value === value);
  }

  protected valueKind(key: string): ValueKind {
    const field = this.fieldOf(key);
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
    const op = operatorsFor(field)[0].op;
    const current = this.model() ?? { mode: 'all' as const, rows: [] };
    this.emit({ ...current, rows: [...current.rows, row(field.key, op, defaultValue(field, op))] });
  }

  protected setMode(mode: 'all' | 'any'): void {
    const current = this.model();
    if (current) {
      this.emit({ ...current, mode });
    }
  }

  protected setField(index: number, key: string): void {
    const field = this.fieldOf(key);
    const op = operatorsFor(field)[0].op;
    this.replace(index, row(key, op, defaultValue(field, op)));
  }

  protected setOp(index: number, op: Operator): void {
    const current = this.model()!.rows[index];
    const keep = needsValue(op) && current.value !== undefined ? current.value : defaultValue(this.fieldOf(current.field), op);
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

  private replace(index: number, next: RuleRow): void {
    const current = this.model()!;
    this.emit({ ...current, rows: current.rows.map((r, i) => (i === index ? next : r)) });
  }

  private emit(model: RuleModel): void {
    this.conditionChange.emit(writeRule(model));
  }
}

function row(field: string, op: Operator, value: unknown): RuleRow {
  return value === undefined ? { field, op } : { field, op, value };
}
