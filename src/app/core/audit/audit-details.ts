import { formatSize } from '../documents/document.models';
import { humanize } from '../workflow/labels';
import { AuditEntry } from './audit.models';

/** One line of an audit entry's details. Exactly one of text, userId and date is set. */
export interface AuditDetail {
  label: string;
  text?: string;
  /** A person: the page shows their name. */
  userId?: string;
  /** An ISO-8601 instant: the page shows it in the reader's time zone. */
  date?: string;
  /** Where `text` leads. */
  link?: string[];
}

type Kind = 'text' | 'user' | 'date' | 'code' | 'size' | 'candidates' | 'documents';

/** The fields the page knows, in the order it shows them. Any other field is shown after these under its own name. */
const FIELDS: [key: string, label: string, kind: Kind][] = [
  ['initiatorId', 'Started by', 'user'],
  ['outcome', 'Outcome', 'code'],
  ['endStatus', 'Ended as', 'code'],
  ['userId', 'Person', 'user'],
  ['fromUserId', 'From', 'user'],
  ['toUserId', 'To', 'user'],
  ['assigneeId', 'Assigned to', 'user'],
  ['candidates', 'Offered to', 'candidates'],
  ['dueAt', 'Due', 'date'],
  ['action', 'On breach', 'code'],
  ['reason', 'Reason', 'text'],
  ['nodeId', 'Step', 'text'],
  ['fileName', 'File', 'text'],
  ['label', 'Version', 'text'],
  ['size', 'Size', 'size'],
  ['mimeType', 'Type', 'text'],
  ['holderId', 'Checked out by', 'user'],
  ['documentId', 'Document', 'documents'],
  ['documentIds', 'Document', 'documents'],
];

/**
 * Not shown as lines of their own: the envelope (the entry's header already says who, what and when), ids that only
 * matter to the system, and the parts of the lines built below. All of it stays in the raw record.
 */
const HANDLED = new Set([
  'type', 'messageId', 'occurredAt', 'actorId', 'taskId', 'versionId', 's3Key',
  'taskName', 'instanceId', 'businessKey', 'processKey', 'processVersion', 'folderId', 'folderName', 'permission', 'jobId', 'error',
  ...FIELDS.map(([key]) => key),
]);

/** An audit entry's recorded event as lines a person can read. The raw record is not changed. */
export function auditDetails(entry: AuditEntry): AuditDetail[] {
  // The engine's own fields sit under "data"; everything else is beside it.
  const { data: inner, ...outer } = entry.data;
  const nested = isRecord(inner);
  const fields: Record<string, unknown> = nested ? { ...outer, ...inner } : entry.data;
  const text = (key: string) => (present(fields[key]) ? String(fields[key]) : null);
  const details: AuditDetail[] = [];
  const add = (label: string, value: string | null, link?: string[]) => {
    if (value) {
      details.push(link ? { label, text: value, link } : { label, text: value });
    }
  };

  add('Task', text('taskName'));
  const instanceId = text('instanceId');
  if (instanceId) {
    add('Request', text('businessKey') ?? 'Open request', ['/requests', instanceId]);
  } else {
    add('Request', text('businessKey'));
  }
  const version = text('processVersion');
  add('Process', text('processKey') && version ? `${text('processKey')}, version ${version}` : text('processKey'));

  for (const [key, label, kind] of FIELDS) {
    const value = fields[key];
    if (!present(value)) {
      continue;
    }
    switch (kind) {
      case 'user':
        details.push({ label, userId: String(value) });
        break;
      case 'date':
        details.push({ label, date: String(value) });
        break;
      case 'code':
        add(label, humanize(String(value)));
        break;
      case 'size':
        add(label, typeof value === 'number' ? formatSize(value) : String(value));
        break;
      case 'candidates':
        add(label, list(value).map(candidate).join(', '));
        break;
      case 'documents':
        list(value).forEach((id) => add(label, 'Open document', ['/documents', id]));
        break;
      default:
        add(label, String(value));
    }
    if (key === 'userId') {
      folder(fields, add); // "shared with <person>" reads best right before the folder
    }
  }
  if (!present(fields['userId'])) {
    folder(fields, add);
  }
  add('Job', text('jobId'));
  add('Error', text('error'));

  // What the page has no words for is still shown: a new kind of event must not lose its details here.
  for (const [key, value] of Object.entries(fields)) {
    if (!HANDLED.has(key) && !(nested && key === 'data') && present(value)) {
      add(label(key), plain(value));
    }
  }
  return details;
}

function folder(fields: Record<string, unknown>, add: (label: string, value: string | null, link?: string[]) => void): void {
  const id = present(fields['folderId']) ? String(fields['folderId']) : null;
  const name = present(fields['folderName']) ? String(fields['folderName']) : null;
  if (id) {
    add('Folder', name ?? 'Open folder', ['/documents/folders', id]);
  } else {
    add('Folder', name);
  }
  if (present(fields['permission'])) {
    add('Permission', humanize(String(fields['permission'])));
  }
}

/** "role:wms-admin" → "Role wms-admin". */
function candidate(value: string): string {
  const [kind, ...rest] = value.split(':');
  return rest.length ? `${humanize(kind)} ${rest.join(':')}` : value;
}

/** "invoiceNumber" → "Invoice number". */
function label(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function plain(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (Array.isArray(value) && value.every((item) => typeof item !== 'object' || item === null)) {
    return value.join(', ');
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function list(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).filter(present).map(String);
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
