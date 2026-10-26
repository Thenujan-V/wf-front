import vectors from '../../../../../shared/expression/condition-vectors.json';
import { ConditionParseError, evaluateCondition, parseCondition } from './condition';

type VectorCase = { name: string; condition: unknown; expected: boolean; variables?: Record<string, unknown> };
type InvalidCase = { name: string; condition: unknown };

describe('condition language (shared vectors)', () => {
  // The JSON's inferred types are unions of every case's shape, so widen through unknown.
  const shared = vectors.variables as unknown as Record<string, unknown>;

  for (const c of vectors.cases as unknown as VectorCase[]) {
    it(`evaluates: ${c.name}`, () => {
      expect(evaluateCondition(parseCondition(c.condition), c.variables ?? shared)).toBe(c.expected);
    });
  }

  for (const c of vectors.invalid as unknown as InvalidCase[]) {
    it(`rejects: ${c.name}`, () => {
      expect(() => parseCondition(c.condition)).toThrow(ConditionParseError);
    });
  }

  it('reports the path of the problem', () => {
    expect(() => parseCondition({ all: [{ var: 'a', op: 'bogus', value: 1 }] })).toThrow('$.all[0].op');
  });

  it('rejects excessive nesting', () => {
    let node: unknown = { var: 'a', op: 'isEmpty' };
    for (let i = 0; i < 40; i++) {
      node = { not: node };
    }
    expect(() => parseCondition(node)).toThrow('nested too deeply');
  });
});
