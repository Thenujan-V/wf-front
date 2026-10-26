import { FieldType, FormField, PublishedForm, holdsValue } from '../../../core/forms/form.models';
import { ProcessGraph } from '../../../core/workflow/process.models';
import { RuleField } from '../forms/condition-rows';

/** The requester's profile, as the engine stores it in requester.* when a request starts. */
const REQUESTER_FIELDS: { key: string; label: string }[] = [
  { key: 'department', label: 'Requester department' },
  { key: 'position', label: 'Requester position' },
  { key: 'username', label: 'Requester username' },
  { key: 'email', label: 'Requester email' },
];

/**
 * What a decision's condition can test, keyed by full variable path: each task's outcome (nodes.<id>.outcome),
 * the requester's profile, the fields of the forms the process uses, and values set by "Set a value" steps.
 */
export function processConditionVariables(graph: ProcessGraph, forms: PublishedForm[]): RuleField[] {
  const tasks = graph.nodes.filter((n) => n.type === 'USER_TASK' && n.outcomes?.length);
  const named = (name: string) => tasks.filter((t) => (t.name || t.id) === name).length;
  const outcomes: RuleField[] = tasks
    .map((n) => ({
      key: `nodes.${n.id}.outcome`, type: 'select', group: 'Task results',
      // Two tasks with one name are told apart by their ids.
      label: `${n.name || n.id}${named(n.name || n.id) > 1 ? ` (${n.id})` : ''} outcome`,
      options: n.outcomes!.map((o) => ({ value: o, label: o })),
    }));
  const requester: RuleField[] = REQUESTER_FIELDS.map((f) => ({ key: `requester.${f.key}`, label: f.label, type: 'text', group: 'Requester' }));
  const formFields: RuleField[] = conditionFields(forms).map((f) => ({ ...f, key: `form.${f.key}`, group: 'Form fields' }));
  const taken = new Set([...outcomes, ...requester, ...formFields].map((f) => f.key));
  const setValues: RuleField[] = [];
  for (const node of graph.nodes) {
    const variable = node.type === 'SYSTEM_ACTION' && node.actionType === 'SET_VARIABLE' ? node.config?.['variable'] : undefined;
    if (typeof variable === 'string' && variable && !taken.has(variable)) {
      taken.add(variable);
      setValues.push({ key: variable, label: variable, type: 'text', group: 'Set values' });
    }
  }
  return [...outcomes, ...formFields, ...requester, ...setValues];
}

/** What a decision's rule can test: every input field of the forms the process uses; the first form wins a shared key. */
export function conditionFields(forms: PublishedForm[]): FormField[] {
  const seen = new Set<string>();
  const fields: FormField[] = [];
  for (const form of forms) {
    for (const field of inputFields(form)) {
      if (!seen.has(field.key)) {
        seen.add(field.key);
        fields.push(field);
      }
    }
  }
  return fields;
}

/** Variable names (form.<key>) of the fields of these types, for assignment and timer settings. */
export function variablesOfType(forms: PublishedForm[], types: FieldType[]): string[] {
  return conditionFields(forms).filter((f) => types.includes(f.type)).map((f) => `form.${f.key}`);
}

export function inputFields(form: PublishedForm): FormField[] {
  return form.definition.fields.filter(holdsValue);
}
