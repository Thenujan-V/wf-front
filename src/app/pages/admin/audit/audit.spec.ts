import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AuditEntry, AuditResults } from '../../../core/audit/audit.models';
import { UserPicker } from '../../../core/identity/user-picker';
import { AuditPage } from './audit';

const completed: AuditEntry = {
  id: 2, action: 'workflow.task.completed', actorId: 'bob', entityType: 'TASK', entityId: 't-1',
  data: { instanceId: 'i-1', data: { taskId: 't-1', outcome: 'APPROVE' } }, correlationId: 'corr-2',
  occurredAt: '2026-10-01T09:00:00Z',
};
const reminder: AuditEntry = {
  id: 4, action: 'workflow.task.reminder', actorId: null, entityType: 'TASK', entityId: 't-1',
  data: { instanceId: 'i-1' }, correlationId: null, occurredAt: '2026-10-01T11:00:00Z',
};
const deleted: AuditEntry = {
  id: 3, action: 'document.deleted', actorId: 'bob', entityType: 'DOCUMENT', entityId: 'd-1',
  data: { documentId: 'd-1' }, correlationId: 'corr-3', occurredAt: '2026-10-01T10:00:00Z',
};

function results(items: AuditEntry[], total = items.length, page = 0): AuditResults {
  return { items, total, page, size: 20 };
}

