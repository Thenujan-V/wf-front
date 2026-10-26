import { TaskView } from '../app/core/workflow/workflow.models';

/** A task assigned to "me", with sensible defaults; override what a test cares about. */
export function task(overrides: Partial<TaskView>): TaskView {
  return {
    id: 't1', instanceId: 'i1', processKey: 'expense-approval', businessKey: 'EXP-1', initiatorId: 'carol',
    nodeId: 'managerApproval', name: 'Manager approval', status: 'OPEN', assigneeId: 'me', candidates: [],
    outcomes: ['APPROVE', 'REJECT'], unassignedReason: null, createdAt: '2026-09-28T09:00:00Z', dueAt: null,
    formKey: null, formVersion: null,
    ...overrides,
  };
}
