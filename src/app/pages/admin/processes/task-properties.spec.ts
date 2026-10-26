import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ProcessNode } from '../../../core/workflow/process.models';
import { TaskProperties } from './task-properties';

describe('TaskProperties', () => {
  const task: ProcessNode = {
    id: 'task1', type: 'USER_TASK', name: 'Approval', assignment: { type: 'INITIATOR_MANAGER', levels: 1 },
    outcomes: ['APPROVE', 'REJECT'], approvalMode: 'SINGLE',
  };

  function setup(node: ProcessNode = task, userVariables: string[] = []) {
    TestBed.configureTestingModule({ imports: [TaskProperties], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(TaskProperties);
    fixture.componentRef.setInput('node', node);
    fixture.componentRef.setInput('userVariables', userVariables);
    const patches: Partial<ProcessNode>[] = [];
    const events: string[] = [];
    const page = fixture.componentInstance;
    page.patch.subscribe((p) => patches.push(p));
    page.outcomeAdd.subscribe((n) => events.push(`add ${n}`));
    page.outcomeRename.subscribe((r) => events.push(`rename ${r.from} ${r.to}`));
    page.outcomeRemove.subscribe((n) => events.push(`remove ${n}`));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const set = (id: string, value: string, event = 'change') => {
      el<HTMLInputElement>(id).value = value;
      el<HTMLInputElement>(id).dispatchEvent(new Event(event));
    };
    const controller = TestBed.inject(HttpTestingController);
    return { fixture, el, set, patches, events, controller };
  }

  it('switches the assignment type, starting each with an empty choice', () => {
    const s = setup(task, ['form.approver']);
    s.set('assign-type', 'ROLE');
    expect(s.patches.at(-1)).toEqual({ assignment: { type: 'ROLE', role: '' } });
    s.set('assign-type', 'VARIABLE_USER');
    expect(s.patches.at(-1)).toEqual({ assignment: { type: 'VARIABLE_USER', variable: 'form.approver' } });
  });

  it('picks a group from the directory', async () => {
    const s = setup({ ...task, assignment: { type: 'GROUP', groupId: '' } });
    s.controller.expectOne('/api/identity/groups').flush([{ id: 'g-fin', name: 'Finance', path: '/Finance' }]);
    await s.fixture.whenStable();
    s.set('assign-group', 'g-fin');
    expect(s.patches.at(-1)).toEqual({ assignment: { type: 'GROUP', groupId: 'g-fin' } });
  });

  it('allows several approvers only for a group or role, and asks a percentage only for PERCENT', async () => {
    const single = setup();
    expect(single.el<HTMLSelectElement>('mode').disabled).toBe(true);
    TestBed.resetTestingModule();

    const s = setup({ ...task, assignment: { type: 'ROLE', role: 'wms-admin' } });
    s.set('mode', 'PERCENT');
    expect(s.patches.at(-1)).toEqual({ approvalMode: 'PERCENT', percent: 50 });
    s.set('mode', 'ALL');
    expect(s.patches.at(-1)).toEqual({ approvalMode: 'ALL', percent: undefined });
  });

  it('falls back to one approver when the assignment becomes a single person', () => {
    const s = setup({ ...task, assignment: { type: 'ROLE', role: 'wms-admin' }, approvalMode: 'PERCENT', percent: 60 });
    s.set('assign-type', 'INITIATOR_MANAGER');
    expect(s.patches.at(-1)).toEqual({ assignment: { type: 'INITIATOR_MANAGER', levels: 1 }, approvalMode: 'SINGLE', percent: undefined });
  });

  it('adds, renames and removes outcomes through the page', () => {
    const s = setup();
    s.set('outcome-new', 'send back', 'input');
    s.el<HTMLButtonElement>('outcome-add').click();
    s.set('outcome-1', 'decline');
    s.el<HTMLButtonElement>('outcome-remove-0').click();
    expect(s.events).toEqual(['add send back', 'rename REJECT decline', 'remove APPROVE']);
  });

  it('sets a deadline, a reminder and what happens when it is missed', () => {
    const s = setup();
    s.el<HTMLInputElement>('sla-on').click();
    expect(s.patches.at(-1)).toEqual({ sla: { dueIn: 'P2D', onBreach: 'NOTIFY' } });
    TestBed.resetTestingModule();

    const withSla = setup({ ...task, sla: { dueIn: 'P2D', onBreach: 'NOTIFY' } });
    withSla.el<HTMLInputElement>('sla-business').click();
    expect(withSla.patches.at(-1)).toEqual({ sla: { dueIn: 'P2D', onBreach: 'NOTIFY', businessDays: true } });
    withSla.set('sla-reminder', '75');
    expect(withSla.patches.at(-1)).toEqual({ sla: { dueIn: 'P2D', onBreach: 'NOTIFY', reminderPercent: 75 } });
    withSla.set('sla-breach', 'AUTO_COMPLETE');
    expect(withSla.patches.at(-1)).toEqual({ sla: { dueIn: 'P2D', onBreach: 'AUTO_COMPLETE', autoOutcome: 'APPROVE' } });
  });

  it('drops business days when the deadline is no longer whole days', () => {
    const s = setup({ ...task, sla: { dueIn: 'P2D', businessDays: true, onBreach: 'NOTIFY' } });
    s.set('sla-due-unit', 'hours');
    expect(s.patches.at(-1)).toEqual({ sla: { dueIn: 'PT2H', onBreach: 'NOTIFY' } });
  });

  it('puts back what the model holds when an edit is not applied', async () => {
    const s = setup();
    s.set('outcome-0', 'reject');
    await s.fixture.whenStable();
    // The page refuses the duplicate; the model still says APPROVE, and so must the field.
    expect(s.el<HTMLInputElement>('outcome-0').value).toBe('APPROVE');
    s.set('assign-levels', '1.5');
    await s.fixture.whenStable();
    expect(s.el<HTMLInputElement>('assign-levels').value).toBe('1');
    expect(s.patches).toEqual([]);
  });

  it('forgets an unfinished new outcome when another task is selected', async () => {
    const s = setup();
    s.set('outcome-new', 'escalate', 'input');
    await s.fixture.whenStable();
    s.fixture.componentRef.setInput('node', { ...task, id: 'task2' });
    await s.fixture.whenStable();
    expect(s.el<HTMLInputElement>('outcome-new').value).toBe('');
  });
});