describe('AuditPage', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [AuditPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(AuditPage);
    fixture.detectChanges();
    const controller = TestBed.inject(HttpTestingController);
    const element = fixture.nativeElement as HTMLElement;
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T | null;
    const all = (id: string) => [...element.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
    const request = () => controller.expectOne((r) => r.url === '/api/audit/entries');
    const settle = async () => {
      await fixture.whenStable();
      controller.match((r) => r.url.startsWith('/api/identity/users/')).forEach((r) => r.flush({ id: 'bob', displayName: 'Bob Manager' }));
      await fixture.whenStable();
    };
    const type = (id: string, value: string) => {
      const input = el<HTMLInputElement>(id)!;
      input.value = value;
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
    };
    return { fixture, controller, element, el, all, request, settle, type };
  }

  it('shows the latest entries with who did what to which thing', async () => {
    const s = setup();
    const req = s.request();
    expect(req.request.params.get('page')).toBe('0');
    req.flush(results([reminder, deleted, completed]));
    await s.settle();

    const rows = s.all('audit-row').map((r) => r.textContent ?? '');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('Task reminder');
    expect(rows[0]).toContain('System');
    expect(rows[1]).toContain('Document deleted');
    expect(rows[1]).toContain('Bob Manager');
    expect(s.all('audit-row')[1].querySelector('a')!.getAttribute('href')).toBe('/documents/d-1');
    expect(s.all('audit-row')[2].querySelector('a')!.getAttribute('href')).toBe('/requests/i-1');
  });

  it('filters by entity, person and period', async () => {
    const s = setup();
    s.request().flush(results([]));
    await s.settle();

    s.type('filter-entity-type', 'TASK');
    s.type('filter-entity-id', ' t-1 ');
    s.type('filter-from', '2026-10-01');
    s.type('filter-to', '2026-10-02');
    s.fixture.debugElement.query(By.directive(UserPicker)).triggerEventHandler('picked', { id: 'bob', username: 'bob', displayName: 'Bob Manager' });
    s.el('search')!.click();

    const req = s.request();
    expect(req.request.params.get('entityType')).toBe('TASK');
    expect(req.request.params.get('entityId')).toBe('t-1');
    expect(req.request.params.get('actor')).toBe('bob');
    // The period is whole days in the reader's own time zone: from the start of the first to the end of the last.
    expect(req.request.params.get('from')).toBe(new Date(2026, 9, 1).toISOString());
    expect(req.request.params.get('to')).toBe(new Date(2026, 9, 3).toISOString());
    req.flush(results([completed]));
    await s.settle();
    expect(s.all('audit-row')).toHaveLength(1);
  });

  it('refuses a period that ends before it starts without asking the server', async () => {
    const s = setup();
    s.request().flush(results([]));
    await s.settle();

    s.type('filter-from', '2026-10-05');
    s.type('filter-to', '2026-10-01');
    await s.fixture.whenStable();
    s.el('search')!.click();

    expect(s.el('range-error')!.textContent).toContain('must not be after');
    s.controller.expectNone((r) => r.url === '/api/audit/entries');
  });

  it('pages through a long log', async () => {
    const s = setup();
    s.request().flush(results([reminder], 45));
    await s.settle();
    expect(s.el('page-info')!.textContent).toContain('1 of 3');
    expect(s.el<HTMLButtonElement>('prev')!.disabled).toBe(true);

    s.el('next')!.click();
    const req = s.request();
    expect(req.request.params.get('page')).toBe('1');
    req.flush(results([completed], 45, 1));
    await s.settle();
    expect(s.el('page-info')!.textContent).toContain('2 of 3');
  });

  it('says so when nothing matches, and offers to retry after a failure', async () => {
    const s = setup();
    s.request().flush(results([]));
    await s.settle();
    expect(s.element.textContent).toContain('No entries match');

    s.el('search')!.click();
    s.request().flush({}, { status: 503, statusText: 'Unavailable' });
    await s.settle();
    expect(s.element.textContent).toContain('could not be loaded');
    s.el('retry')!.click();
    s.request().flush(results([deleted]));
    await s.settle();
    expect(s.all('audit-row')).toHaveLength(1);
  });

  it('shows the details of an entry in words on demand, with the raw record one more click away', async () => {
    const s = setup();
    const delegated: AuditEntry = { ...completed, id: 5, action: 'workflow.task.delegated',
      data: { instanceId: 'i-1', businessKey: 'EXP-7', taskName: 'Manager approval', data: { taskId: 't-1', fromUserId: 'bob', toUserId: 'bob' } } };
    s.request().flush(results([delegated]));
    await s.settle();
    expect(s.el('audit-data')).toBeNull();
    expect(s.all('audit-row')[0].textContent).toContain('Task · t-1');

    s.el('toggle-data')!.click();
    await s.settle();
    const rows = s.all('audit-detail').map((d) => [d.querySelector('dt')!.textContent?.trim(), d.querySelector('dd')!.textContent?.trim()]);
    expect(rows).toEqual([['Task', 'Manager approval'], ['Request', 'EXP-7'], ['From', 'Bob Manager'], ['To', 'Bob Manager']]);
    expect(s.all('audit-detail')[1].querySelector('a')!.getAttribute('href')).toBe('/requests/i-1');
    expect(s.el('audit-raw')).toBeNull();
    expect(s.el('audit-data')!.textContent).not.toContain('"toUserId"');

    s.el('toggle-raw')!.click();
    await s.fixture.whenStable();
    expect(s.el('audit-raw')!.textContent).toContain('"toUserId": "bob"');
    expect(s.el('audit-data')!.textContent).toContain('workflow.task.delegated');
    expect(s.el('audit-data')!.textContent).toContain('corr-2');

    s.el('toggle-data')!.click(); // closing and opening again starts with the words, not the raw record
    await s.fixture.whenStable();
    s.el('toggle-data')!.click();
    await s.fixture.whenStable();
    expect(s.all('audit-detail')).toHaveLength(4);
    expect(s.el('audit-raw')).toBeNull();
  });

  it('says so when an entry has nothing more to tell', async () => {
    const s = setup();
    s.request().flush(results([{ ...reminder, data: { type: 'workflow.task.reminder' } }]));
    await s.settle();

    s.el('toggle-data')!.click();
    await s.fixture.whenStable();
    expect(s.all('audit-detail')).toHaveLength(0);
    expect(s.el('audit-data')!.textContent).toContain('Nothing more was recorded');
    expect(s.el('toggle-raw')).not.toBeNull();
  });

  it('has one Search button, and finding a person does not run the audit search', async () => {
    const s = setup();
    s.request().flush(results([]));
    await s.settle();
    const buttons = [...s.element.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(buttons.filter((b) => b === 'Search')).toHaveLength(1);
    expect(s.el('user-search')!.textContent?.trim()).toBe('Find');

    const person = s.element.querySelector('input[type="search"]') as HTMLInputElement;
    person.value = 'bo';
    person.dispatchEvent(new Event('input'));
    s.el('user-search')!.click();

    s.controller.expectOne((r) => r.url === '/api/identity/users').flush({ items: [] });
    s.controller.expectNone((r) => r.url === '/api/audit/entries');
  });
});
