import { Component, input, linkedSignal, output, signal } from '@angular/core';
import { parseCondition } from '../../../core/expression/condition';
import { ProcessEdge, ProcessNode } from '../../../core/workflow/process.models';
import { ConditionEditor } from '../forms/condition-editor';
import { RuleField } from '../forms/condition-rows';

export type EdgePatch = Pick<Partial<ProcessEdge>, 'outcome' | 'condition' | 'default'>;

/** The settings of the selected flow: a task's outcome, or a decision's condition or default. */
@Component({
  selector: 'app-edge-properties',
  imports: [ConditionEditor],
  templateUrl: './edge-properties.html',
})
export class EdgeProperties {
  readonly edge = input.required<ProcessEdge>();
  readonly source = input<ProcessNode | null>(null);
  readonly target = input<ProcessNode | null>(null);
  /** What the rule builder can test, keyed by full variable path (see processConditionVariables). */
  readonly fields = input<RuleField[]>([]);
  readonly patch = output<EdgePatch>();
  readonly remove = output<void>();
  /** Back to the step the flow leaves. */
  readonly back = output<void>();

  /** JSON editing is per flow: selecting another flow starts from its own condition. */
  protected readonly jsonMode = linkedSignal({ source: () => this.edge().id, computation: () => false });
  protected readonly jsonText = signal('');
  protected readonly jsonError = linkedSignal<string, string | null>({ source: () => this.edge().id, computation: () => null });

  protected setOutcome(outcome: string): void {
    this.patch.emit({ outcome: outcome || undefined });
  }

  protected setDefault(on: boolean): void {
    this.patch.emit(on ? { default: true, condition: undefined } : { default: undefined });
  }

  protected setCondition(condition: unknown): void {
    this.patch.emit({ condition });
  }

  protected openJson(): void {
    const condition = this.edge().condition;
    this.jsonText.set(condition === undefined ? '' : JSON.stringify(condition, null, 2));
    this.jsonError.set(null);
    this.jsonMode.set(true);
  }

  /** Applies hand-written JSON only when it is a condition the engine can read; empty text removes the condition. */
  protected applyJson(): void {
    const text = this.jsonText().trim();
    if (!text) {
      this.patch.emit({ condition: undefined });
      this.jsonMode.set(false);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.jsonError.set('This is not valid JSON.');
      return;
    }
    try {
      parseCondition(parsed);
    } catch (error) {
      this.jsonError.set(error instanceof Error ? error.message : 'This is not a valid condition.');
      return;
    }
    this.patch.emit({ condition: parsed });
    this.jsonMode.set(false);
  }
}
