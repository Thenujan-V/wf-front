import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { ActionType, NodeFormRef, ProcessEdge, ProcessNode } from '../../../core/workflow/process.models';
import { DurationInput } from './duration-input';
import { FormSettings } from './form-settings';
import { edgeLabel, typeLabel } from './process-model';
import { TaskProperties } from './task-properties';

const ACTIONS: { type: ActionType; label: string }[] = [
  { type: 'SEND_EMAIL', label: 'Send an email' },
  { type: 'SET_VARIABLE', label: 'Set a value' },
  { type: 'WEBHOOK', label: 'Call a webhook' },
];

export const END_STATUSES = ['APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'];

/** A SET_VARIABLE value: JSON when the text is JSON (12, true, "x", [..]), the text itself otherwise. */
export function parseValue(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The settings of the selected node (spec §4.2). */
@Component({
  selector: 'app-node-properties',
  imports: [DurationInput, FormSettings, NgTemplateOutlet, TaskProperties],
  templateUrl: './node-properties.html',
})
export class NodeProperties {
  readonly node = input.required<ProcessNode>();
  readonly userVariables = input<string[]>([]);
  readonly dateVariables = input<string[]>([]);
  /** The flows leaving and entering this node, listed for gateways so their settings are easy to reach. */
  readonly outgoing = input<ProcessEdge[]>([]);
  readonly incoming = input<ProcessEdge[]>([]);
  /** Node names by id, to say where each flow goes. */
  readonly nodeNames = input<Record<string, string>>({});
  readonly patch = output<Partial<ProcessNode>>();
  readonly outcomeAdd = output<string>();
  readonly outcomeRename = output<{ from: string; to: string }>();
  readonly outcomeRemove = output<string>();
  readonly remove = output<void>();
  readonly edgeOpen = output<string>();

  protected readonly actions = ACTIONS;
  protected readonly endStatuses = END_STATUSES;
  protected readonly parseValue = parseValue;
  protected readonly edgeLabel = edgeLabel;
  protected readonly typeLabel = computed(() => typeLabel(this.node().type));
  protected readonly config = computed(() => this.node().config ?? {});
  protected readonly timerMode = computed(() => (this.node().dueDateVariable !== undefined ? 'date' : 'duration'));
  protected readonly valueText = computed(() => {
    const value = this.config()['value'];
    return value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  });

  protected text(key: string): string {
    const value = this.config()[key];
    return typeof value === 'string' ? value : '';
  }

  protected setEndStatus(text: string): void {
    const status = text.trim().toUpperCase();
    this.patch.emit({ endStatus: status || undefined });
  }

  protected setTimerMode(mode: 'duration' | 'date'): void {
    this.patch.emit(mode === 'date'
      ? { duration: undefined, dueDateVariable: this.dateVariables()[0] ?? '' }
      : { dueDateVariable: undefined, duration: 'PT1H' });
  }

  protected setActionType(actionType: ActionType): void {
    this.patch.emit({ actionType, config: {} });
  }

  protected setConfig(key: string, value: unknown): void {
    this.patch.emit({ config: { ...this.config(), [key]: value } });
  }

  protected setForm(form: NodeFormRef | undefined): void {
    this.patch.emit({ form });
  }
}
