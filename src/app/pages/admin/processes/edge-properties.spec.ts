import { TestBed } from '@angular/core/testing';
import { ProcessEdge, ProcessNode } from '../../../core/workflow/process.models';
import { RuleField } from '../forms/condition-rows';
import { EdgeProperties } from './edge-properties';

describe('EdgeProperties', () => {
  const task: ProcessNode = { id: 'task1', type: 'USER_TASK', name: 'Approve', outcomes: ['APPROVE', 'REJECT'] };
  const decision: ProcessNode = { id: 'decision1', type: 'EXCLUSIVE_GATEWAY', name: 'Large?' };
  const end: ProcessNode = { id: 'end', type: 'END', name: 'Done' };
  const fields: RuleField[] = [
    { key: 'form.amount', type: 'currency', label: 'Amount', group: 'Form fields' },
    { key: 'nodes.task1.outcome', type: 'select', label: 'Approve outcome', group: 'Task results',
      options: [{ value: 'APPROVE', label: 'APPROVE' }, { value: 'REJECT', label: 'REJECT' }] },
  ];

  function setup(edge: ProcessEdge, source: ProcessNode) {
    const fixture = TestBed.createComponent(EdgeProperties);
    fixture.componentRef.setInput('edge', edge);
    fixture.componentRef.setInput('source', source);
    fixture.componentRef.setInput('target', end);
    fixture.componentRef.setInput('fields', fields);
    const patches: Partial<ProcessEdge>[] = [];
    let removed = 0;
    fixture.componentInstance.patch.subscribe((p) => patches.push(p));
    fixture.componentInstance.remove.subscribe(() => removed++);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    return { fixture, element, el, patches, removed: () => removed };
  }

  it('binds a task flow to one of its outcomes', () => {
    const s = setup({ id: 'f1', source: 'task1', target: 'end', outcome: 'APPROVE' }, task);
    expect(s.element.textContent).toContain('From Approve to Done');
    const select = s.el<HTMLSelectElement>('edge-outcome');
    select.value = 'REJECT';
    select.dispatchEvent(new Event('change'));
    expect(s.patches.at(-1)).toEqual({ outcome: 'REJECT' });
  });

  it('makes a decision flow the default, which has no condition', () => {
    const s = setup({ id: 'f1', source: 'decision1', target: 'end', condition: { var: 'form.amount', op: 'gt', value: 5 } }, decision);
    s.el<HTMLInputElement>('edge-default').click();
    expect(s.patches.at(-1)).toEqual({ default: true, condition: undefined });
  });

  it('builds a decision condition with the rule builder from the fields of the process forms', async () => {
    const s = setup({ id: 'f1', source: 'decision1', target: 'end' }, decision);
    s.el<HTMLButtonElement>('rule-add').click();
    expect(s.patches.at(-1)).toEqual({ condition: { var: 'form.amount', op: 'eq', value: 0 } });
  });

  it('builds a condition on a task outcome from dropdowns', () => {
    const s = setup({ id: 'f1', source: 'decision1', target: 'end' }, decision);
    s.el<HTMLButtonElement>('rule-add').click();
    s.fixture.componentRef.setInput('edge', { id: 'f1', source: 'decision1', target: 'end', condition: s.patches.at(-1)!.condition });
    s.fixture.detectChanges();
    const field = s.el<HTMLSelectElement>('rule-field');
    expect(Array.from(field.querySelectorAll('optgroup')).map((g) => g.label)).toEqual(['Form fields', 'Task results']);
    field.value = 'nodes.task1.outcome';
    field.dispatchEvent(new Event('change'));
    expect(s.patches.at(-1)).toEqual({ condition: { var: 'nodes.task1.outcome', op: 'eq', value: 'APPROVE' } });
  });

  it('offers a field typed by name, such as amount, at the top of the field list and as its own button', () => {
    const s = setup({ id: 'f1', source: 'decision1', target: 'end' }, decision);
    s.el<HTMLButtonElement>('rule-add-custom').click();
    expect(s.patches.at(-1)).toEqual({ condition: { var: 'form.amount', op: 'eq', value: 0 } });
    s.fixture.componentRef.setInput('edge', { id: 'f1', source: 'decision1', target: 'end', condition: { var: 'form.contractValue', op: 'gt', value: 5 } });
    s.fixture.detectChanges();
    expect(s.el<HTMLInputElement>('rule-custom-name').value).toBe('contractValue');
    expect(s.el<HTMLSelectElement>('rule-custom-type').value).toBe('number');

    s.fixture.componentRef.setInput('edge', { id: 'f1', source: 'decision1', target: 'end', condition: { var: 'nodes.task1.outcome', op: 'eq', value: 'APPROVE' } });
    s.fixture.detectChanges();
    expect(s.el<HTMLSelectElement>('rule-field').options[0].textContent).toContain('Type a field name');
  });

  it('edits a condition as JSON, refusing text that is not a rule', async () => {
    const s = setup({ id: 'f1', source: 'decision1', target: 'end' }, decision);
    s.el<HTMLButtonElement>('edge-json-toggle').click();
    await s.fixture.whenStable();
    const text = s.el<HTMLTextAreaElement>('edge-json');

    text.value = '{ nope';
    text.dispatchEvent(new Event('input'));
    s.el<HTMLButtonElement>('edge-json-apply').click();
    await s.fixture.whenStable();
    expect(s.el('edge-json-error').textContent).toContain('not valid JSON');

    text.value = '{ "var": "requester.department", "op": "eq", "value": "Finance" }';
    text.dispatchEvent(new Event('input'));
    s.el<HTMLButtonElement>('edge-json-apply').click();
    expect(s.patches.at(-1)).toEqual({ condition: { var: 'requester.department', op: 'eq', value: 'Finance' } });
  });

  it('has nothing to set on other flows, and deletes any flow', () => {
    const s = setup({ id: 'f1', source: 'start', target: 'end' }, { id: 'start', type: 'START', name: 'Start' });
    expect(s.el('edge-none')).not.toBeNull();
    s.el<HTMLButtonElement>('edge-delete').click();
    expect(s.removed()).toBe(1);
  });

  it('starts each flow with its own condition, not JSON left open on another flow', async () => {
    const s = setup({ id: 'f1', source: 'decision1', target: 'end', condition: { var: 'form.amount', op: 'gt', value: 5 } }, decision);
    s.el<HTMLButtonElement>('edge-json-toggle').click();
    await s.fixture.whenStable();
    expect(s.el('edge-json')).not.toBeNull();
    s.fixture.componentRef.setInput('edge', { id: 'f2', source: 'decision1', target: 'end' });
    await s.fixture.whenStable();
    expect(s.el('edge-json')).toBeNull();
    expect(s.el('rule-edge')).not.toBeNull();
  });
});
