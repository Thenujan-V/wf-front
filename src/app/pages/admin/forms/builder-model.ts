import { FieldType, FormDefinition, FormField, FormOption, FormSection, holdsValue } from '../../../core/forms/form.models';
import { MAX_COLUMNS, columnsOf } from '../../../core/forms/form-layout';

/** The palette, in the order designers see it. */
export const FIELD_TYPES: { type: FieldType; label: string }[] = [
  { type: 'text', label: 'Short text' },
  { type: 'textarea', label: 'Long text' },
  { type: 'number', label: 'Number' },
  { type: 'currency', label: 'Money' },
  { type: 'date', label: 'Date' },
  { type: 'datetime', label: 'Date and time' },
  { type: 'select', label: 'Drop-down' },
  { type: 'radio', label: 'Choice buttons' },
  { type: 'checkbox', label: 'Tick box' },
  { type: 'user', label: 'Person' },
  { type: 'file', label: 'Files' },
  { type: 'table', label: 'Table' },
  { type: 'heading', label: 'Heading' },
  { type: 'display', label: 'Text for the reader' },
];

export const FIELD_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
export const FORM_KEY = /^[a-z0-9][a-z0-9-]{1,99}$/;

const KEY_BASE: Record<FieldType, string> = {
  text: 'text', textarea: 'notes', number: 'number', currency: 'amount', date: 'date', datetime: 'when',
  select: 'choice', radio: 'option', checkbox: 'check', user: 'person', file: 'files', table: 'items', heading: 'heading',
  display: 'info',
};

export function typeLabel(type: FieldType): string {
  return FIELD_TYPES.find((t) => t.type === type)?.label ?? type;
}

export function emptyDefinition(): FormDefinition {
  return { sections: [{ id: 'main', title: 'Details', columns: 2 }], fields: [] };
}

export function newField(type: FieldType, taken: Set<string>): FormField {
  const field: FormField = { key: unique(KEY_BASE[type], taken), type, label: typeLabel(type) };
  if (type === 'select' || type === 'radio') {
    field.options = [{ value: 'option1', label: 'Option 1' }, { value: 'option2', label: 'Option 2' }];
  }
  if (type === 'table') {
    field.columns = [{ key: 'description', type: 'text', label: 'Description' }];
  }
  if (type === 'display') {
    field.label = 'Explain something to the person filling in the form.';
  }
  return field;
}

export function addField(definition: FormDefinition, type: FieldType, sectionId?: string): { definition: FormDefinition; key: string } {
  const field = newField(type, keysOf(definition));
  if (sectionId) {
    field.section = sectionId;
  }
  return { definition: normalizeOrder({ ...definition, fields: insertAtSectionEnd(definition.fields, field) }), key: field.key };
}

/** Adds a new field at a place in a section; '' is the group of fields in no section. */
export function addFieldAt(definition: FormDefinition, type: FieldType, sectionId: string, index: number): {
  definition: FormDefinition;
  key: string;
} {
  const field = inGroup(newField(type, keysOf(definition)), sectionId);
  return { definition: normalizeOrder({ ...definition, fields: insertInGroup(definition, definition.fields, field, index) }), key: field.key };
}

/** Applies a change to one field; a new key is carried into every rule that used the old one. */
export function updateField(definition: FormDefinition, key: string, patch: Partial<FormField>): FormDefinition {
  let current = definition;
  let target = key;
  if (patch.key && patch.key !== key) {
    current = renameField(current, key, patch.key);
    target = patch.key;
  }
  return { ...current, fields: current.fields.map((f) => (f.key === target ? { ...f, ...patch, key: target } : f)) };
}

/** Removes a field and any rule that used it (a rule pointing at nothing would break the form). */
export function removeField(definition: FormDefinition, key: string): { definition: FormDefinition; clearedRulesOf: string[] } {
  const clearedRulesOf: string[] = [];
  const fields = definition.fields.filter((f) => f.key !== key).map((f) => {
    const visible = ruleUses(f.visibleWhen, key);
    const required = ruleUses(f.requiredWhen, key);
    if (!visible && !required) {
      return f;
    }
    clearedRulesOf.push(f.label);
    return { ...f, visibleWhen: visible ? undefined : f.visibleWhen, requiredWhen: required ? undefined : f.requiredWhen };
  });
  return { definition: { ...definition, fields }, clearedRulesOf };
}

