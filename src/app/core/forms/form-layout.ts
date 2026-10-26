import { FormDefinition, FormField } from './form.models';

/** The most columns a section may have (form-service's DefinitionChecks.MAX_COLUMNS). */
export const MAX_COLUMNS = 4;

export interface LaidOutSection {
  id: string;
  title: string;
  columns: number;
  fields: FormField[];
  /** False for the group of fields that are in no section the form knows. */
  real: boolean;
}

/** Types that take a section's full width unless the field says otherwise. */
const WIDE = new Set(['textarea', 'table', 'file', 'heading', 'display']);

// Written out in full: Tailwind only keeps the classes it can find in the source.
const GRID = ['grid gap-4', 'grid gap-4', 'grid gap-4 md:grid-cols-2', 'grid gap-4 md:grid-cols-3', 'grid gap-4 md:grid-cols-4'];
const SPAN = ['', 'md:col-span-1', 'md:col-span-2', 'md:col-span-3', 'md:col-span-4'];

/** Fields without a (known) section come first; then each section in order. */
export function layoutOf(definition: FormDefinition): LaidOutSection[] {
  const sections = definition.sections ?? [];
  const known = new Set(sections.map((s) => s.id));
  const loose = definition.fields.filter((f) => !f.section || !known.has(f.section));
  const laidOut: LaidOutSection[] = loose.length ? [{ id: '', title: '', columns: 1, fields: loose, real: false }] : [];
  for (const section of sections) {
    laidOut.push({
      id: section.id,
      title: section.title,
      columns: columnsOf(section.columns),
      fields: definition.fields.filter((f) => f.section === section.id),
      real: true,
    });
  }
  return laidOut;
}

/** A section's column count, kept to 1..MAX_COLUMNS whatever was stored. */
export function columnsOf(columns: unknown): number {
  return whole(columns) ? Math.min(columns, MAX_COLUMNS) : 1;
}

/** How many columns a field takes in a section of that many columns. */
export function effectiveSpan(field: FormField, columns: number): number {
  const usual = WIDE.has(field.type) ? columns : 1;
  return Math.min(whole(field.span) ? field.span : usual, columns);
}

export function gridClass(columns: number): string {
  return GRID[columnsOf(columns)];
}

export function spanClass(span: number): string {
  return SPAN[span] ?? '';
}

function whole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}
