import { FormDefinition } from '../../../core/forms/form.models';
import {
  addField, addFieldAt, addSection, earlierInputs, emptyDefinition, fieldKeyOf, moveField, placeField, removeField, removeSection,
  ruleProblems, ruleUses, setSection, setSpan, updateField, updateOptions, updateSection, FIELD_TYPES, newField,
} from './builder-model';

const claim = (): FormDefinition => ({
  sections: [{ id: 'claim', title: 'Claim', columns: 2 }, { id: 'items', title: 'Items', columns: 1 }],
  fields: [
    { key: 'amount', type: 'currency', label: 'Amount', section: 'claim' },
    { key: 'purpose', type: 'text', label: 'Purpose', section: 'claim' },
    { key: 'justification', type: 'textarea', label: 'Justification', section: 'claim',
      visibleWhen: { var: 'form.amount', op: 'gt', value: 10000 },
      requiredWhen: { all: [{ var: 'form.amount', op: 'gt', value: 50000 }, { var: 'form.purpose', op: 'isNotEmpty' }] } },
    { key: 'lines', type: 'table', label: 'Lines', section: 'items', columns: [{ key: 'cost', type: 'currency', label: 'Cost' }] },
  ],
});

describe('builder model', () => {
  it('adds fields with unique keys at the end of their section', () => {
    const first = addField(claim(), 'text', 'claim');
    const second = addField(first.definition, 'text', 'claim');

    expect(first.key).toBe('text1');
    expect(second.key).toBe('text2');
    expect(second.definition.fields.map((f) => f.key)).toEqual(['amount', 'purpose', 'justification', 'text1', 'text2', 'lines']);
    expect(second.definition.fields[3].section).toBe('claim');
  });

  it('gives choice fields starter options and tables a starter column', () => {
    const select = addField(emptyDefinition(), 'select', 'main');
    const table = addField(select.definition, 'table', 'main');

    expect(select.definition.fields[0].options?.length).toBe(2);
    expect(table.definition.fields[1].columns?.[0]).toEqual({ key: 'description', type: 'text', label: 'Description' });
  });

  it('renaming a key keeps the rules that use it working', () => {
    const renamed = updateField(claim(), 'amount', { key: 'total', label: 'Total' });

    expect(renamed.fields[0]).toMatchObject({ key: 'total', label: 'Total' });
    expect(renamed.fields[2].visibleWhen).toEqual({ var: 'form.total', op: 'gt', value: 10000 });
    expect(JSON.stringify(renamed.fields[2].requiredWhen)).toContain('form.total');
    expect(ruleUses(renamed.fields[2].requiredWhen, 'amount')).toBe(false);
  });

  it('deleting a field removes the rules that used it and says whose', () => {
    const { definition, clearedRulesOf } = removeField(claim(), 'amount');

    expect(definition.fields.map((f) => f.key)).toEqual(['purpose', 'justification', 'lines']);
    expect(definition.fields[1].visibleWhen).toBeUndefined();
    expect(definition.fields[1].requiredWhen).toBeUndefined();
    expect(clearedRulesOf).toEqual(['Justification']);
  });

  it('moves fields within their section only', () => {
    const up = moveField(claim(), 'purpose', -1);
    expect(up.fields.map((f) => f.key)).toEqual(['purpose', 'amount', 'justification', 'lines']);
    expect(moveField(claim(), 'lines', -1)).toEqual(claim());
    expect(moveField(claim(), 'justification', 1)).toEqual(claim());
  });

  it('moves a field to another section and removes sections', () => {
    const moved = setSection(claim(), 'purpose', 'items');
    expect(moved.fields.map((f) => f.key)).toEqual(['amount', 'justification', 'lines', 'purpose']);
    expect(moved.fields[3].section).toBe('items');

    const withSection = addSection(claim());
    expect(withSection.id).toBe('section1');
    const removed = removeSection(claim(), 'items');
    expect(removed.sections?.map((s) => s.id)).toEqual(['claim']);
    // Fields that lose their section move to the top, where the canvas shows them.
    expect(removed.fields[0].key).toBe('lines');
    expect(removed.fields[0].section).toBeUndefined();
  });

  it('lists the input fields a rule may use: those above the field', () => {
    expect(earlierInputs(claim(), 'justification').map((f) => f.key)).toEqual(['amount', 'purpose']);
    expect(earlierInputs(claim(), 'amount')).toEqual([]);
  });

  it('finds the field a problem path points at', () => {
    expect(fieldKeyOf('lines[2].cost')).toBe('lines');
    expect(fieldKeyOf('lines.cost')).toBe('lines');
    expect(fieldKeyOf('amount')).toBe('amount');
    expect(fieldKeyOf(null)).toBeNull();
  });


describe('rule integrity', () => {
  const choice = (): FormDefinition => ({
    fields: [
      { key: 'type', type: 'select', label: 'Type', options: [{ value: 'option1', label: 'Travel' }, { value: 'option2', label: 'Meals' }] },
      { key: 'extra', type: 'text', label: 'Extra', visibleWhen: { var: 'form.type', op: 'eq', value: 'option1' } },
    ],
  });

  it('finds rules that use a field below them or a choice that no longer exists', () => {
    expect(ruleProblems(claim())).toEqual([]);
    expect(ruleProblems(moveField(claim(), 'purpose', 1)).map((p) => p.key)).toEqual(['justification']);
    const renamedOption = { ...choice(), fields: [{ ...choice().fields[0], options: [{ value: 'travel', label: 'Travel' }] }, choice().fields[1]] };
    expect(ruleProblems(renamedOption)).toEqual([{ key: 'extra', message: expect.stringContaining('option1') }]);
  });

  it('renaming an option value carries it into the rules that use it', () => {
    const renamed = updateOptions(choice(), 'type', [{ value: 'travel', label: 'Travel' }, { value: 'option2', label: 'Meals' }]);

    expect(renamed.definition.fields[1].visibleWhen).toEqual({ var: 'form.type', op: 'eq', value: 'travel' });
    expect(renamed.clearedRulesOf).toEqual([]);
  });

  it('removing an option removes the rules that used it and says whose', () => {
    const removed = updateOptions(choice(), 'type', [{ value: 'option2', label: 'Meals' }]);

    expect(removed.definition.fields[1].visibleWhen).toBeUndefined();
    expect(removed.clearedRulesOf).toEqual(['Extra']);
  });

  it('a field taken out of every section goes where the canvas shows it: first', () => {
    expect(setSection(claim(), 'lines', undefined).fields[0].key).toBe('lines');
  });
});

  it('offers a file field', () => {
    expect(FIELD_TYPES.map((t) => t.type)).toContain('file');
    expect(newField('file', new Set())).toEqual({ key: 'files1', type: 'file', label: 'Files' });
  });
});