/** Swaps a field with its neighbour in the same section; at either end nothing changes. */
export function moveField(definition: FormDefinition, key: string, direction: -1 | 1): FormDefinition {
  const fields = [...definition.fields];
  const i = fields.findIndex((f) => f.key === key);
  if (i < 0) {
    return definition;
  }
  const section = fields[i].section ?? '';
  let j = i + direction;
  while (j >= 0 && j < fields.length && (fields[j].section ?? '') !== section) {
    j += direction;
  }
  if (j < 0 || j >= fields.length) {
    return definition;
  }
  [fields[i], fields[j]] = [fields[j], fields[i]];
  return { ...definition, fields };
}

/**
 * Moves a field to a place in a section ('' is the group of fields in no section). The index counts that group's
 * fields with the moved one taken out. A width the new section cannot hold is shortened.
 */
export function placeField(definition: FormDefinition, key: string, sectionId: string, index: number): FormDefinition {
  const field = definition.fields.find((f) => f.key === key);
  if (!field || (sectionId !== '' && !(definition.sections ?? []).some((s) => s.id === sectionId))) {
    return definition;
  }
  const moved = fitted(definition, inGroup(field, sectionId));
  const others = definition.fields.filter((f) => f.key !== key);
  return normalizeOrder({ ...definition, fields: insertInGroup(definition, others, moved, index) });
}

/** Sets how many of its section's columns a field takes; where there is one column a field has no width. */
export function setSpan(definition: FormDefinition, key: string, span: number): FormDefinition {
  const field = definition.fields.find((f) => f.key === key);
  if (!field || !Number.isFinite(span)) {
    return definition;
  }
  const section = (definition.sections ?? []).find((s) => s.id === field.section);
  const columns = section ? columnsOf(section.columns) : 1;
  const next: FormField = { ...field };
  if (columns < 2) {
    delete next.span;
  } else {
    next.span = Math.min(Math.max(Math.round(span), 1), columns);
  }
  return { ...definition, fields: definition.fields.map((f) => (f.key === key ? next : f)) };
}

/** Moves a field to the end of another section (or out of all sections). */
export function setSection(definition: FormDefinition, key: string, sectionId?: string): FormDefinition {
  const field = definition.fields.find((f) => f.key === key);
  if (!field) {
    return definition;
  }
  const moved = fitted(definition, inGroup(field, sectionId ?? ''));
  return normalizeOrder({ ...definition, fields: insertAtSectionEnd(definition.fields.filter((f) => f.key !== key), moved) });
}

export function addSection(definition: FormDefinition): { definition: FormDefinition; id: string } {
  const sections = definition.sections ?? [];
  const id = unique('section', new Set(sections.map((s) => s.id)));
  return { definition: { ...definition, sections: [...sections, { id, title: 'New section', columns: 1 }] }, id };
}

/** Changes a section; fewer columns shorten the fields that no longer fit. */
export function updateSection(definition: FormDefinition, id: string, patch: Partial<FormSection>): FormDefinition {
  const change = patch.columns === undefined
    ? patch
    : { ...patch, columns: Math.min(Math.max(Math.round(patch.columns) || 1, 1), MAX_COLUMNS) };
  const next = { ...definition, sections: (definition.sections ?? []).map((s) => (s.id === id ? { ...s, ...change, id } : s)) };
  return change.columns === undefined ? next : { ...next, fields: next.fields.map((f) => (f.section === id ? fitted(next, f) : f)) };
}

/** Removes a section; its fields stay in the form without a section. */
export function removeSection(definition: FormDefinition, id: string): FormDefinition {
  return normalizeOrder({
    ...definition,
    sections: (definition.sections ?? []).filter((s) => s.id !== id),
    fields: definition.fields.map((f) => {
      if (f.section !== id) {
        return f;
      }
      const loose = { ...f };
      delete loose.section;
      return loose;
    }),
  });
}

/** Input fields above this one: the only ones its rules may use (form-service checks the same). */
export function earlierInputs(definition: FormDefinition, key: string): FormField[] {
  const index = definition.fields.findIndex((f) => f.key === key);
  return definition.fields.slice(0, Math.max(index, 0)).filter(holdsValue);
}

