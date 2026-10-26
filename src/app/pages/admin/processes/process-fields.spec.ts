import { PublishedForm } from '../../../core/forms/form.models';
import { ProcessGraph } from '../../../core/workflow/process.models';
import { conditionFields, inputFields, processConditionVariables, variablesOfType } from './process-fields';

const claim: PublishedForm = {
  key: 'expense-claim', version: 1, name: 'Expense claim', status: 'PUBLISHED',
  definition: { fields: [
    { key: 'intro', type: 'heading', label: 'Your claim' },
    { key: 'amount', type: 'currency', label: 'Amount' },
    { key: 'approver', type: 'user', label: 'Approver' },
    { key: 'due', type: 'date', label: 'Due' },
  ] },
};
const review: PublishedForm = {
  key: 'finance-review', version: 2, name: 'Finance review', status: 'PUBLISHED',
  definition: { fields: [
    { key: 'amount', type: 'number', label: 'Amount (again)' },
    { key: 'paidAt', type: 'datetime', label: 'Paid at' },
  ] },
};

describe('process fields', () => {
  it('offers every input field once, the first form winning a shared key', () => {
    expect(conditionFields([claim, review]).map((f) => `${f.key}:${f.label}`))
      .toEqual(['amount:Amount', 'approver:Approver', 'due:Due', 'paidAt:Paid at']);
  });

  it('names variables of a type as form.<key>', () => {
    expect(variablesOfType([claim, review], ['user'])).toEqual(['form.approver']);
    expect(variablesOfType([claim, review], ['date', 'datetime'])).toEqual(['form.due', 'form.paidAt']);
  });

  it('lists the input fields of one form', () => {
    expect(inputFields(claim).map((f) => f.key)).toEqual(['amount', 'approver', 'due']);
  });

  it('offers task outcomes, form fields, the requester and set values to decisions, by full variable path', () => {
    const graph: ProcessGraph = { nodes: [
      { id: 'start', type: 'START', name: 'Start' },
      { id: 'task1', type: 'USER_TASK', name: 'Legal review', outcomes: ['APPROVE', 'REJECT'] },
      { id: 'task2', type: 'USER_TASK', name: 'No outcomes yet' },
      { id: 'act1', type: 'SYSTEM_ACTION', name: 'Mark', actionType: 'SET_VARIABLE', config: { variable: 'status.paid', value: true } },
    ], edges: [] };
    const variables = processConditionVariables(graph, [review]);
    expect(variables.map((v) => `${v.group}|${v.key}`)).toEqual([
      'Task results|nodes.task1.outcome',
      'Form fields|form.amount', 'Form fields|form.paidAt',
      'Requester|requester.department', 'Requester|requester.position', 'Requester|requester.username', 'Requester|requester.email',
      'Set values|status.paid',
    ]);
    expect(variables[0]).toEqual(expect.objectContaining({ label: 'Legal review outcome', type: 'select',
      options: [{ value: 'APPROVE', label: 'APPROVE' }, { value: 'REJECT', label: 'REJECT' }] }));
  });

  it('tells apart tasks that share a name', () => {
    const graph: ProcessGraph = { nodes: [
      { id: 'task1', type: 'USER_TASK', name: 'New task', outcomes: ['DONE'] },
      { id: 'task2', type: 'USER_TASK', name: 'New task', outcomes: ['DONE'] },
    ], edges: [] };
    expect(processConditionVariables(graph, []).slice(0, 2).map((v) => v.label))
      .toEqual(['New task (task1) outcome', 'New task (task2) outcome']);
  });
});
