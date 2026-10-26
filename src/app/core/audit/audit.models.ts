/** One recorded event (spec §8). Dates are ISO-8601 UTC strings. */
export interface AuditEntry {
  id: number;
  /** The event's routing key, e.g. "workflow.task.completed". */
  action: string;
  /** Null for events with no person behind them (timers, reminders). */
  actorId: string | null;
  /** INSTANCE, TASK, JOB, DOCUMENT, or the first part of an unknown event's name. */
  entityType: string;
  entityId: string | null;
  /** The whole event as it was published. */
  data: Record<string, unknown>;
  correlationId: string | null;
  occurredAt: string;
}

export interface AuditResults {
  items: AuditEntry[];
  total: number;
  page: number;
  size: number;
}

/** `from` is inclusive and `to` exclusive (ISO-8601 instants). */
export interface AuditQuery {
  actor?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}
