import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ProcessNode } from '../../../core/workflow/process.models';
import { FormCatalog } from './form-catalog';
import { NodeProperties, parseValue } from './node-properties';

describe('NodeProperties', () => {
  function setup(node: ProcessNode, dateVariables: string[] = []) {
    TestBed.configureTestingModule({ imports: [NodeProperties], providers: [FormCatalog, provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(NodeProperties);
    fixture.componentRef.setInput('node', node);
    fixture.componentRef.setInput('dateVariables', dateVariables);
    const patches: Partial<ProcessNode>[] = [];
    let removed = 0;
    fixture.componentInstance.patch.subscribe((p) => patches.push(p));
    fixture.componentInstance.remove.subscribe(() => removed++);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const set = (id: string, value: string, event = 'change') => {
      el<HTMLInputElement>(id).value = value;
      el<HTMLInputElement>(id).dispatchEvent(new Event(event));
    };
    const controller = TestBed.inject(HttpTestingController);
    return { fixture, element, el, set, patches, removed: () => removed, controller };
  }

  it('renames any node and deletes it', () => {
    const s = setup({ id: 'decision1', type: 'EXCLUSIVE_GATEWAY', name: 'Decision' });
    expect(s.element.textContent).toContain('Decision');
    s.set('prop-name', 'Large amount?', 'input');
    expect(s.patches.at(-1)).toEqual({ name: 'Large amount?' });
    s.el<HTMLButtonElement>('prop-delete').click();
    expect(s.removed()).toBe(1);
  });

  it('sets the condition of each flow leaving a decision right in its panel', () => {
    const s = setup({ id: 'decision1', type: 'EXCLUSIVE_GATEWAY', name: 'Approve' });
    s.fixture.componentRef.setInput('outgoing', [
      { id: 'e1', source: 'decision1', target: 'task1', default: true },
      { id: 'e2', source: 'decision1', target: 'task2' },
    ]);
    s.fixture.componentRef.setInput('nodeNames', { task1: 'Manager review', task2: 'HR review' });
    s.fixture.componentRef.setInput('conditionVariables', [{ key: 'nodes.legal.outcome', type: 'select', label: 'Legal outcome',
      group: 'Task results', options: [{ value: 'APPROVE', label: 'APPROVE' }, { value: 'REJECT', label: 'REJECT' }] }]);
    const edgePatches: unknown[] = [];
    s.fixture.componentInstance.edgePatch.subscribe((p) => edgePatches.push(p));
    s.fixture.detectChanges();

    expect(s.el('decision-flow-e1').textContent).toContain('To Manager review');
    expect(s.el('rule-flow-e1')).toBeNull();
    expect(s.el('decision-no-default')).toBeNull();
    const rule = s.el('rule-flow-e2');
    expect(rule).not.toBeNull();
    (rule.querySelector('[data-testid="rule-add"]') as HTMLButtonElement).click();
    expect(edgePatches.at(-1)).toEqual({ id: 'e2', patch: { condition: { var: 'nodes.legal.outcome', op: 'eq', value: 'APPROVE' } } });

    s.el<HTMLInputElement>('decision-default-e2').click();
    expect(edgePatches.at(-1)).toEqual({ id: 'e2', patch: { default: true, condition: undefined } });

    const opened: string[] = [];
    s.fixture.componentInstance.edgeOpen.subscribe((id) => opened.push(id));
    s.el<HTMLButtonElement>('prop-flow-e2').click();
    expect(opened).toEqual(['e2']);
  });

  it('warns when no flow leaving a decision is the default', () => {
    const s = setup({ id: 'decision1', type: 'EXCLUSIVE_GATEWAY', name: 'Approve' });
    s.fixture.componentRef.setInput('outgoing', [{ id: 'e1', source: 'decision1', target: 'task1' }]);
    s.fixture.detectChanges();
    expect(s.el('decision-no-default')).not.toBeNull();
  });

  it('builds a decision condition on a field no form lists, such as amount', () => {
    const s = setup({ id: 'decision1', type: 'EXCLUSIVE_GATEWAY', name: 'Contract value?' });
    const edge = { id: 'e1', source: 'decision1', target: 'task1' };
    s.fixture.componentRef.setInput('outgoing', [edge]);
    const edgePatches: { id: string; patch: { condition?: unknown } }[] = [];
    s.fixture.componentInstance.edgePatch.subscribe((p) => edgePatches.push(p));
    s.fixture.detectChanges();
    const apply = () => {
      s.fixture.componentRef.setInput('outgoing', [{ ...edge, condition: edgePatches.at(-1)!.patch.condition }]);
      s.fixture.detectChanges();
    };

    s.el<HTMLButtonElement>('rule-add').click();
    expect(edgePatches.at(-1)!.patch.condition).toEqual({ var: 'form.amount', op: 'eq', value: 0 });
    apply();
    expect(s.el<HTMLInputElement>('rule-custom-name').value).toBe('amount');
    expect(s.el<HTMLSelectElement>('rule-custom-type').value).toBe('number');

    s.set('rule-custom-name', 'contractValue');
    apply();
    s.set('rule-op', 'gt');
    apply();
    s.set('rule-value', '50000', 'input');
    expect(edgePatches.at(-1)!.patch.condition).toEqual({ var: 'form.contractValue', op: 'gt', value: 50000 });
    apply();

    s.set('rule-custom-type', 'text');
    expect(edgePatches.at(-1)!.patch.condition).toEqual({ var: 'form.contractValue', op: 'eq', value: '' });
  });

  it('says whether a parallel step splits, joins or is not connected', () => {
    const s = setup({ id: 'parallel1', type: 'PARALLEL_GATEWAY', name: 'Parallel' });
    expect(s.el('prop-parallel-role').textContent).toContain('Not connected yet');
    s.fixture.componentRef.setInput('outgoing', [
      { id: 'e1', source: 'parallel1', target: 'a' },
      { id: 'e2', source: 'parallel1', target: 'b' },
    ]);
    s.fixture.detectChanges();
    expect(s.el('prop-parallel-role').textContent).toContain('Split: starts 2 flows');
  });

  it('sets an end status in capitals, or none', () => {
    const s = setup({ id: 'end1', type: 'END', name: 'Done' });
    s.set('prop-end-status', ' approved ');
    expect(s.patches.at(-1)).toEqual({ endStatus: 'APPROVED' });
    s.set('prop-end-status', '');
    expect(s.patches.at(-1)).toEqual({ endStatus: undefined });
  });

  it('switches a timer between a duration and a date from a form field', () => {
    const s = setup({ id: 'timer1', type: 'TIMER', name: 'Wait', duration: 'PT1H' }, ['form.due']);
    s.set('timer-mode', 'date');
    expect(s.patches.at(-1)).toEqual({ duration: undefined, dueDateVariable: 'form.due' });
    s.set('timer-due-amount', '3');
    expect(s.patches.at(-1)).toEqual({ duration: 'PT3H' });
  });

  it('configures each kind of system action', () => {
    const s = setup({ id: 'action1', type: 'SYSTEM_ACTION', name: 'Tell', actionType: 'SEND_EMAIL', config: { to: 'a@b.c' } });
    s.set('action-template', 'approved');
    expect(s.patches.at(-1)).toEqual({ config: { to: 'a@b.c', template: 'approved' } });
    s.set('action-type', 'SET_VARIABLE');
    expect(s.patches.at(-1)).toEqual({ actionType: 'SET_VARIABLE', config: {} });
  });

  it('reads a value as JSON when it is JSON, and as text otherwise', () => {
    expect(parseValue('12')).toBe(12);
    expect(parseValue('true')).toBe(true);
    expect(parseValue('"12"')).toBe('12');
    expect(parseValue('paid')).toBe('paid');
    expect(parseValue('')).toBe('');
  });

  it('shows task settings and a form with field access for a task, and a form without access for the start', () => {
    const task = setup({ id: 'task1', type: 'USER_TASK', name: 'Approve', outcomes: ['APPROVE'] });
    task.controller.expectOne('/api/forms/definitions').flush([]);
    expect(task.el('assign-type')).not.toBeNull();
    expect(task.el('form-key')).not.toBeNull();
    TestBed.resetTestingModule();

    const start = setup({ id: 'start', type: 'START', name: 'Submit' });
    start.controller.expectOne('/api/forms/definitions').flush([]);
    expect(start.el('assign-type')).toBeNull();
    expect(start.el('form-key')).not.toBeNull();
  });
});
