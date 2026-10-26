import { InjectionToken } from '@angular/core';

/** Current time; tests replace it to pin SLA states. */
export const NOW = new InjectionToken<() => Date>('NOW', { providedIn: 'root', factory: () => () => new Date() });
