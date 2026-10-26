/** A notification as notification-service returns it (spec §8). */
export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  /** Where in the app it leads, or null. Use {@link appPath} before following it. */
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPage {
  items: AppNotification[];
  total: number;
  /** All of the person's unread notifications, whatever the page or filter. */
  unread: number;
  page: number;
  size: number;
}

export interface NotificationPreference {
  kind: string;
  inApp: boolean;
  email: boolean;
}

/** What arrives over the live connection. */
export interface PushFrame {
  type: 'created' | 'unread';
  notification: AppNotification | null;
  unread: number;
}

const KIND_LABELS: Record<string, { label: string; hint: string }> = {
  TASK_ASSIGNED: { label: 'A task is assigned to me', hint: 'Also when one is delegated or reassigned to you.' },
  TASK_AVAILABLE: { label: 'A task is available to my group', hint: 'Anyone in the group or role can claim it.' },
  TASK_REMINDER: { label: 'A reminder about a task of mine', hint: 'Sent before the deadline.' },
  TASK_OVERDUE: { label: 'A task of mine is overdue', hint: 'The deadline has passed.' },
  REQUEST_FINISHED: { label: 'My request is finished', hint: 'Approved, rejected, completed or cancelled.' },
  DOCUMENT_SHARED: { label: 'A folder is shared with me', hint: 'Someone gave you access to a folder.' },
};

/** A kind this version does not know yet is shown by its name. */
export function kindLabel(kind: string): { label: string; hint: string } {
  return KIND_LABELS[kind] ?? { label: kind, hint: '' };
}

/** The link if it is a path inside the app; otherwise null, so the browser is never sent elsewhere. */
export function appPath(link: string | null | undefined): string | null {
  return typeof link === 'string' && link.startsWith('/') && !link.startsWith('//') && !link.includes('\\') ? link : null;
}

/** What came over the live connection, if it is a frame this app understands; otherwise null. */
export function parseFrame(body: string): PushFrame | null {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const frame = raw as { type?: unknown; notification?: unknown; unread?: unknown };
  if (typeof frame.unread !== 'number' || !Number.isInteger(frame.unread) || frame.unread < 0) {
    return null;
  }
  if (frame.type === 'unread') {
    return { type: 'unread', notification: null, unread: frame.unread };
  }
  if (frame.type === 'created' && isNotification(frame.notification)) {
    return { type: 'created', notification: frame.notification, unread: frame.unread };
  }
  return null;
}

function isNotification(value: unknown): value is AppNotification {
  const candidate = value as Partial<AppNotification> | null;
  return typeof candidate === 'object' && candidate !== null && typeof candidate.id === 'string'
    && typeof candidate.title === 'string' && typeof candidate.body === 'string';
}