describe('placing fields and widths', () => {
  const keys = (definition: FormDefinition) => definition.fields.map((f) => f.key);

  it('adds a new field at a place in a section', () => {
    const { definition, key } = addFieldAt(claim(), 'date', 'claim', 1);

    expect(key).toBe('date1');
    expect(keys(definition)).toEqual(['amount', 'date1', 'purpose', 'justification', 'lines']);
    expect(definition.fields[1].section).toBe('claim');
  });

  it('adds at the end of a section, into an empty section, and into no section', () => {
    expect(keys(addFieldAt(claim(), 'date', 'claim', 99).definition))
      .toEqual(['amount', 'purpose', 'justification', 'date1', 'lines']);

    const emptyFirst: FormDefinition = {
      sections: [{ id: 'top', title: 'Top', columns: 2 }, { id: 'rest', title: 'Rest', columns: 1 }],
      fields: [{ key: 'a', type: 'text', label: 'A', section: 'rest' }],
    };
    // The order the rules use follows the canvas: a field in the first section comes first.
    expect(keys(addFieldAt(emptyFirst, 'date', 'top', 0).definition)).toEqual(['date1', 'a']);

    const loose = addFieldAt(claim(), 'date', '', 0).definition;
    expect(keys(loose)).toEqual(['date1', 'amount', 'purpose', 'justification', 'lines']);
    expect(loose.fields[0].section).toBeUndefined();
  });

  it('moves a field to a place in its own section', () => {
    expect(keys(placeField(claim(), 'amount', 'claim', 1))).toEqual(['purpose', 'amount', 'justification', 'lines']);
    expect(keys(placeField(claim(), 'justification', 'claim', 0))).toEqual(['justification', 'amount', 'purpose', 'lines']);
    expect(keys(placeField(claim(), 'amount', 'claim', 99))).toEqual(['purpose', 'justification', 'amount', 'lines']);
  });

  it('moves a field to a place in another section, shortening a width that no longer fits', () => {
    const wide = setSpan(claim(), 'purpose', 2);

    const moved = placeField(wide, 'purpose', 'items', 0);

    expect(keys(moved)).toEqual(['amount', 'justification', 'purpose', 'lines']);
    expect(moved.fields[2]).toMatchObject({ key: 'purpose', section: 'items', span: 1 });
  });

  it('leaves the form alone when the field or the section is unknown', () => {
    expect(placeField(claim(), 'nobody', 'claim', 0)).toEqual(claim());
    expect(placeField(claim(), 'amount', 'nowhere', 0)).toEqual(claim());
  });

  it('treats a field whose section is gone as being in no section', () => {
    const orphan: FormDefinition = {
      sections: [{ id: 'claim', title: 'Claim', columns: 2 }],
      fields: [
        { key: 'lost', type: 'text', label: 'Lost', section: 'gone' },
        { key: 'free', type: 'text', label: 'Free' },
        { key: 'amount', type: 'currency', label: 'Amount', section: 'claim' },
      ],
    };

    // The canvas shows "lost" and "free" together; a drop between them must land between them.
    const dropped = placeField(orphan, 'amount', '', 1);
    expect(keys(dropped)).toEqual(['lost', 'amount', 'free']);
    expect(dropped.fields[1].section).toBeUndefined();

    const out = placeField(orphan, 'lost', 'claim', 1);
    expect(keys(out)).toEqual(['free', 'amount', 'lost']);
    expect(out.fields[2].section).toBe('claim');
  });

  it('sets a width within the section, and none where there is only one column', () => {
    expect(setSpan(claim(), 'amount', 2).fields[0].span).toBe(2);
    expect(setSpan(claim(), 'amount', 9).fields[0].span).toBe(2);
    expect(setSpan(claim(), 'amount', 0).fields[0].span).toBe(1);
    expect(setSpan(claim(), 'lines', 3).fields[3].span).toBeUndefined();
    expect(setSpan(claim(), 'amount', Number.NaN)).toEqual(claim());
    expect(setSpan(claim(), 'nobody', 2)).toEqual(claim());
  });

  it('lowering a section\'s columns shortens the fields that no longer fit; raising them changes no width', () => {
    const four = updateSection(claim(), 'claim', { columns: 4 });
    const wide = setSpan(setSpan(four, 'amount', 4), 'purpose', 2);

    const three = updateSection(wide, 'claim', { columns: 3 });

    expect(three.fields.slice(0, 3).map((f) => f.span)).toEqual([3, 2, undefined]);
    expect(updateSection(three, 'claim', { columns: 4 }).fields[0].span).toBe(3);
    // Renaming a section touches no width.
    expect(updateSection(wide, 'claim', { title: 'Renamed' }).fields[0].span).toBe(4);
  });

  it('keeps a section to 1 to 4 columns', () => {
    expect(updateSection(claim(), 'claim', { columns: 9 }).sections?.[0].columns).toBe(4);
    expect(updateSection(claim(), 'claim', { columns: 0 }).sections?.[0].columns).toBe(1);
    expect(updateSection(claim(), 'claim', { columns: Number.NaN }).sections?.[0].columns).toBe(1);
  });

  it('a field sent to another section from the properties panel is shortened too', () => {
    const moved = setSection(setSpan(claim(), 'purpose', 2), 'purpose', 'items');

    expect(moved.fields[3]).toMatchObject({ key: 'purpose', section: 'items', span: 1 });
  });
});

describe('adding from the palette button', () => {
  it('a field clicked into an empty section drawn above the others comes first, as the canvas shows it', () => {
    const emptyFirst: FormDefinition = {
      sections: [{ id: 'top', title: 'Top', columns: 2 }, { id: 'rest', title: 'Rest', columns: 1 }],
      fields: [{ key: 'a', type: 'text', label: 'A', section: 'rest' }],
    };

    const added = addField(emptyFirst, 'date', 'top').definition;

    // The order the rules use must be the order drawn: otherwise a rule could be given a field shown below it.
    expect(added.fields.map((f) => f.key)).toEqual(['date1', 'a']);
  });
});
