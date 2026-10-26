import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/ui/toast.service';
import { TaskView } from '../../core/workflow/workflow.models';
import { task } from '../../../testing/workflow-fixtures';
import { By } from '@angular/platform-browser';
import { AttachmentsStub } from '../../../testing/attachments-stub';
import { Attachments } from '../documents/attachments';
import { TaskPanel } from './task-panel';

describe('TaskPanel', () => {
  function setup(value: TaskView) {
    TestBed.configureTestingModule({
      imports: [TaskPanel],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { userId: signal('me'), hasRole: () => false } },
      ],
    });
    TestBed.overrideComponent(TaskPanel, { remove: { imports: [Attachments] }, add: { imports: [AttachmentsStub] } });
    const fixture = TestBed.createComponent(TaskPanel);
    fixture.componentRef.setInput('task', value);
    let changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    fixture.detectChanges();
    const controller = TestBed.inject(HttpTestingController);
    controller.match((req) => req.url.startsWith('/api/identity/users/')).forEach((req) => req.flush({ displayName: 'Carol Clerk' }));
    const element = fixture.nativeElement as HTMLElement;
    const button = (testId: string) => element.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null;
    return { fixture, element, controller, button, changes: () => changed };
  }

  it('completes my task with the chosen outcome and comment, once', async () => {
    const { fixture, element, controller, button, changes } = setup(task({}));
    const comment = element.querySelector('textarea') as HTMLTextAreaElement;
    comment.value = 'Within budget';
    comment.dispatchEvent(new Event('input'));

    button('outcome-APPROVE')!.click();
    fixture.detectChanges();
    expect(button('outcome-REJECT')!.disabled).toBe(true);
    button('outcome-APPROVE')!.click(); // a double click must not send twice

    const req = controller.expectOne({ method: 'POST', url: '/api/workflow/tasks/t1/complete' });
    // Each task's comment has its own key, so a later approver cannot overwrite an earlier one.
    expect(req.request.body).toEqual({ outcome: 'APPROVE', data: {}, comment: 'Within budget' });
    req.flush(null);
    await fixture.whenStable();

    expect(changes()).toBe(1);
    expect(TestBed.inject(ToastService).toasts().map((t) => t.message)).toEqual(['Manager approval: Approve']);
    controller.verify();
  });

  it('sends no comment when it is blank', () => {
    const { controller, button } = setup(task({}));
    button('outcome-REJECT')!.click();
    expect(controller.expectOne('/api/workflow/tasks/t1/complete').request.body).toEqual({ outcome: 'REJECT', data: {} });
  });

  it('claims a group task and reports a stale task without getting stuck', async () => {
    const { fixture, controller, button, changes } = setup(task({ assigneeId: null, candidates: ['group:g'] }));
    expect(button('outcome-APPROVE')).toBeNull();

    button('claim')!.click();
    controller.expectOne({ method: 'POST', url: '/api/workflow/tasks/t1/claim' })
      .flush({ code: 'WF_TASK_NOT_OPEN', detail: 'Task already claimed' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();

    expect(changes()).toBe(1);
    expect(button('claim')!.disabled).toBe(false);
    controller.verify();
  });

  it('releases a claimed task', async () => {
    const { fixture, controller, button, changes } = setup(task({ status: 'CLAIMED', candidates: ['group:g'] }));
    button('unclaim')!.click();
    controller.expectOne({ method: 'POST', url: '/api/workflow/tasks/t1/unclaim' }).flush(null);
    await fixture.whenStable();
    expect(changes()).toBe(1);
  });

  it('delegates to a picked person', async () => {
    const { fixture, element, controller, button, changes } = setup(task({}));
    button('delegate')!.click();
    fixture.detectChanges();

    const search = element.querySelector('app-user-picker input') as HTMLInputElement;
    search.value = 'dave';
    search.dispatchEvent(new Event('input'));
    button('user-search')!.click();
    controller.expectOne('/api/identity/users?q=dave&size=10').flush({ items: [{ id: 'd', username: 'dave', displayName: 'Dave Admin' }] });
    await fixture.whenStable();
    button('user-option')!.click();

    expect(controller.expectOne({ method: 'POST', url: '/api/workflow/tasks/t1/delegate' }).request.body).toEqual({ toUserId: 'd' });
  });

  it('is read-only for tasks assigned to someone else', () => {
    const { element, button } = setup(task({ assigneeId: 'bob' }));
    expect(button('outcome-APPROVE')).toBeNull();
    expect(button('claim')).toBeNull();
    expect(element.textContent).toContain('Assigned to');
  });

  it('explains why nobody could be assigned', () => {
    const { element } = setup(task({ assigneeId: null, unassignedReason: 'The initiator has no manager' }));
    expect(element.textContent).toContain('The initiator has no manager');
  });

  function flushTaskForm(controller: HttpTestingController) {
    controller.expectOne('/api/workflow/tasks/t1/form').flush({
      formKey: 'finance-review', formVersion: 1, access: { amount: 'READONLY' }, values: { amount: 20000 },
    });
    controller.expectOne('/api/forms/definitions/finance-review/versions/1').flush({
      key: 'finance-review', version: 1, name: 'Finance review', status: 'PUBLISHED',
      definition: { fields: [
        { key: 'amount', type: 'currency', label: 'Amount' },
        { key: 'costCentre', type: 'text', label: 'Cost centre', required: true },
      ] },
    });
  }

  it('renders the task form and submits its editable values', async () => {
    const { fixture, element, controller, button } = setup(task({ formKey: 'finance-review', formVersion: 1 }));
    flushTaskForm(controller);
    await fixture.whenStable();
    expect((element.querySelector('#f-amount') as HTMLInputElement).disabled).toBe(true);

    button('outcome-APPROVE')!.click();
    await fixture.whenStable();
    expect(element.textContent).toContain('Cost centre is required');
    controller.verify();

    const centre = element.querySelector('#f-costCentre') as HTMLInputElement;
    centre.value = 'FN-120';
    centre.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    button('outcome-APPROVE')!.click();

    expect(controller.expectOne('/api/workflow/tasks/t1/complete').request.body)
      .toEqual({ outcome: 'APPROVE', data: { costCentre: 'FN-120' } });
  });

  it('keeps the panel open with field errors when the server rejects the form', async () => {
    const { fixture, element, controller, button, changes } = setup(task({ formKey: 'finance-review', formVersion: 1 }));
    flushTaskForm(controller);
    await fixture.whenStable();
    const centre = element.querySelector('#f-costCentre') as HTMLInputElement;
    centre.value = 'x';
    centre.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    button('outcome-APPROVE')!.click();
    controller.expectOne('/api/workflow/tasks/t1/complete').flush(
      { code: 'FORM_VALIDATION_FAILED', errors: [{ field: 'costCentre', code: 'PATTERN_MISMATCH', message: 'Not a cost centre' }] },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();

    expect(changes()).toBe(0);
    expect(element.querySelector('#e-costCentre')?.textContent).toContain('Not a cost centre');
    expect(button('outcome-APPROVE')!.disabled).toBe(false);
  });

  it("shows the request's attachments with the task", () => {
    const { fixture } = setup(task({ instanceId: 'i7' }));
    const attachments = fixture.debugElement.query(By.directive(AttachmentsStub)).componentInstance as AttachmentsStub;
    expect(attachments.instanceId()).toBe('i7');
  });

  it('makes one outcome the main button, and marks the ones that go against the request', async () => {
    const { fixture, controller, button } = setup(task({ outcomes: ['APPROVE', 'SEND_BACK', 'REJECT'] }));
    await fixture.whenStable();
    controller.match(() => true).forEach((req) => req.flush(req.request.url.includes('/documents') ? [] : {}));
    await fixture.whenStable();

    expect(button('outcome-APPROVE')!.getAttribute('data-tone')).toBe('primary');
    expect(button('outcome-SEND_BACK')!.getAttribute('data-tone')).toBe('secondary');
    expect(button('outcome-REJECT')!.getAttribute('data-tone')).toBe('danger');
  });

  it('still has a main button when the first outcome goes against the request', async () => {
    const { fixture, controller, button } = setup(task({ outcomes: ['REJECT', 'APPROVE', 'SEND_BACK'] }));
    await fixture.whenStable();
    controller.match(() => true).forEach((req) => req.flush(req.request.url.includes('/documents') ? [] : {}));
    await fixture.whenStable();

    expect(button('outcome-REJECT')!.getAttribute('data-tone')).toBe('danger');
    expect(button('outcome-APPROVE')!.getAttribute('data-tone')).toBe('primary');
    expect(button('outcome-SEND_BACK')!.getAttribute('data-tone')).toBe('secondary');
  });
});
