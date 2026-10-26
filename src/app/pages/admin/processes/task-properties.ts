import { Component, computed, effect, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import { GroupView, UserSummary } from '../../../core/identity/identity.models';
import { UserDirectory } from '../../../core/identity/user-directory';
import { UserPicker } from '../../../core/identity/user-picker';
import {
  ApprovalMode, Assignment, AssignmentType, BreachAction, ProcessNode, Sla,
} from '../../../core/workflow/process.models';
import { DurationInput } from './duration-input';
import { fromIsoDuration } from './durations';
import { withoutUndefined } from './process-model';

export const KNOWN_ROLES = ['user', 'process-designer', 'document-admin', 'wms-admin'];

const ASSIGNMENTS: { type: AssignmentType; label: string }[] = [
  { type: 'INITIATOR_MANAGER', label: "The requester's manager" },
  { type: 'USER', label: 'A specific person' },
  { type: 'GROUP', label: 'Anyone in a group' },
  { type: 'ROLE', label: 'Anyone with a role' },
  { type: 'VARIABLE_USER', label: 'The person named in a form field' },
];

const MODES: { mode: ApprovalMode; label: string }[] = [
  { mode: 'SINGLE', label: 'One person decides' },
  { mode: 'ANY', label: 'The first to act decides' },
  { mode: 'ALL', label: 'Everyone must approve' },
  { mode: 'PERCENT', label: 'A share of them must approve' },
];

const BREACH: { action: BreachAction; label: string }[] = [
  { action: 'NOTIFY', label: 'Notify the assignee and their manager' },
  { action: 'REASSIGN_TO_MANAGER', label: "Reassign to the assignee's manager" },
  { action: 'AUTO_COMPLETE', label: 'Complete it automatically' },
];

export function newAssignment(type: AssignmentType, userVariables: string[]): Assignment {
  switch (type) {
    case 'USER':
      return { type, userId: '' };
    case 'GROUP':
      return { type, groupId: '' };
    case 'ROLE':
      return { type, role: '' };
    case 'INITIATOR_MANAGER':
      return { type, levels: 1 };
    case 'VARIABLE_USER':
      return { type, variable: userVariables[0] ?? '' };
  }
}

/** Who does a task, how many must act, its outcomes and its deadline (spec §4.2). */
@Component({
  selector: 'app-task-properties',
  imports: [DurationInput, UserPicker],
  templateUrl: './task-properties.html',
})
export class TaskProperties {
  private readonly directory = inject(UserDirectory);

  readonly node = input.required<ProcessNode>();
  /** form.<key> of the user fields of the process's forms. */
  readonly userVariables = input<string[]>([]);
  readonly patch = output<Partial<ProcessNode>>();
  readonly outcomeAdd = output<string>();
  readonly outcomeRename = output<{ from: string; to: string }>();
  readonly outcomeRemove = output<string>();

  protected readonly assignments = ASSIGNMENTS;
  protected readonly modes = MODES;
  protected readonly breachActions = BREACH;
  protected readonly roles = KNOWN_ROLES;
  protected readonly groups = signal<GroupView[] | null>(null);
  /** Draft text of a new outcome; starts empty for each task. */
  protected readonly newOutcome = linkedSignal({ source: () => this.node().id, computation: () => '' });

  protected readonly assignment = computed(() => this.node().assignment);
  protected readonly userId = computed(() => { const a = this.assignment(); return a?.type === 'USER' ? a.userId : ''; });
  protected readonly groupId = computed(() => { const a = this.assignment(); return a?.type === 'GROUP' ? a.groupId : ''; });
  protected readonly role = computed(() => { const a = this.assignment(); return a?.type === 'ROLE' ? a.role : ''; });
  protected readonly levels = computed(() => { const a = this.assignment(); return a?.type === 'INITIATOR_MANAGER' ? a.levels : 1; });
  protected readonly variable = computed(() => { const a = this.assignment(); return a?.type === 'VARIABLE_USER' ? a.variable : ''; });
  protected readonly multiAllowed = computed(() => { const t = this.assignment()?.type; return t === 'GROUP' || t === 'ROLE'; });
  protected readonly outcomes = computed(() => this.node().outcomes ?? []);
  protected readonly sla = computed(() => this.node().sla);
  protected readonly dueInDays = computed(() => fromIsoDuration(this.sla()?.dueIn)?.unit === 'days');
  private groupsRequested = false;

  constructor() {
    effect(() => {
      if (this.assignment()?.type === 'GROUP' && !this.groupsRequested) {
        this.groupsRequested = true;
        untracked(() => this.directory.groups().subscribe({
          next: (groups) => this.groups.set(groups),
          error: () => this.groups.set([]),
        }));
      }
    });
  }

  protected userName(id: string) {
    return this.directory.name(id);
  }

  protected setAssignmentType(type: AssignmentType): void {
    const assignment = newAssignment(type, this.userVariables());
    const single = type !== 'GROUP' && type !== 'ROLE';
    this.patch.emit(single && (this.node().approvalMode ?? 'SINGLE') !== 'SINGLE'
      ? { assignment, approvalMode: 'SINGLE', percent: undefined }
      : { assignment });
  }

  protected setAssignment(assignment: Assignment): void {
    this.patch.emit({ assignment });
  }

  protected pickUser(user: UserSummary): void {
    this.setAssignment({ type: 'USER', userId: user.id });
  }

  protected setLevels(field: HTMLInputElement): void {
    const levels = Number(field.value);
    if (field.value.trim() && Number.isInteger(levels)) {
      this.setAssignment({ type: 'INITIATOR_MANAGER', levels });
    } else {
      field.value = String(this.levels()); // nothing changed, so the field must show the model again
    }
  }

  protected setMode(mode: ApprovalMode): void {
    this.patch.emit(mode === 'PERCENT'
      ? { approvalMode: mode, percent: this.node().percent ?? 50 }
      : { approvalMode: mode, percent: undefined });
  }

  protected setPercent(field: HTMLInputElement): void {
    const percent = Number(field.value);
    if (field.value.trim() && Number.isInteger(percent)) {
      this.patch.emit({ percent });
    } else {
      field.value = String(this.node().percent ?? '');
    }
  }

  /**
   * Asks the page to rename; the page may refuse (a duplicate) or normalize (capitals). The field is reset to the
   * old name either way: an accepted rename changes the bound value, so Angular writes the new name back.
   */
  protected rename(from: string, field: HTMLInputElement): void {
    const to = field.value;
    field.value = from;
    if (to.trim() && to !== from) {
      this.outcomeRename.emit({ from, to });
    }
  }

  protected addOutcome(): void {
    const name = this.newOutcome();
    if (name.trim()) {
      this.outcomeAdd.emit(name);
      this.newOutcome.set('');
    }
  }

  protected toggleSla(on: boolean): void {
    this.patch.emit({ sla: on ? { dueIn: 'P2D', onBreach: 'NOTIFY' } : undefined });
  }

  protected setDue(dueIn: string): void {
    this.patchSla(fromIsoDuration(dueIn)?.unit === 'days' ? { dueIn } : { dueIn, businessDays: undefined });
  }

  protected setBusinessDays(on: boolean): void {
    this.patchSla({ businessDays: on || undefined });
  }

  protected setReminder(text: string): void {
    const percent = Number(text);
    this.patchSla({ reminderPercent: text.trim() && Number.isInteger(percent) ? percent : undefined });
  }

  protected setBreach(action: BreachAction): void {
    this.patchSla(action === 'AUTO_COMPLETE'
      ? { onBreach: action, autoOutcome: this.sla()?.autoOutcome ?? this.outcomes()[0] }
      : { onBreach: action, autoOutcome: undefined });
  }

  protected setAutoOutcome(outcome: string): void {
    this.patchSla({ autoOutcome: outcome });
  }

  private patchSla(patch: Partial<Sla>): void {
    this.patch.emit({ sla: withoutUndefined({ ...this.sla(), ...patch }) });
  }
}