/** Whether a stored rule refers to form.<key> anywhere. */
export function ruleUses(condition: unknown, key: string): boolean {
  if (Array.isArray(condition)) {
    return condition.some((c) => ruleUses(c, key));
  }
  if (condition && typeof condition === 'object') {
    return Object.entries(condition).some(([k, v]) => (k === 'var' ? v === `form.${key}` : ruleUses(v, key)));
  }
  return false;
}

/** The field a problem path points at: "lines[2].cost" and "lines.cost" both mean the "lines" table. */
export function fieldKeyOf(path: string | null): string | null {
  return path ? path.split(/[.[]/)[0] : null;
}

function renameField(definition: FormDefinition, from: string, to: string): FormDefinition {
  return {
    ...definition,
    fields: definition.fields.map((f) => ({
      ...f,
      key: f.key === from ? to : f.key,
      visibleWhen: rewrite(f.visibleWhen, `form.${from}`, `form.${to}`),
      requiredWhen: rewrite(f.requiredWhen, `form.${from}`, `form.${to}`),
    })),
  };
}

function rewrite(node: unknown, from: string, to: string): unknown {
  if (Array.isArray(node)) {
    return node.map((n) => rewrite(n, from, to));
  }
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, k === 'var' && v === from ? to : rewrite(v, from, to)]));
  }
  return node;
}

function insertAtSectionEnd(fields: FormField[], field: FormField): FormField[] {
  const target = field.section ?? '';
  let last = -1;
  fields.forEach((f, i) => {
    if ((f.section ?? '') === target) {
      last = i;
    }
  });
  const next = [...fields];
  next.splice(last === -1 ? next.length : last + 1, 0, field);
  return next;
}

/** A copy of the field in that section; '' takes it out of every section. */
function inGroup(field: FormField, sectionId: string): FormField {
  const moved: FormField = { ...field };
  if (sectionId) {
    moved.section = sectionId;
  } else {
    delete moved.section;
  }
  return moved;
}

/** Where the canvas shows a field: its section, or '' when it has none the form knows. */
function groupOf(definition: FormDefinition, field: FormField): string {
  return field.section && (definition.sections ?? []).some((s) => s.id === field.section) ? field.section : '';
}

/** Puts a field at a place among the fields the canvas shows with it; past the end means last. */
function insertInGroup(definition: FormDefinition, fields: FormField[], field: FormField, index: number): FormField[] {
  const group = groupOf(definition, field);
  const peers = fields.filter((f) => groupOf(definition, f) === group);
  const next = [...fields];
  if (index >= peers.length) {
    const last = peers.at(-1);
    next.splice(last ? fields.indexOf(last) + 1 : fields.length, 0, field);
  } else {
    next.splice(fields.indexOf(peers[Math.max(index, 0)]), 0, field);
  }
  return next;
}

/** The field, with a width larger than its section shortened to the section. */
function fitted(definition: FormDefinition, field: FormField): FormField {
  const section = (definition.sections ?? []).find((s) => s.id === field.section);
  if (!section || field.span === undefined || field.span <= columnsOf(section.columns)) {
    return field;
  }
  return { ...field, span: columnsOf(section.columns) };
}

function keysOf(definition: FormDefinition): Set<string> {
  return new Set(definition.fields.map((f) => f.key));
}

function unique(base: string, taken: Set<string>): string {
  let n = 1;
  while (taken.has(`${base}${n}`)) {
    n++;
  }
  return `${base}${n}`;
}

// ---- rule integrity

/** A rule form-service would refuse, or one that can never be true. */
export interface RuleProblem {
  key: string;
  message: string;
}

interface Compare {
  var: string;
  op: string;
  value?: unknown;
}

/**
 * Rules that use a field not above them (form-service refuses those) or compare a choice field with a value that is
 * no longer one of its options (those rules would never be true).
 */
