/** APPROVE -> "Approve", SEND_BACK -> "Send back". */
export function humanize(code: string): string {
  const words = code.toLowerCase().split('_').filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const STATUS: Record<string, string> = {
  ACTIVE: 'In progress',
  SUSPENDED: 'On hold',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

/** Request status for people; a completed request shows how it ended (e.g. "Approved"). */
export function statusLabel(status: string, endStatus?: string | null): string {
  if (status === 'COMPLETED' && endStatus) {
    return humanize(endStatus);
  }
  return STATUS[status] ?? humanize(status);
}

export type StatusTone = 'accent' | 'neutral' | 'ok' | 'danger';

/**
 * Whether a name (an end status, or a task outcome) says it goes against the request: rejected, declined, denied,
 * failed. One rule for the status badge and for the outcome buttons. It is a reading of the name: an unusual one
 * ("NOT_APPROVED") is not recognised and gets the neutral look.
 */
export function goesAgainst(name: string | null | undefined): boolean {
  return !!name && /reject|declin|den[yi]|fail/i.test(name);
}

/** The colour family of a request's status badge. The words come from {@link statusLabel}; colour only supports them. */
export function statusTone(status: string, endStatus?: string | null): StatusTone {
  switch (status) {
    case 'ACTIVE':
      return 'accent';
    case 'COMPLETED':
      return goesAgainst(endStatus) ? 'danger' : 'ok';
    default:
      return 'neutral';
  }
}
