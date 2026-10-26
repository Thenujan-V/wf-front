import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UserName } from '../../../core/identity/user-name';
import { ToastService } from '../../../core/ui/toast.service';
import { InstanceSummary } from '../../../core/workflow/workflow.models';
import { DeadJob } from '../../../core/workflow/monitor.api';
import { MonitorPage } from './monitor';

@Component({ selector: 'app-user-name', template: '{{ userId() }}' })
class UserNameStub {
  readonly userId = input<string | null>(null);
}

function instance(id: string, status: string, businessKey: string | null = `REF-${id}`): InstanceSummary {
  return { id, processKey: 'expense-approval', processVersion: 2, businessKey, status, endStatus: status === 'COMPLETED' ? 'APPROVED' : null,
    initiatorId: 'carol', startedAt: '2026-09-26T10:00:00Z', endedAt: null };
}

const deadJob: DeadJob = { id: 'j1', instanceId: 'i1', type: 'ASYNC_ACTION', status: 'DEAD', dueAt: '2026-09-27T12:00:00Z',
  attempts: 5, lastError: 'The webhook answered 500', processKey: 'expense-approval', businessKey: 'REF-i1' };

describe('MonitorPage', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [MonitorPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.overrideComponent(MonitorPage, { remove: { imports: [UserName] }, add: { imports: [UserNameStub] } });
    const fixture = TestBed.createComponent(MonitorPage);
    const controller = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    controller.expectOne('/api/workflow/catalog').flush([{ key: 'expense-approval', name: 'Expense approval', version: 2, startForm: null }]);
    const element = fixture.nativeElement as HTMLElement;
    const query = <T extends HTMLElement>(testId: string) => element.querySelector<T>(`[data-testid="${testId}"]`);
    const requests = (): TestRequest => controller.expectOne((r) => r.url === '/api/workflow/admin/instances');
    const jobs = (): TestRequest => controller.expectOne((r) => r.url === '/api/workflow/jobs');
    const answer = (items: InstanceSummary[], total = items.length, page = 0) => {
      requests().flush({ items, total, page, size: 20 });
      fixture.detectChanges();
    };
    const answerJobs = (list: DeadJob[]) => {
      jobs().flush(list);
      fixture.detectChanges();
    };
    return { fixture, controller, element, query, requests, jobs, answer, answerJobs };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.inject(HttpTestingController).verify();
  });

  it('lists every request and says how many jobs are dead', () => {
    const { element, query, requests, answerJobs, fixture } = setup();
    const req = requests();
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.has('status')).toBe(false);
    req.flush({ items: [instance('i1', 'ACTIVE'), instance('i2', 'COMPLETED', null)], total: 2, page: 0, size: 20 });
    answerJobs([deadJob]);
    fixture.detectChanges();

    const rows = element.querySelectorAll('[data-testid="instance-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('REF-i1');
    expect(rows[0].textContent).toContain('In progress');
    expect(rows[0].textContent).toContain('carol');
    expect(rows[1].textContent).toContain('Approved');
    expect(rows[0].querySelector('a')!.getAttribute('href')).toBe('/requests/i1');
    expect(query('tab-jobs')!.textContent).toContain('Dead jobs (1)');
  });

  it('searches from the first page with the chosen filters', () => {
    const { fixture, query, requests, answer, answerJobs } = setup();
    answer([instance('i1', 'ACTIVE')], 45);
    answerJobs([]);
    query<HTMLButtonElement>('next')!.click();
    fixture.detectChanges();
    expect(requests().request.params.get('page')).toBe('1');

    const status = query<HTMLSelectElement>('filter-status')!;
    status.value = 'SUSPENDED';
    status.dispatchEvent(new Event('change'));
    const text = query<HTMLInputElement>('filter-q')!;
    text.value = 'EXP';
    text.dispatchEvent(new Event('input'));
    query<HTMLButtonElement>('search')!.click();
    fixture.detectChanges();

    const req = requests();
    expect(req.request.params.get('status')).toBe('SUSPENDED');
    expect(req.request.params.get('q')).toBe('EXP');
    expect(req.request.params.get('page')).toBe('0');
  });

  it('offers only the actions that fit a request, and loads the list again after one', () => {
    const { fixture, controller, element, answer, answerJobs } = setup();
    answer([instance('i1', 'ACTIVE'), instance('i2', 'SUSPENDED'), instance('i3', 'COMPLETED')]);
    answerJobs([]);
    const rows = element.querySelectorAll('[data-testid="instance-row"]');
    const actions = (row: Element) => Array.from(row.querySelectorAll('button')).map((b) => b.textContent!.trim());
    expect(actions(rows[0])).toEqual(['Put on hold', 'Cancel']);
    expect(actions(rows[1])).toEqual(['Resume', 'Cancel']);
    expect(actions(rows[2])).toEqual([]);

    rows[0].querySelector<HTMLButtonElement>('[data-testid="suspend"]')!.click();
    controller.expectOne('/api/workflow/instances/i1/suspend').flush(null);
    fixture.detectChanges();

    expect(TestBed.inject(ToastService).toasts().map((t) => t.message)).toEqual(['The request is on hold.']);
    answer([instance('i1', 'SUSPENDED')]);
    answerJobs([]);
    expect(element.querySelectorAll('[data-testid="instance-row"]')).toHaveLength(1);
  });

  it('asks before cancelling, and sends nothing when the answer is no', () => {
    const { fixture, controller, element, answer, answerJobs } = setup();
    answer([instance('i1', 'ACTIVE')]);
    answerJobs([]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    element.querySelector<HTMLButtonElement>('[data-testid="cancel"]')!.click();
    expect(confirm).toHaveBeenCalledTimes(1);
    controller.expectNone('/api/workflow/instances/i1/cancel');

    confirm.mockReturnValue(true);
    element.querySelector<HTMLButtonElement>('[data-testid="cancel"]')!.click();
    controller.expectOne('/api/workflow/instances/i1/cancel').flush(null);
    fixture.detectChanges();
    answer([instance('i1', 'CANCELLED')]);
    answerJobs([]);
  });

  it('loads the list again when an action fails, so it shows what is true', () => {
    const { fixture, controller, element, answer, answerJobs } = setup();
    answer([instance('i1', 'SUSPENDED')]);
    answerJobs([]);

    element.querySelector<HTMLButtonElement>('[data-testid="resume"]')!.click();
    controller.expectOne('/api/workflow/instances/i1/resume').flush({ code: 'WF_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    answer([instance('i1', 'CANCELLED')]);
    answerJobs([]);
    expect(element.querySelector('[data-testid="instance-row"]')!.textContent).toContain('Cancelled');
  });

  it('lists dead jobs with what went wrong, and retries one', () => {
    const { fixture, controller, element, query, answer, answerJobs } = setup();
    answer([]);
    answerJobs([deadJob]);
    query<HTMLButtonElement>('tab-jobs')!.click();
    fixture.detectChanges();

    const row = element.querySelector('[data-testid="job-row"]')!;
    expect(row.textContent).toContain('Async action');
    expect(row.textContent).toContain('REF-i1');
    expect(row.textContent).toContain('The webhook answered 500');
    expect(row.textContent).toContain('5 attempts');

    row.querySelector<HTMLButtonElement>('[data-testid="retry-job"]')!.click();
    controller.expectOne('/api/workflow/jobs/j1/retry').flush(null);
    fixture.detectChanges();
    expect(TestBed.inject(ToastService).toasts().map((t) => t.message)).toEqual(['The job will be tried again.']);
    answerJobs([]);
    expect(element.textContent).toContain('No dead jobs.');
  });

  it('says so when the requests cannot be loaded, and can try again', () => {
    const { fixture, element, query, requests, answer, answerJobs } = setup();
    requests().flush(null, { status: 502, statusText: 'Bad Gateway' });
    answerJobs([]);
    fixture.detectChanges();
    expect(element.textContent).toContain('could not be loaded');

    query<HTMLButtonElement>('retry')!.click();
    answer([]);
    expect(element.textContent).toContain('No requests match.');
  });

  it('drops the answer for a page the administrator has already left', () => {
    const { fixture, query, requests, answer, answerJobs } = setup();
    answer([instance('i1', 'ACTIVE')], 45);
    answerJobs([]);

    query<HTMLButtonElement>('next')!.click();
    const second = requests();
    query<HTMLButtonElement>('next')!.click();
    fixture.detectChanges();

    expect(second.cancelled).toBe(true);
    const third = requests();
    expect(third.request.params.get('page')).toBe('2');
    third.flush({ items: [instance('i41', 'ACTIVE')], total: 45, page: 2, size: 20 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Page 3 of 3');
  });

  it('keeps each row busy until its own action has finished', () => {
    const { fixture, controller, element, requests, jobs, answer, answerJobs } = setup();
    answer([instance('i1', 'ACTIVE'), instance('i2', 'ACTIVE')]);
    answerJobs([]);
    const suspend = () => Array.from(element.querySelectorAll<HTMLButtonElement>('[data-testid="suspend"]'));

    suspend()[0].click();
    suspend()[1].click();
    fixture.detectChanges();
    expect(suspend().map((button) => button.disabled)).toEqual([true, true]);

    controller.expectOne('/api/workflow/instances/i1/suspend').flush(null);
    fixture.detectChanges();
    requests(); // superseded by the load after the second action
    jobs();
    expect(suspend().map((button) => button.disabled)).toEqual([false, true]);

    controller.expectOne('/api/workflow/instances/i2/suspend').flush(null);
    answer([instance('i1', 'SUSPENDED'), instance('i2', 'SUSPENDED')]);
    answerJobs([]);
  });

  it('steps back when the page it was on has emptied', () => {
    const { fixture, query, requests, answer, answerJobs } = setup();
    answer([instance('i1', 'ACTIVE')], 41);
    answerJobs([]);
    query<HTMLButtonElement>('next')!.click();
    fixture.detectChanges();
    answer([instance('i21', 'ACTIVE')], 41, 1);
    query<HTMLButtonElement>('next')!.click();
    fixture.detectChanges();

    requests().flush({ items: [], total: 40, page: 2, size: 20 }); // the 41st was cancelled meanwhile
    fixture.detectChanges();

    const again = requests();
    expect(again.request.params.get('page')).toBe('1');
    again.flush({ items: [instance('i21', 'ACTIVE')], total: 40, page: 1, size: 20 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Page 2 of 2');
  });

  it('says so when there are more dead jobs than it lists', () => {
    const { fixture, element, query, answer, answerJobs } = setup();
    answer([]);
    answerJobs(Array.from({ length: 200 }, (_, n) => ({ ...deadJob, id: 'j' + n })));
    expect(query('tab-jobs')!.textContent).toContain('Dead jobs (200+)');

    query<HTMLButtonElement>('tab-jobs')!.click();
    fixture.detectChanges();
    expect(element.textContent).toContain('Only the first 200 are shown.');
  });

  it('suggests the published processes and says what the search box matches', () => {
    const { element, query, answer, answerJobs } = setup();
    answer([]);
    answerJobs([]);

    const process = query<HTMLInputElement>('filter-process')!;
    const listId = process.getAttribute('list')!;
    expect(Array.from(element.querySelectorAll<HTMLOptionElement>('#' + listId + ' option')).map((o) => o.value)).toEqual(['expense-approval']);
    expect(query<HTMLInputElement>('filter-q')!.placeholder).toBe('Reference starts with…, or a full id');
  });

  it('switches between requests and dead jobs with buttons that say which one is shown', () => {
    const { fixture, element, query, answer, answerJobs } = setup();
    answer([]);
    answerJobs([]);
    expect(element.querySelector('[role="tab"]')).toBeNull();
    expect(query('tab-requests')!.getAttribute('aria-pressed')).toBe('true');
    expect(query('tab-jobs')!.getAttribute('aria-pressed')).toBe('false');

    query<HTMLButtonElement>('tab-jobs')!.click();
    fixture.detectChanges();
    expect(query('tab-jobs')!.getAttribute('aria-pressed')).toBe('true');
  });
});
