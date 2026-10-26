import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_ERRORS } from '../http/problem.interceptor';

export interface StatsTotals {
  /** Requests started in the period. */
  started: number;
  /** Requests that ended in the period. */
  completed: number;
  cancelled: number;
  /** In progress or on hold right now. */
  active: number;
  /** Start to end of the requests completed in the period; null when there are none. */
  averageCycleSeconds: number | null;
  slaBreaches: number;
}

export interface ProcessStats extends StatsTotals {
  processKey: string;
  name: string;
}

export interface DayStats {
  /** One of the viewer's days, as yyyy-mm-dd. */
  date: string;
  started: number;
  completed: number;
}

export interface Stats {
  from: string;
  to: string;
  days: number;
  offsetMinutes: number;
  totals: StatsTotals;
  processes: ProcessStats[];
  daily: DayStats[];
}

/** The browser's minutes east of UTC, so "a day" on the dashboard is the viewer's day. */
export const ZONE_OFFSET_MINUTES = new InjectionToken<() => number>('ZONE_OFFSET_MINUTES', {
  providedIn: 'root',
  factory: () => () => -new Date().getTimezoneOffset(),
});

/** Spec §9 dashboard: throughput, average cycle time, SLA breaches. */
@Injectable({ providedIn: 'root' })
export class StatsApi {
  private readonly http = inject(HttpClient);

  stats(days: number, offsetMinutes: number, silent = false): Observable<Stats> {
    return this.http.get<Stats>('/api/workflow/stats', {
      params: { days, offsetMinutes },
      context: new HttpContext().set(SILENT_ERRORS, silent),
    });
  }
}
