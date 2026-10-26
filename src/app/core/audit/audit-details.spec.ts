import { auditDetails } from './audit-details';
import { AuditEntry } from './audit.models';

const ALICE = 'a2ba4f3d-6100-4b78-8f41-69f3d34464bf';
const CAROL = '91b8e0b9-3c9c-401a-8f34-caa54a75d1ee';

/** An entry as audit-service records it: the published event, with the engine's own fields under "data". */
function entry(action: string, data: Record<string, unknown>, entityType = 'TASK'): AuditEntry {
  return {
    id: 1, action, actorId: ALICE, entityType, entityId: 'x', correlationId: 'c-1', occurredAt: '2026-10-01T10:58:49Z',
    data: { type: action, actorId: ALICE, messageId: 'm-1', occurredAt: '2026-10-01T10:58:49.399427700Z', ...data },
  };
}
const request = { instanceId: 'i-1', processKey: 'expense-request', businessKey: 'EXP-7', initiatorId: ALICE, processVersion: 3 };

describe('auditDetails', () => {
  it('describes a created task in words, with people as people and the request as a link', () => {
    const details = auditDetails(entry('workflow.task.created', {
      ...request, taskName: 'Manager approval',
      data: { dueAt: null, nodeId: 'managerApproval', taskId: 't-1', assigneeId: CAROL, candidates: [] },
    }));

    expect(details).toEqual([
      { label: 'Task', text: 'Manager approval' },
      { label: 'Request', text: 'EXP-7', link: ['/requests', 'i-1'] },
      { label: 'Process', text: 'expense-request, version 3' },
      { label: 'Started by', userId: ALICE },
      { label: 'Assigned to', userId: CAROL },
      { label: 'Step', text: 'managerApproval' },
    ]);
  });

  it('says who a task is offered to and when it is due', () => {
    const details = auditDetails(entry('workflow.task.created', {
      data: { dueAt: '2026-10-03T09:00:00Z', taskId: 't-1', assigneeId: null, candidates: ['role:wms-admin', 'group:finance'] },
    }));

    expect(details).toEqual([
      { label: 'Offered to', text: 'Role wms-admin, Group finance' },
      { label: 'Due', date: '2026-10-03T09:00:00Z' },
    ]);
  });

  it('gives a completed task its outcome and the person who decided', () => {
    const details = auditDetails(entry('workflow.task.completed', {
      taskName: 'Manager approval', data: { taskId: 't-1', nodeId: 'managerApproval', userId: CAROL, outcome: 'SEND_BACK' },
    }));

    expect(details).toEqual([
      { label: 'Task', text: 'Manager approval' },
      { label: 'Outcome', text: 'Send back' },
      { label: 'Person', userId: CAROL },
      { label: 'Step', text: 'managerApproval' },
    ]);
  });

  it('shows where a task moved from and to, and why one was cancelled', () => {
    expect(auditDetails(entry('workflow.task.reassigned', { data: { taskId: 't-1', fromUserId: CAROL, toUserId: ALICE, actorId: ALICE } })))
      .toEqual([{ label: 'From', userId: CAROL }, { label: 'To', userId: ALICE }]);
    expect(auditDetails(entry('workflow.task.cancelled', { data: { taskId: 't-1', reason: 'Instance cancelled' } })))
      .toEqual([{ label: 'Reason', text: 'Instance cancelled' }]);
    expect(auditDetails(entry('workflow.task.overdue', { data: { taskId: 't-1', assigneeId: CAROL, action: 'ESCALATE' } })))
      .toEqual([{ label: 'Assigned to', userId: CAROL }, { label: 'On breach', text: 'Escalate' }]);
  });

  it('says how a request ended', () => {
    expect(auditDetails(entry('workflow.instance.completed', { ...request, data: { endStatus: 'NOT_APPROVED' } }, 'INSTANCE'))).toEqual([
      { label: 'Request', text: 'EXP-7', link: ['/requests', 'i-1'] },
      { label: 'Process', text: 'expense-request, version 3' },
      { label: 'Started by', userId: ALICE },
      { label: 'Ended as', text: 'Not approved' },
    ]);
  });

  it('describes an uploaded version by its file, and leaves storage internals to the raw record', () => {
    const details = auditDetails(entry('document.version.uploaded', {
      size: 2048, label: '1.0', s3Key: 'versions/579a', fileName: 'taxi.txt', folderId: 'f-1', mimeType: 'text/plain',
      versionId: 'v-1', documentId: 'd-1',
    }, 'DOCUMENT'));

    expect(details).toEqual([
      { label: 'File', text: 'taxi.txt' },
      { label: 'Version', text: '1.0' },
      { label: 'Size', text: '2.0 KB' },
      { label: 'Type', text: 'text/plain' },
      { label: 'Document', text: 'Open document', link: ['/documents', 'd-1'] },
      { label: 'Folder', text: 'Open folder', link: ['/documents/folders', 'f-1'] },
    ]);
  });

  it('links a request that has no reference of its own, and each of its documents', () => {
    expect(auditDetails(entry('workflow.files.submitted', { instanceId: 'i-1', processKey: 'expense-request', documentIds: ['d-1', 'd-2'] }, 'INSTANCE')))
      .toEqual([
        { label: 'Request', text: 'Open request', link: ['/requests', 'i-1'] },
        { label: 'Process', text: 'expense-request' },
        { label: 'Document', text: 'Open document', link: ['/documents', 'd-1'] },
        { label: 'Document', text: 'Open document', link: ['/documents', 'd-2'] },
      ]);
  });

  it('names a shared folder, the person it was shared with and what they may do', () => {
    expect(auditDetails(entry('document.folder.shared', { folderId: 'f-1', folderName: 'Finance', userId: CAROL, permission: 'WRITE' }, 'FOLDER')))
      .toEqual([
        { label: 'Person', userId: CAROL },
        { label: 'Folder', text: 'Finance', link: ['/documents/folders', 'f-1'] },
        { label: 'Permission', text: 'Write' },
      ]);
    expect(auditDetails(entry('document.checkout.forced', { documentId: 'd-1', folderId: 'f-1', holderId: CAROL }, 'DOCUMENT'))).toContainEqual(
      { label: 'Checked out by', userId: CAROL });
  });

  it('gives a failed background job its error', () => {
    expect(auditDetails(entry('workflow.job.dead', { data: { jobId: 'j-1', error: 'SMTP timeout' } }, 'JOB')))
      .toEqual([{ label: 'Job', text: 'j-1' }, { label: 'Error', text: 'SMTP timeout' }]);
  });

  it('still shows fields it does not know, under a readable label, and skips empty ones', () => {
    const details = auditDetails(entry('billing.invoice.sent', {
      invoiceNumber: 'INV-9', paid: false, lineCount: 3, tags: ['a', 'b'], customer: { name: 'Acme' },
      note: '', missing: null, none: [], data: { sentVia: 'EMAIL' },
    }, 'BILLING'));

    expect(details).toEqual([
      { label: 'Invoice number', text: 'INV-9' },
      { label: 'Paid', text: 'No' },
      { label: 'Line count', text: '3' },
      { label: 'Tags', text: 'a, b' },
      { label: 'Customer', text: '{"name":"Acme"}' },
      { label: 'Sent via', text: 'EMAIL' },
    ]);
  });

  it('has nothing to add for an event that carries only its envelope', () => {
    expect(auditDetails(entry('workflow.task.reminder', { data: { taskId: 't-1', assigneeId: null } }))).toEqual([]);
    expect(auditDetails({ ...entry('x.y', {}), data: { data: 'not an object' } })).toEqual([{ label: 'Data', text: 'not an object' }]);
  });
});
