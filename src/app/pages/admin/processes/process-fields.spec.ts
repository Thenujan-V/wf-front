import { PublishedForm } from '../../../core/forms/form.models';
import { conditionFields, inputFields, variablesOfType } from './process-fields';

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
});
