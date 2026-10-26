/** Form definitions as stored by form-service (spec §5). */
export type FieldType =
  | 'text' | 'textarea' | 'number' | 'currency' | 'date' | 'datetime'
  | 'select' | 'radio' | 'checkbox' | 'user' | 'file' | 'table' | 'heading' | 'display';

/** What a workflow step lets the person do with a field. */
export type Access = 'EDITABLE' | 'READONLY' | 'HIDDEN';

export interface FormOption {
  value: string;
  label: string;
}

export interface FormSection {
  id: string;
  title: string;
  columns?: number;
}

export interface FormField {
  key: string;
  type: FieldType;
  label: string;
  section?: string;
  /** How many of its section's columns the field takes; without it the field has its type's usual width. */
  span?: number;
  help?: string;
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  options?: FormOption[];
  columns?: FormField[];
  minRows?: number;
  maxRows?: number;
  totals?: string[];
  visibleWhen?: unknown;
  requiredWhen?: unknown;
}

export interface FormDefinition {
  sections?: FormSection[];
  fields: FormField[];
}

/** One problem with a field; {@code field} is a key or a path such as lines[2].cost. */
export interface FieldError {
  field: string;
  code: string;
  message: string;
}

/** GET /api/forms/definitions/{key}/versions/{version}. */
export interface PublishedForm {
  key: string;
  version: number;
  name: string;
  status: string;
  definition: FormDefinition;
}

/** Headings and display text only show their label; they never hold a value. */
export function holdsValue(field: FormField): boolean {
  return field.type !== 'heading' && field.type !== 'display';
}

/** A file field's value holds references to uploaded documents (spec §5). */
export interface FileRef {
  documentId: string;
  name: string;
}

/** At most this many files in one file field (form-service's SubmissionValidator.MAX_FILES). */
export const MAX_FILES = 10;
