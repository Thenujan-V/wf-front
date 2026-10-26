import { Access } from '../forms/form.models';

export type NodeType = 'START' | 'END' | 'USER_TASK' | 'EXCLUSIVE_GATEWAY' | 'PARALLEL_GATEWAY' | 'TIMER' | 'SYSTEM_ACTION';
export type ApprovalMode = 'SINGLE' | 'ANY' | 'ALL' | 'PERCENT';
export type BreachAction = 'NOTIFY' | 'REASSIGN_TO_MANAGER' | 'AUTO_COMPLETE';
export type ActionType = 'SEND_EMAIL' | 'SET_VARIABLE' | 'WEBHOOK';

export interface Point {
  x: number;
  y: number;
}

export type Assignment =
  | { type: 'USER'; userId: string }
  | { type: 'GROUP'; groupId: string }
  | { type: 'ROLE'; role: string }
  | { type: 'INITIATOR_MANAGER'; levels: number }
  | { type: 'VARIABLE_USER'; variable: string };
export type AssignmentType = Assignment['type'];

export interface Sla {
  /** ISO-8601 duration; whole days when businessDays is set. */
  dueIn?: string;
  businessDays?: boolean;
  reminderPercent?: number;
  onBreach?: BreachAction;
  /** Only for AUTO_COMPLETE: one of the task's outcomes. */
  autoOutcome?: string;
}

export interface NodeFormRef {
  key: string;
  version: number;
  /** Tasks only; fields not listed are EDITABLE. */
  access?: Record<string, Access>;
}

/** A node as workflow-service stores it (spec §4.1). Properties the designer does not know are kept as loaded. */
export interface ProcessNode {
  id: string;
  type: NodeType;
  name: string;
  /** Designer only: where the node sits on the canvas. workflow-service ignores it. */
  position?: Point;
  endStatus?: string;
  assignment?: Assignment;
  outcomes?: string[];
  approvalMode?: ApprovalMode;
  percent?: number;
  sla?: Sla;
  form?: NodeFormRef;
  duration?: string;
  dueDateVariable?: string;
  actionType?: ActionType;
  config?: Record<string, unknown>;
  [other: string]: unknown;
}

export interface ProcessEdge {
  id: string;
  source: string;
  target: string;
  /** Decision flows: a condition expression (spec §3). */
  condition?: unknown;
  /** Decision flows: taken when no condition holds. */
  default?: boolean;
  /** Task flows: the outcome that takes this flow. */
  outcome?: string;
  [other: string]: unknown;
}

export interface ProcessGraph {
  nodes: ProcessNode[];
  edges: ProcessEdge[];
  [other: string]: unknown;
}

/** A publish-blocking problem; nodeId null means the whole process. */
export interface ValidationProblem {
  nodeId: string | null;
  code: string;
  message: string;
}

export interface ProcessValidationReport {
  valid: boolean;
  errors: ValidationProblem[];
}

/** A row of the designer's process list. */
export interface ProcessSummary {
  key: string;
  name: string;
  latestVersion: number | null;
  /** DRAFT (never published), PUBLISHED or RETIRED. */
  status: string;
  hasDraft: boolean;
  draftUpdatedAt: string | null;
}

export interface ProcessDraft {
  key: string;
  name: string;
  graph: ProcessGraph;
  updatedAt: string;
  updatedBy: string;
}

export interface ProcessVersion {
  id: string;
  key: string;
  version: number;
  name: string;
  status: string;
  graph: ProcessGraph;
  publishedAt: string;
  publishedBy: string;
}

export interface PublishedProcess {
  id: string;
  key: string;
  version: number;
  name: string;
  publishedAt: string;
}
