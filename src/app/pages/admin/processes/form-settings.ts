import { Component, computed, inject, input, output } from '@angular/core';
import { Access, FormField } from '../../../core/forms/form.models';
import { NodeFormRef } from '../../../core/workflow/process.models';
import { FormCatalog } from './form-catalog';
import { inputFields } from './process-fields';

export const ACCESS_LEVELS: { level: Access; label: string }[] = [
  { level: 'EDITABLE', label: 'Can edit' },
  { level: 'READONLY', label: 'Read only' },
  { level: 'HIDDEN', label: 'Hidden' },
];

/** Which form a start or task shows, at which published version, and (tasks) what each field allows. */
@Component({
  selector: 'app-form-settings',
  templateUrl: './form-settings.html',
})
export class FormSettings {
  private readonly catalog = inject(FormCatalog);

  readonly formRef = input<NodeFormRef | undefined>(undefined);
  readonly withAccess = input(false);
  readonly formRefChange = output<NodeFormRef | undefined>();

  protected readonly levels = ACCESS_LEVELS;
  protected readonly summaries = computed(() => {
    const list = this.catalog.summaries()();
    return Array.isArray(list) ? list : [];
  });
  /** The chosen key, when the list of pickable forms does not include it (retired, or not loaded). */
  protected readonly unlistedKey = computed(() => {
    const key = this.formRef()?.key;
    return key && !this.summaries().some((f) => f.key === key) ? key : null;
  });
  protected readonly versions = computed(() => {
    const ref = this.formRef();
    const list = ref ? this.catalog.versions(ref.key)() : [];
    const published = Array.isArray(list) ? list.map((v) => v.version) : [];
    return ref && !published.includes(ref.version) ? [ref.version, ...published] : published;
  });
  protected readonly form = computed(() => {
    const ref = this.formRef();
    return ref ? this.catalog.form(ref.key, ref.version)() : null;
  });
  protected readonly fields = computed<FormField[]>(() => {
    const form = this.form();
    return form && typeof form === 'object' ? inputFields(form) : [];
  });
  protected readonly staleKeys = computed(() => {
    const known = new Set(this.fields().map((f) => f.key));
    return this.form() === 'loading' ? [] : Object.keys(this.formRef()?.access ?? {}).filter((k) => !known.has(k));
  });

  protected setKey(key: string): void {
    if (!key) {
      this.formRefChange.emit(undefined);
      return;
    }
    const version = this.summaries().find((f) => f.key === key)?.latestVersion;
    if (version) {
      this.formRefChange.emit({ key, version });
    }
  }

  protected setVersion(text: string): void {
    const ref = this.formRef();
    if (ref) {
      this.formRefChange.emit(withAccess({ key: ref.key, version: Number(text) }, ref.access));
    }
  }

  protected accessOf(key: string): Access {
    return this.formRef()?.access?.[key] ?? 'EDITABLE';
  }

  protected setAccess(key: string, level: Access): void {
    const ref = this.formRef();
    if (!ref) {
      return;
    }
    const access = { ...ref.access };
    if (level === 'EDITABLE') {
      delete access[key];
    } else {
      access[key] = level;
    }
    this.formRefChange.emit(withAccess({ key: ref.key, version: ref.version }, access));
  }

  protected dropAccess(key: string): void {
    this.setAccess(key, 'EDITABLE');
  }
}

function withAccess(ref: NodeFormRef, access: Record<string, Access> | undefined): NodeFormRef {
  return access && Object.keys(access).length ? { ...ref, access } : ref;
}
