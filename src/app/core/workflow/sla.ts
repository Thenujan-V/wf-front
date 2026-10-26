export type SlaState = 'none' | 'on-track' | 'due-soon' | 'overdue';

const FOUR_HOURS = 4 * 60 * 60 * 1000;

/** Where a task stands against its due date: overdue, in the last quarter (or last 4 h) of its window, or on track. */
export function slaState(createdAt: string, dueAt: string | null, now: Date): SlaState {
  if (!dueAt) {
    return 'none';
  }
  const due = Date.parse(dueAt);
  if (Number.isNaN(due)) {
    return 'none';
  }
  const at = now.getTime();
  if (at >= due) {
    return 'overdue';
  }
  const created = Date.parse(createdAt);
  const window = Number.isNaN(created) ? 0 : due - created;
  const remaining = due - at;
  return remaining <= FOUR_HOURS || remaining <= window * 0.25 ? 'due-soon' : 'on-track';
}
