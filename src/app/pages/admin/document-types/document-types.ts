import { Component, computed, inject, signal } from '@angular/core';
import { DocumentType } from '../../../core/documents/document.models';
import { DocumentsApi } from '../../../core/documents/documents.api';
import { ToastService } from '../../../core/ui/toast.service';
import { FormCatalog } from '../processes/form-catalog';

interface Editing {
  id: string | null;
  name: string;
  formKey: string;
  formVersion: number | null;
}

/** Spec §9 admin/document-types: kinds of documents, and the published form that holds their fields. */
@Component({
  selector: 'app-document-types',
  providers: [FormCatalog],
  templateUrl: './document-types.html',
})
export class DocumentTypesPage {
  private readonly api = inject(DocumentsApi);
  private readonly toasts = inject(ToastService);
  private readonly catalog = inject(FormCatalog);

  protected readonly types = signal<DocumentType[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly editing = signal<Editing | null>(null);
  protected readonly forms = computed(() => {
    if (!this.editing()) {
      return [];
    }
    const list = this.catalog.summaries()();
    return Array.isArray(list) ? list : [];
  });
  protected readonly versions = computed(() => {
    const key = this.editing()?.formKey;
    if (!key) {
      return [];
    }
    const list = this.catalog.versions(key)();
    const published = Array.isArray(list) ? list.map((v) => v.version) : [];
    const current = this.editing()?.formVersion;
    return current && !published.includes(current) ? [current, ...published] : published;
  });

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.failed.set(false);
    this.api.types(true).subscribe({ next: (types) => this.types.set(types), error: () => this.failed.set(true) });
  }

  protected startNew(): void {
    this.editing.set({ id: null, name: '', formKey: '', formVersion: null });
  }

  protected edit(type: DocumentType): void {
    this.editing.set({ id: type.id, name: type.name, formKey: type.form?.key ?? '', formVersion: type.form?.version ?? null });
  }

  protected patch(change: Partial<Editing>): void {
    this.editing.update((e) => (e ? { ...e, ...change } : e));
  }

  /** Whether a form key is among the forms that can be picked (a retired one stays shown as the current choice). */
  protected listed(key: string): boolean {
    return this.forms().some((f) => f.key === key);
  }

  protected setForm(key: string): void {
    const latest = this.forms().find((f) => f.key === key)?.latestVersion ?? null;
    this.patch({ formKey: key, formVersion: key ? latest : null });
  }

  protected save(): void {
    const e = this.editing();
    if (!e || !e.name.trim()) {
      return;
    }
    const form = e.formKey && e.formVersion ? { key: e.formKey, version: e.formVersion } : null;
    const request = e.id ? this.api.updateType(e.id, e.name.trim(), form) : this.api.createType(e.name.trim(), form);
    request.subscribe((saved) => {
      this.toasts.success(`Document type "${saved.name}" saved`);
      this.editing.set(null);
      this.reload();
    });
  }

  protected remove(type: DocumentType): void {
    if (!window.confirm(`Delete the document type "${type.name}"? Types still used by documents cannot be deleted.`)) {
      return;
    }
    this.api.deleteType(type.id).subscribe(() => {
      this.toasts.success(`Document type "${type.name}" deleted`);
      this.reload();
    });
  }
}
