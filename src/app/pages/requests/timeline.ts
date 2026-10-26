import { humanize } from '../../core/workflow/labels';
import { HistoryEntry } from '../../core/workflow/workflow.models';

const HIDDEN = new Set(['NodeEntered', 'GatewayRouted', 'NodeDecided', 'JobRetried']);

/** One timeline line for a history event, or null for engine-internal steps people do not need to see. */
export function describeEvent(entry: HistoryEntry, taskNames: Map<string, string>): string | null {
  if (HIDDEN.has(entry.type)) {
    return null;
  }
  const data = entry.data ?? {};
  const task = taskNames.get(String(data['taskId'])) ?? 'a task';
  const text = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : '');
  switch (entry.type) {
    case 'InstanceStarted':
      return 'Request submitted';
    case 'TaskCreated':
      return data['assigneeId'] ? `${task} assigned` : `${task} offered to a group`;
    case 'TaskUnassignable':
      return `Nobody could be assigned to ${task}: ${text('reason')}`;
    case 'TaskClaimed':
      return `${task} claimed`;
    case 'TaskUnclaimed':
      return `${task} released to the group`;
    case 'TaskDelegated':
      return `${task} delegated`;
    case 'TaskReassigned':
      return `${task} reassigned by an administrator`;
    case 'TaskCompleted':
      return `${task}: ${humanize(text('outcome'))}`;
    case 'TaskCancelled':
      return `${task} cancelled`;
    case 'TaskReminderDue':
      return `Reminder sent for ${task}`;
    case 'TaskOverdue':
      return `${task} is overdue`;
    case 'TimerFired':
      return 'Waiting period ended';
    case 'ActionExecuted':
      return text('type') === 'SEND_EMAIL' ? 'Email sent' : text('type') === 'WEBHOOK' ? 'Web service called' : 'Details updated';
    case 'ActionFailed':
      return 'A system step failed and will be retried';
    case 'JobDead':
      return 'A system step failed and needs an administrator';
    case 'InstanceCompleted':
      return text('endStatus') ? `Request finished: ${humanize(text('endStatus'))}` : 'Request finished';
    case 'InstanceCancelled':
      return 'Request cancelled';
    case 'InstanceSuspended':
      return 'Request put on hold';
    case 'InstanceResumed':
      return 'Request resumed';
    default:
      return humanize(entry.type);
  }
}
