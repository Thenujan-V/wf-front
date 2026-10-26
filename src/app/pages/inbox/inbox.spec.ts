import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input, output, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { problemInterceptor } from '../../core/http/problem.interceptor';
import { ToastService } from '../../core/ui/toast.service';
import { NOW } from '../../core/workflow/clock';
import { task } from '../../../testing/workflow-fixtures';
import { AttachmentsStub } from '../../../testing/attachments-stub';
import { Attachments } from '../documents/attachments';
import { InboxPage } from './inbox';
import { InboxSummary } from './inbox-summary';
import { TaskPanel } from './task-panel';

@Component({ selector: 'app-inbox-summary', template: '' })
class InboxSummaryStub {
  readonly version = input(0);
  readonly choose = output<'mine' | 'group'>();
}

describe('InboxPage', () => {
  function setup(roles: string[] = ['user']) {
    TestBed.configureTestingModule({
      imports: [InboxPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NOW, useValue: () => new Date('2026-09-29T09:00:00Z') },
        { provide: AuthService, useValue: { userId: signal('me'), hasRole: (r: string) => roles.includes(r) } },
      ],
    });
    TestBed.overrideComponent(TaskPanel, { remove: { imports: [Attachments] }, add: { imports: [AttachmentsStub] } });
    TestBed.overrideComponent(InboxPage, { remove: { imports: [InboxSummary] }, add: { imports: [InboxSummaryStub] } });
    const fixture = TestBed.createComponent(InboxPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const controller = TestBed.inject(HttpTestingController);
    const rows = () => Array.from(element.querySelectorAll('[data-testid="task-row"]')).map((r) => r.textContent ?? '');
    return { fixture, element, controller, rows };
  }

  /** Renders, answers the user-name lookups the render triggered, and renders again. */
  async function settle(fixture: { whenStable(): Promise<unknown> }, controller: HttpTestingController) {
    await fixture.whenStable();
    controller.match((req) => req.url.startsWith('/api/identity/users/')).forEach((req) => req.flush({ displayName: 'Carol Clerk' }));
    await fixture.whenStable();
  }

  it('lists my tasks, soonest due first, with SLA badges', async () => {
    const { fixture, controller, rows } = setup();
    controller.expectOne('/api/workflow/tasks?view=mine').flush([
      task({ id: 'a', name: 'No deadline' }),
      task({ id: 'b', name: 'Late one', dueAt: '2026-09-29T08:00:00Z' }),
      task({ id: 'c', name: 'Later one', dueAt: '2026-10-05T09:00:00Z' }),
    ]);
    await settle(fixture, controller);

    expect(rows().map((r) => r.match(/No deadline|Late one|Later one/)?.[0])).toEqual(['Late one', 'Later one', 'No deadline']);
    expect(rows()[0]).toContain('Overdue');
    expect(rows()[0]).toContain('EXP-1');
    controller.verify();
  });

  it('switches to group tasks and filters by text and overdue', async () => {
    const { fixture, element, controller, rows } = setup();
    controller.expectOne('/api/workflow/tasks?view=mine').flush([]);
    await fixture.whenStable();
    expect(element.textContent).toContain('No tasks waiting for you');

    (element.querySelector('[data-testid="tab-group"]') as HTMLButtonElement).click();
    controller.expectOne('/api/workflow/tasks?view=group').flush([
      task({ id: 'a', name: 'Finance approval', businessKey: 'EXP-9', assigneeId: null, candidates: ['role:wms-admin'] }),
      task({ id: 'b', name: 'Legal review', businessKey: 'LEG-2', assigneeId: null, candidates: ['group:g'], dueAt: '2026-09-29T08:00:00Z' }),
    ]);
    await settle(fixture, controller);
    expect(rows().length).toBe(2);

    const search = element.querySelector('[data-testid="task-filter"]') as HTMLInputElement;
    search.value = 'exp-9';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(rows().length).toBe(1);
    expect(rows()[0]).toContain('Finance approval');

    search.value = '';
    search.dispatchEvent(new Event('input'));
    (element.querySelector('[data-testid="overdue-only"]') as HTMLInputElement).click();
    await fixture.whenStable();
    expect(rows().length).toBe(1);
    expect(rows()[0]).toContain('Legal review');
    controller.verify();
  });

  it('offers all tasks only to administrators', async () => {
    const user = setup(['user']);
    user.controller.expectOne('/api/workflow/tasks?view=mine').flush([]);
    expect(user.element.querySelector('[data-testid="tab-all"]')).toBeNull();
    TestBed.resetTestingModule();

    const admin = setup(['wms-admin']);
    admin.controller.expectOne('/api/workflow/tasks?view=mine').flush([]);
    await admin.fixture.whenStable();
    (admin.element.querySelector('[data-testid="tab-all"]') as HTMLButtonElement).click();
    admin.controller.expectOne('/api/workflow/tasks?view=all').flush([]);
    admin.controller.verify();
  });

  it('shows an error state with retry', async () => {
    const { fixture, element, controller } = setup();
    controller.expectOne('/api/workflow/tasks?view=mine').flush(null, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(element.textContent).toContain('could not be loaded');

    (element.querySelector('[data-testid="retry"]') as HTMLButtonElement).click();
    controller.expectOne('/api/workflow/tasks?view=mine').flush([]);
    controller.verify();
  });

  it('opens the panel for a task and reloads after an action', async () => {
    const { fixture, element, controller } = setup();
    controller.expectOne('/api/workflow/tasks?view=mine').flush([task({})]);
    await settle(fixture, controller);

    (element.querySelector('[data-testid="task-row"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    (element.querySelector('[data-testid="outcome-APPROVE"]') as HTMLButtonElement).click();
    controller.expectOne('/api/workflow/tasks/t1/complete').flush(null);
    await fixture.whenStable();

    controller.expectOne('/api/workflow/tasks?view=mine').flush([]);
    await fixture.whenStable();
    expect(element.querySelector('app-task-panel')).toBeNull();
    controller.verify();
  });

  it('gives every task a fresh panel, so a draft comment never moves to another task', async () => {
    const { fixture, element, controller } = setup();
    controller.expectOne('/api/workflow/tasks?view=mine').flush([task({ id: 'a', name: 'First' }), task({ id: 'b', name: 'Second' })]);
    await settle(fixture, controller);
    const rows = element.querySelectorAll('[data-testid="task-row"]');

    (rows[0] as HTMLButtonElement).click();
    await fixture.whenStable();
    const comment = element.querySelector('textarea') as HTMLTextAreaElement;
    comment.value = 'Reject: missing receipt';
    comment.dispatchEvent(new Event('input'));
    await fixture.whenStable(); // a person types, the page renders, then they click the next task
    (rows[1] as HTMLButtonElement).click();
    await fixture.whenStable();

    expect((element.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
    (element.querySelector('[data-testid="outcome-APPROVE"]') as HTMLButtonElement).click();
    expect(controller.expectOne('/api/workflow/tasks/b/complete').request.body).toEqual({ outcome: 'APPROVE', data: {} });
  });

  it('shows a load failure on the page only, not also as a toast', async () => {
    TestBed.configureTestingModule({
      imports: [InboxPage],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([problemInterceptor])),
        provideHttpClientTesting(),
        { provide: NOW, useValue: () => new Date('2026-09-29T09:00:00Z') },
        { provide: AuthService, useValue: { userId: signal('me'), hasRole: () => false, reauthenticate: () => false } },
      ],
    });
    TestBed.overrideComponent(InboxPage, { remove: { imports: [InboxSummary] }, add: { imports: [InboxSummaryStub] } });
    const fixture = TestBed.createComponent(InboxPage);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/workflow/tasks?view=mine')
      .flush({ detail: 'Service unavailable' }, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('could not be loaded');
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
  });

  it('has the summary strip: it counts again after each load, and its cards switch the list', async () => {
    const { fixture, controller } = setup();
    controller.expectOne('/api/workflow/tasks?view=mine').flush([]);
    await fixture.whenStable();
    const summary = fixture.debugElement.query(By.directive(InboxSummaryStub)).componentInstance as InboxSummaryStub;
    const loads = summary.version();
    expect(loads).toBeGreaterThan(0);

    summary.choose.emit('group');
    controller.expectOne('/api/workflow/tasks?view=group').flush([]);
    await fixture.whenStable();

    expect(summary.version()).toBeGreaterThan(loads);
    controller.verify();
  });
});
