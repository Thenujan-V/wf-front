import { FieldType, FormField, PublishedForm, holdsValue } from '../../../core/forms/form.models';

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
