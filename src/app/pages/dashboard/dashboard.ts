import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { formatDuration } from '../../core/workflow/duration';
import { Stats, StatsApi, ZONE_OFFSET_MINUTES } from '../../core/workflow/stats.api';

const PERIODS = [7, 30, 90];
/** One request must still be seen next to a day with hundreds. */
const MIN_BAR_PERCENT = 4;

/** Spec §9 dashboard: throughput, average cycle time and SLA breaches. Totals only; everyone may see it. */
@Component({
  selector: 'app-dashboard',
  imports: [DatePipe],
  templateUrl: './dashboard.html',
})
export class DashboardPage {
  private readonly api = inject(StatsApi);
  private readonly offsetMinutes = inject(ZONE_OFFSET_MINUTES);

  protected readonly periods = PERIODS;
  protected readonly duration = formatDuration;
  protected readonly days = signal(30);
  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly stats = signal<Stats | null>(null);
  /** The busiest day's count, at least 1 so that an empty period draws empty bars rather than dividing by zero. */
  protected readonly busiest = computed(() =>
    Math.max(1, ...(this.stats()?.daily ?? []).map((day) => Math.max(day.started, day.completed))));

  /** The request in flight; a newer one replaces it, so a slow answer never overwrites a later choice. */
  private request: Subscription | null = null;

  constructor() {
    this.load();
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  protected choose(days: number): void {
    this.days.set(days);
    this.load();
  }

  protected retry(): void {
    this.state.set('loading');
    this.load();
  }

  protected height(count: number): string {
    if (count <= 0) {
      return '0%';
    }
    return `${Math.max(MIN_BAR_PERCENT, Math.round((count / this.busiest()) * 100))}%`;
  }

  private load(): void {
    this.request?.unsubscribe();
    this.request = this.api.stats(this.days(), this.offsetMinutes(), true).subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.state.set('ready');
      },
      error: () => this.state.set('failed'),
    });
  }
}
