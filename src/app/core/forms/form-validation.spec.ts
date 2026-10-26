import vectors from '../../../../../shared/forms/validation-vectors.json';
import { Access, FormDefinition } from './form.models';
import { conditionHolds, validateSubmission } from './form-validation';

type VectorCase = {
  name: string;
  data: Record<string, unknown>;
  errors: string[];
  access?: Record<string, Access>;
  baseline?: Record<string, unknown>;
  clean?: Record<string, unknown>;
};

describe('form validation (shared vectors)', () => {
  const form = vectors.definition as unknown as FormDefinition;

  for (const c of vectors.cases as unknown as VectorCase[]) {
    it(c.name, () => {
      const result = validateSubmission(form, c.data, c.access ?? {}, c.baseline ?? {});

      expect(result.errors.map((e) => `${e.field}:${e.code}`).sort()).toEqual([...c.errors].sort());
      if (c.clean) {
        expect(result.data).toEqual(c.clean);
      }
    });
  }
});

describe('validateSubmission messages', () => {
  const form: FormDefinition = {
    fields: [
      { key: 'amount', type: 'currency', label: 'Amount', required: true, min: 1 },
      { key: 'category', type: 'select', label: 'Category', options: [{ value: 'a', label: 'A' }] },
    ],
  };

  it('names the field in plain words, like the server', () => {
    const { errors } = validateSubmission(form, { amount: 0, category: 'z' });

    expect(errors.map((e) => e.message)).toEqual(['Amount must be at least 1', 'Choose one of the offered options for Category']);
  });
});

describe('conditionHolds', () => {
  it('treats a half-written rule as not holding instead of failing', () => {
    expect(conditionHolds({ var: 'form.a', op: 'gt', value: null }, { form: { a: 5 } })).toBe(false);
    expect(conditionHolds({ var: 'form.a', op: 'gt', value: 1 }, { form: { a: 5 } })).toBe(true);
  });
});

describe('half-written patterns', () => {
  it('do not break validation while a designer is still typing them', () => {
    const form: FormDefinition = { fields: [{ key: 'code', type: 'text', label: 'Code', pattern: '[A-Z', maxLength: 10 }] };

    expect(() => validateSubmission(form, { code: 'AB' })).not.toThrow();
  });
});