export function ruleProblems(definition: FormDefinition): RuleProblem[] {
  const problems: RuleProblem[] = [];
  const above = new Map<string, FormField>();
  for (const field of definition.fields) {
    for (const compare of [...comparesOf(field.visibleWhen), ...comparesOf(field.requiredWhen)]) {
      const key = compare.var.startsWith('form.') ? compare.var.slice('form.'.length) : null;
      const used = key ? above.get(key) : undefined;
      if (!used) {
        problems.push({ key: field.key, message: `${field.label}: its rule uses "${key ?? compare.var}", which is not a field above it` });
        continue;
      }
      const options = used.options?.map((o) => o.value) ?? [];
      const missing = valuesIn(compare.value).filter((v) => !options.includes(v));
      if (options.length && missing.length) {
        problems.push({ key: field.key, message: `${field.label}: its rule compares ${used.label} with "${missing.join(', ')}", which is not one of its options` });
      }
    }
    if (holdsValue(field)) {
      above.set(field.key, field);
    }
  }
  return problems;
}

/** Problems an edit would introduce (existing ones are not the edit's fault). */
export function newRuleProblems(before: FormDefinition, after: FormDefinition): string[] {
  const known = new Set(ruleProblems(before).map((p) => p.message));
  return ruleProblems(after).map((p) => p.message).filter((m) => !known.has(m));
}

/**
 * Changes a choice field's options. A renamed value (same position) is carried into the rules that compare with it;
 * rules comparing with a removed value are removed, and the fields that lost a rule are reported.
 */
export function updateOptions(definition: FormDefinition, key: string, options: FormOption[] | undefined): {
  definition: FormDefinition;
  clearedRulesOf: string[];
} {
  const old = definition.fields.find((f) => f.key === key)?.options ?? [];
  const next = options ?? [];
  let current = updateField(definition, key, { options });
  if (next.length === old.length) {
    old.forEach((option, i) => {
      if (option.value !== next[i].value) {
        current = mapRules(current, key, (c) => ({ ...c, value: replaceValue(c.value, option.value, next[i].value) }));
      }
    });
    return { definition: current, clearedRulesOf: [] };
  }
  const kept = new Set(next.map((o) => o.value));
  const gone = old.map((o) => o.value).filter((v) => !kept.has(v));
  const clearedRulesOf: string[] = [];
  const fields = current.fields.map((f) => {
    const visible = comparesWith(f.visibleWhen, key, gone);
    const required = comparesWith(f.requiredWhen, key, gone);
    if (!visible && !required) {
      return f;
    }
    clearedRulesOf.push(f.label);
    return { ...f, visibleWhen: visible ? undefined : f.visibleWhen, requiredWhen: required ? undefined : f.requiredWhen };
  });
  return { definition: { ...current, fields }, clearedRulesOf };
}

function comparesOf(rule: unknown): Compare[] {
  if (Array.isArray(rule)) {
    return rule.flatMap(comparesOf);
  }
  if (rule && typeof rule === 'object') {
    const node = rule as Record<string, unknown>;
    if (typeof node['var'] === 'string') {
      return [node as unknown as Compare];
    }
    return Object.values(node).flatMap(comparesOf);
  }
  return [];
}

function valuesIn(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return typeof value === 'string' ? [value] : [];
}

function comparesWith(rule: unknown, key: string, values: string[]): boolean {
  return comparesOf(rule).some((c) => c.var === `form.${key}` && valuesIn(c.value).some((v) => values.includes(v)));
}

function replaceValue(value: unknown, from: string, to: string): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => (v === from ? to : v));
  }
  return value === from ? to : value;
}

function mapRules(definition: FormDefinition, key: string, change: (c: Compare) => Compare): FormDefinition {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (typeof record['var'] === 'string') {
        return record['var'] === `form.${key}` ? change(record as unknown as Compare) : record;
      }
      return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, walk(v)]));
    }
    return node;
  };
  return {
    ...definition,
    fields: definition.fields.map((f) => ({ ...f, visibleWhen: walk(f.visibleWhen), requiredWhen: walk(f.requiredWhen) })),
  };
}

/** Keeps the field order the rules use equal to the order the canvas shows: loose fields first, then each section. */
function normalizeOrder(definition: FormDefinition): FormDefinition {
  const ids = (definition.sections ?? []).map((s) => s.id);
  const rank = (f: FormField) => (f.section ? ids.indexOf(f.section) : -1);
  const fields = definition.fields
    .map((field, index) => ({ field, index }))
    .sort((a, b) => rank(a.field) - rank(b.field) || a.index - b.index)
    .map((entry) => entry.field);
  return { ...definition, fields };
}
