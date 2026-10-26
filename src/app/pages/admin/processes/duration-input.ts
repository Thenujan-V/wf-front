import { Component, computed, input, output } from '@angular/core';
import { DurationUnit, fromIsoDuration, toIsoDuration } from './durations';

/** A duration as amount + unit; other ISO-8601 durations (e.g. PT1H30M) are edited as text. */
@Component({
  selector: 'app-duration-input',
  template: `
    <span class="block text-xs font-medium text-muted">{{ label() }}</span>
    @if (simple(); as d) {
      <span class="mt-1 flex gap-2">
        <input type="number" min="1" step="1" [attr.data-testid]="testId() + '-amount'" [attr.aria-label]="label() + ' amount'"
               class="w-20 rounded-md border border-line-strong px-2 py-1 text-sm" [value]="d.amount" (change)="setAmount($any($event.target))" />
        <select [attr.data-testid]="testId() + '-unit'" [attr.aria-label]="label() + ' unit'"
                class="rounded-md border border-line-strong px-2 py-1 text-sm" (change)="setUnit($any($event.target).value)">
          @for (u of units; track u) {
            <option [value]="u" [selected]="u === d.unit">{{ u }}</option>
          }
        </select>
      </span>
    } @else {
      <input [attr.data-testid]="testId() + '-raw'" [attr.aria-label]="label()" placeholder="ISO-8601, e.g. PT1H30M"
             class="mt-1 block w-40 rounded-md border border-line-strong px-2 py-1 font-mono text-sm" [value]="value() ?? ''"
             (change)="valueChange.emit($any($event.target).value.trim())" />
    }
  `,
})
export class DurationInput {
  readonly value = input<string | undefined>(undefined);
  readonly label = input.required<string>();
  readonly testId = input.required<string>();
  readonly valueChange = output<string>();

  protected readonly units: DurationUnit[] = ['minutes', 'hours', 'days'];
  /** An empty value edits as "1 hour" until something is entered. */
  protected readonly simple = computed(() => (this.value() ? fromIsoDuration(this.value()) : { amount: 1, unit: 'hours' as const }));

  protected setAmount(field: HTMLInputElement): void {
    const amount = Number(field.value);
    if (field.value.trim() && Number.isInteger(amount) && amount >= 1) {
      this.valueChange.emit(toIsoDuration({ amount, unit: this.simple()?.unit ?? 'hours' }));
    } else {
      field.value = String(this.simple()?.amount ?? 1); // ignored, so show the saved amount again
    }
  }

  protected setUnit(unit: DurationUnit): void {
    this.valueChange.emit(toIsoDuration({ amount: this.simple()?.amount ?? 1, unit }));
  }
}
