export type DurationUnit = 'minutes' | 'hours' | 'days';

export interface SimpleDuration {
  amount: number;
  unit: DurationUnit;
}

const PATTERNS: [RegExp, DurationUnit][] = [
  [/^PT(\d+)M$/, 'minutes'],
  [/^PT(\d+)H$/, 'hours'],
  [/^P(\d+)D$/, 'days'],
];

const SINGULAR: Record<DurationUnit, string> = { minutes: 'minute', hours: 'hour', days: 'day' };

/** ISO-8601 as java.time.Duration.parse reads it; days are whole 24-hour days. */
export function toIsoDuration(duration: SimpleDuration): string {
  switch (duration.unit) {
    case 'minutes':
      return `PT${duration.amount}M`;
    case 'hours':
      return `PT${duration.amount}H`;
    case 'days':
      return `P${duration.amount}D`;
  }
}

/** Only the forms toIsoDuration writes; anything else (e.g. PT1H30M) is null and edited as text. */
export function fromIsoDuration(text: string | undefined): SimpleDuration | null {
  for (const [pattern, unit] of PATTERNS) {
    const match = text ? pattern.exec(text) : null;
    if (match) {
      return { amount: Number(match[1]), unit };
    }
  }
  return null;
}

export function describeDuration(text: string): string {
  const simple = fromIsoDuration(text);
  if (!simple) {
    return text;
  }
  return `${simple.amount} ${simple.amount === 1 ? SINGULAR[simple.unit] : simple.unit}`;
}
