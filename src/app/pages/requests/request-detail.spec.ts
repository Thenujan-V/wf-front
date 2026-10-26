import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { EmbedService } from '../../core/embed/embed.service';
import { problemInterceptor } from '../../core/http/problem.interceptor';
import { ToastService } from '../../core/ui/toast.service';
import { NOW } from '../../core/workflow/clock';
import { task } from '../../../testing/workflow-fixtures';
import { By } from '@angular/platform-browser';
import { AttachmentsStub } from '../../../testing/attachments-stub';
import { Attachments } from '../documents/attachments';
import { RequestDetailPage } from './request-detail';

describe('RequestDetailPage', () => {
  const openDocument = vi.fn();

  function setup(id = 'i1') {
    TestBed.configureTestingModule({
      imports: [RequestDetailPage],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([problemInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { reauthenticate: () => false } },
        { provide: NOW, useValue: () => new Date('2026-09-29T09:00:00Z') },
        { provide: EmbedService, useValue: { canOpenDocuments: signal(true), openDocument } },
      ],
    });
    TestBed.overrideComponent(RequestDetailPage, { remove: { imports: [Attachments] }, add: { imports: [AttachmentsStub] } });
    const fixture = TestBed.createComponent(RequestDetailPage);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    const controller = TestBed.inject(HttpTestingController);
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, controller, element };
  }

  const detail = {
    instance: {
      id: 'i1', processKey: 'expense-approval', processVersion: 1, businessKey: 'EXP-7', status: 'ACTIVE', endStatus: null,
      initiatorId: 'carol', startedAt: '2026-09-28T09:00:00Z', endedAt: null,
    },
    variables: { initiator: 'carol', form: { amount: 20000, purpose: 'Offsite', comment_t1: 'Receipts attached, fine' } },
    tasks: [
      task({ id: 't1', status: 'COMPLETED', assigneeId: 'bob' }),
      task({ id: 't2', name: 'Finance approval', assigneeId: null, candidates: ['role:wms-admin'], dueAt: '2026-09-29T08:00:00Z' }),
    ],
  };

  it('shows the request, its open tasks, details and a readable timeline', async () => {
    const { fixture, controller, element } = setup();
    controller.expectOne('/api/workflow/instances/i1').flush(detail);
    controller.expectOne('/api/workflow/instances/i1/history').flush([
      { type: 'InstanceStarted', actorId: 'carol', data: {}, occurredAt: '2026-09-28T09:00:00Z' },
      { type: 'NodeEntered', actorId: 'carol', data: {}, occurredAt: '2026-09-28T09:00:00Z' },
      { type: 'TaskCompleted', actorId: 'bob', data: { taskId: 't1', outcome: 'APPROVE' }, occurredAt: '2026-09-28T10:00:00Z' },
    ]);
    await fixture.whenStable();
    controller.match((req) => req.url.startsWith('/api/identity/users/')).forEach((req) => req.flush({ displayName: 'Someone' }));
    await fixture.whenStable();

    const text = element.textContent ?? '';
    expect(text).toContain('EXP-7');
    expect(text).toContain('In progress');
    expect(element.querySelectorAll('[data-testid="open-task"]').length).toBe(1);
    expect(text).toContain('Finance approval');
    expect(text).toContain('Overdue');
    expect(text).toContain('amount');
    expect(text).toContain('20000');
    const events = Array.from(element.querySelectorAll('[data-testid="timeline-entry"]')).map((e) => e.textContent ?? '');
    expect(events.length).toBe(2);
    expect(events[1]).toContain('Manager approval: Approve');
    expect(events[1]).toContain('Receipts attached, fine');
    expect(element.querySelector('dl')?.textContent).not.toContain('comment_t1');
    controller.verify();
  });

  it('opens the auraDOCS document the request was started for', async () => {
    const { fixture, controller, element } = setup();
    controller.expectOne('/api/workflow/instances/i1').flush({ ...detail, variables: { form: { auradocsDocId: 42, amount: 1 } } });
    controller.expectOne('/api/workflow/instances/i1/history').flush([]);
    await fixture.whenStable();

    (element.querySelector('[data-testid="open-document"]') as HTMLButtonElement).click();
    expect(openDocument).toHaveBeenCalledWith('42');
  });

  it('offers no document link for requests without one', async () => {
    const { fixture, controller, element } = setup();
    controller.expectOne('/api/workflow/instances/i1').flush(detail);
    controller.expectOne('/api/workflow/instances/i1/history').flush([]);
    await fixture.whenStable();

    expect(element.querySelector('[data-testid="open-document"]')).toBeNull();
  });

  it('shows a friendly state for requests you cannot see, without an error toast', async () => {
    const { fixture, controller, element } = setup('secret');
    controller.expectOne('/api/workflow/instances/secret')
      .flush({ code: 'WF_INSTANCE_NOT_FOUND', detail: 'Request not found' }, { status: 404, statusText: 'Not Found' });
    // forkJoin cancels the history call once the detail call fails.
    expect(controller.expectOne('/api/workflow/instances/secret/history').cancelled).toBe(true);
    await fixture.whenStable();

    expect(element.textContent).toContain('does not exist or you cannot see it');
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
    controller.verify();
  });

  it('offers a retry when loading fails for another reason', async () => {
    const { fixture, controller, element } = setup();
    controller.expectOne('/api/workflow/instances/i1').flush(null, { status: 503, statusText: 'Unavailable' });
    expect(controller.expectOne('/api/workflow/instances/i1/history').cancelled).toBe(true);
    await fixture.whenStable();
    expect(element.textContent).toContain('could not be loaded');

    (element.querySelector('[data-testid="retry"]') as HTMLButtonElement).click();
    controller.expectOne('/api/workflow/instances/i1').flush(detail);
    controller.expectOne('/api/workflow/instances/i1/history').flush([]);
    await fixture.whenStable();
    controller.match(() => true).forEach((req) => req.flush({ displayName: 'Someone' }));
    await fixture.whenStable();
    expect(element.textContent).toContain('EXP-7');
  });

  it("shows the request's attachments", async () => {
    const { fixture, controller } = setup();
    controller.expectOne('/api/workflow/instances/i1').flush(detail);
    controller.expectOne('/api/workflow/instances/i1/history').flush([]);
    await fixture.whenStable();

    const attachments = fixture.debugElement.query(By.directive(AttachmentsStub)).componentInstance as AttachmentsStub;
    expect(attachments.instanceId()).toBe('i1');
  });

  it('shows file fields by their file names', async () => {
    const { fixture, controller, element } = setup();
    controller.expectOne('/api/workflow/instances/i1').flush({ ...detail, variables: { form: {
      receipts: [{ documentId: 'd1', name: 'Taxi.pdf' }, { documentId: 'd2', name: 'Hotel.pdf' }],
    } } });
    controller.expectOne('/api/workflow/instances/i1/history').flush([]);
    await fixture.whenStable();

    expect(element.textContent).toContain('Taxi.pdf, Hotel.pdf');
  });
});
