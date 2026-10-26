import { HistoryEntry } from '../../core/workflow/workflow.models';
import { describeEvent } from './timeline';

function entry(type: string, data: Record<string, unknown> = {}): HistoryEntry {
  return { type, actorId: 'bob', data, occurredAt: '2026-09-28T09:00:00Z' };
}

describe('describeEvent', () => {
  const names = new Map([['t1', 'Manager approval']]);

  it('describes task and request events in plain words', () => {
    expect(describeEvent(entry('InstanceStarted'), names)).toBe('Request submitted');
    expect(describeEvent(entry('TaskCreated', { taskId: 't1', assigneeId: 'bob' }), names)).toBe('Manager approval assigned');
    expect(describeEvent(entry('TaskCreated', { taskId: 't1', assigneeId: null }), names)).toBe('Manager approval offered to a group');
    expect(describeEvent(entry('TaskCompleted', { taskId: 't1', outcome: 'SEND_BACK' }), names)).toBe('Manager approval: Send back');
    expect(describeEvent(entry('TaskUnassignable', { taskId: 'tx', reason: 'The initiator has no manager' }), names))
      .toBe('Nobody could be assigned to a task: The initiator has no manager');
    expect(describeEvent(entry('ActionExecuted', { type: 'SEND_EMAIL' }), names)).toBe('Email sent');
    expect(describeEvent(entry('InstanceCompleted', { endStatus: 'APPROVED' }), names)).toBe('Request finished: Approved');
    expect(describeEvent(entry('InstanceCompleted', { endStatus: null }), names)).toBe('Request finished');
  });

  it('hides engine-internal steps and humanizes unknown ones', () => {
    expect(describeEvent(entry('NodeEntered'), names)).toBeNull();
    expect(describeEvent(entry('GatewayRouted'), names)).toBeNull();
    expect(describeEvent(entry('SOMETHING_NEW'), names)).toBe('Something new');
  });
});
