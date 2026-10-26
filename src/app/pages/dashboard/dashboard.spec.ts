import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Stats, ZONE_OFFSET_MINUTES } from '../../core/workflow/stats.api';
import { DashboardPage } from './dashboard';

function stats(days: number, change: Partial<Stats> = {}): Stats {
  return {
    from: '2026-09-21T18:30:00Z', to: '2026-09-28T09:00:00Z', days, offsetMinutes: 330,
    totals: { started: 4, completed: 2, cancelled: 1, active: 2, averageCycleSeconds: 46800, slaBreaches: 2 },
    processes: [
      { processKey: 'expense-approval', name: 'Expense approval', started: 3, completed: 2, cancelled: 1, active: 1, averageCycleSeconds: 46800, slaBreaches: 1 },
      { processKey: 'leave-request', name: 'Leave request', started: 1, completed: 0, cancelled: 0, active: 1, averageCycleSeconds: null, slaBreaches: 1 },
    ],
    daily: [
      { date: '2026-09-26', started: 2, completed: 0 },
      { date: '2026-09-27', started: 1, completed: 4 },
      { date: '2026-09-28', started: 1, completed: 0 },
    ],
    ...change,
  };
}

describe('DashboardPage', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ZONE_OFFSET_MINUTES, useValue: () => 330 }],
    });
    const fixture = TestBed.createComponent(DashboardPage);
    const controller = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const query = <T extends HTMLElement>(testId: string) => element.querySelector<T>(`[data-testid="${testId}"]`);
    const request = (): TestRequest => controller.expectOne((r) => r.url === '/api/workflow/stats');
    const answer = (body: Stats) => {
      request().flush(body);
      fixture.detectChanges();
    };
    return { fixture, controller, element, query, request, answer };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('asks for the last 30 of the viewer\'s days and shows the totals', () => {
    const { query, request, fixture } = setup();
    const req = request();
    expect(req.request.params.get('days')).toBe('30');
    expect(req.request.params.get('offsetMinutes')).toBe('330');
    req.flush(stats(30));
    fixture.detectChanges();

    expect(query('stat-started')!.textContent).toContain('4');
    expect(query('stat-completed')!.textContent).toContain('2');
    expect(query('stat-active')!.textContent).toContain('2');
    expect(query('stat-cycle')!.textContent).toContain('13 h');
    expect(query('stat-breaches')!.textContent).toContain('2');
  });

  it('can look at another period', () => {
    const { fixture, query, request, answer } = setup();
    answer(stats(30));

    query<HTMLButtonElement>('period-7')!.click();
    fixture.detectChanges();

    expect(request().request.params.get('days')).toBe('7');
    expect(query('period-7')!.getAttribute('aria-pressed')).toBe('true');
    expect(query('period-30')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('draws a bar for every day, scaled to the busiest one', () => {
    const { element, answer } = setup();
    answer(stats(30));

    const days = element.querySelectorAll('[data-testid="day"]');
    expect(days).toHaveLength(3);
    const heights = (day: Element) => Array.from(day.querySelectorAll<HTMLElement>('[data-testid="bar"]')).map((bar) => bar.style.height);
    expect(heights(days[0])).toEqual(['50%', '0%']);
    expect(heights(days[1])).toEqual(['25%', '100%']);
    expect(days[1].getAttribute('title')).toContain('1 started, 4 finished');
    expect(element.querySelector('[data-testid="daily-table"]')!.querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('breaks the figures down by process, with a dash where there is no average', () => {
    const { element, answer } = setup();
    answer(stats(30));

    const rows = element.querySelectorAll('[data-testid="process-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Expense approval');
    expect(rows[0].textContent).toContain('13 h');
    expect(rows[1].textContent).toContain('Leave request');
    expect(rows[1].textContent).toContain('—');
  });

  it('shows a period with nothing in it as zeros, not as an error', () => {
    const { element, query, answer } = setup();
    answer(stats(30, {
      totals: { started: 0, completed: 0, cancelled: 0, active: 0, averageCycleSeconds: null, slaBreaches: 0 },
      processes: [],
      daily: [{ date: '2026-09-27', started: 0, completed: 0 }, { date: '2026-09-28', started: 0, completed: 0 }],
    }));

    expect(query('stat-started')!.textContent).toContain('0');
    expect(query('stat-cycle')!.textContent).toContain('—');
    expect(element.textContent).toContain('No requests in this period.');
    const bars = Array.from(element.querySelectorAll<HTMLElement>('[data-testid="bar"]')).map((bar) => bar.style.height);
    expect(bars).toEqual(['0%', '0%', '0%', '0%']);
  });

  it('says so when the figures cannot be loaded, and can try again', () => {
    const { fixture, element, query, request, answer } = setup();
    request().flush(null, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();
    expect(element.textContent).toContain('could not be loaded');

    query<HTMLButtonElement>('retry')!.click();
    answer(stats(30));
    expect(query('stat-started')!.textContent).toContain('4');
  });

  it('drops the answer for a period the viewer has already left', () => {
    const { fixture, query, request, answer } = setup();
    answer(stats(30));

    query<HTMLButtonElement>('period-7')!.click();
    const seven = request();
    query<HTMLButtonElement>('period-90')!.click();
    fixture.detectChanges();

    expect(seven.cancelled).toBe(true);
    answer(stats(90, { totals: { started: 9, completed: 0, cancelled: 0, active: 0, averageCycleSeconds: null, slaBreaches: 0 } }));
    expect(query('stat-started')!.textContent).toContain('9');
    expect(query('period-90')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps a small count visible next to a very busy day', () => {
    const { element, answer } = setup();
    answer(stats(30, { daily: [{ date: '2026-09-27', started: 1, completed: 0 }, { date: '2026-09-28', started: 300, completed: 0 }] }));

    const bars = Array.from(element.querySelectorAll<HTMLElement>('[data-testid="bar"]')).map((bar) => bar.style.height);
    expect(bars).toEqual(['4%', '0%', '100%', '0%']);
  });
});
