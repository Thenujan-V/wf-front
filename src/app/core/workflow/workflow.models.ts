import { Access } from '../forms/form.models';

/** Types returned by workflow-service (/api/workflow). Dates are ISO-8601 UTC strings. */
export type TaskViewName = 'mine' | 'group' | 'all';

/** Which form version a step shows. */
export interface FormRefView {
  key: string;
  version: number;
}

export interface CatalogEntry {
  key: string;
  name: string;
  version: number;
  /** The form people fill in to start this process; null when it takes free details. */
  startForm: FormRefView | null;
}

export interface TaskView {
  id: string;
  instanceId: string;
  processKey: string;
  businessKey: string | null;
  initiatorId: string;
  nodeId: string;
  name: string;
  /** OPEN, CLAIMED, COMPLETED or CANCELLED. */
  status: string;
  assigneeId: string | null;
  /** Pools the task is offered to, e.g. "group:<id>" or "role:<name>". */
  candidates: string[];
  outcomes: string[];
  unassignedReason: string | null;
  createdAt: string;
  dueAt: string | null;
  /** The form this task shows; null when it has none. */
  formKey: string | null;
  formVersion: number | null;
}

export interface InstanceSummary {
  id: string;
  processKey: string;
  processVersion: number;
  businessKey: string | null;
  /** ACTIVE, SUSPENDED, COMPLETED or CANCELLED. */
  status: string;
  endStatus: string | null;
  initiatorId: string;
  startedAt: string;
  endedAt: string | null;
}

export interface InstanceDetail {
  instance: InstanceSummary;
  variables: Record<string, unknown>;
  tasks: TaskView[];
}

export interface HistoryEntry {
  /** Engine event name, e.g. InstanceStarted, TaskCompleted. */
  type: string;
  actorId: string | null;
  data: Record<string, unknown>;
  occurredAt: string;
}

export interface StartRequest {
  processKey: string;
  businessKey: string | null;
  data: Record<string, unknown>;
}

/** GET /tasks/{id}/form: the step's field access and the request's current (non-hidden) values. */
export interface TaskFormView {
  formKey: string;
  formVersion: number;
  access: Record<string, Access>;
  values: Record<string, unknown>;
}

/** GET /instances/{id}/access-check: what the caller may do with a request's documents. */
export interface InstanceAccess {
  instanceId: string;
  processKey: string;
  status: string;
  canView: boolean;
  /** While the request runs: its initiator, whoever holds one of its open tasks, and admins. */
  canAttach: boolean;
}
