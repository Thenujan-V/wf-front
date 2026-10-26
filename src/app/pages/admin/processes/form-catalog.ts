import { Injectable, Signal, WritableSignal, inject, signal } from '@angular/core';
import { PublishedForm } from '../../../core/forms/form.models';
import { FormSummary, FormsAdminApi, VersionSummary } from '../../../core/forms/forms-admin.api';
import { FormsApi } from '../../../core/forms/forms.api';

/** Still loading, loaded, or not available (unknown, removed, or the request failed). */
export type Loaded<T> = T | 'loading' | 'missing';

/**
 * Published forms for the designer, fetched on first use and kept for the page's lifetime; versions never change.
 * Signals are only written when a response arrives, so the getters may be called from computed().
 */
@Injectable()
export class FormCatalog {
  private readonly admin = inject(FormsAdminApi);
  private readonly forms = inject(FormsApi);
  private summaryList: WritableSignal<Loaded<FormSummary[]>> | null = null;
  private readonly versionLists = new Map<string, WritableSignal<Loaded<VersionSummary[]>>>();
  private readonly definitions = new Map<string, WritableSignal<Loaded<PublishedForm>>>();

  /** Forms a step can use: those whose latest version is published. */
  summaries(): Signal<Loaded<FormSummary[]>> {
    if (!this.summaryList) {
      const list = signal<Loaded<FormSummary[]>>('loading');
      this.summaryList = list;
      this.admin.list(true).subscribe({
        next: (all) => list.set(all.filter((f) => f.latestVersion !== null && f.status === 'PUBLISHED')),
        error: () => list.set('missing'),
      });
    }
    return this.summaryList.asReadonly();
  }

  /** Published (not retired) versions of a form, newest first. */
  versions(key: string): Signal<Loaded<VersionSummary[]>> {
    let versions = this.versionLists.get(key);
    if (!versions) {
      const created = signal<Loaded<VersionSummary[]>>('loading');
      this.versionLists.set(key, created);
      this.admin.versions(key, true).subscribe({
        next: (all) => created.set(all.filter((v) => v.status === 'PUBLISHED')),
        error: () => created.set('missing'),
      });
      versions = created;
    }
    return versions.asReadonly();
  }

  form(key: string, version: number): Signal<Loaded<PublishedForm>> {
    const id = `${key}@${version}`;
    let form = this.definitions.get(id);
    if (!form) {
      const created = signal<Loaded<PublishedForm>>('loading');
      this.definitions.set(id, created);
      this.forms.version(key, version, true).subscribe({
        next: (published) => created.set(published),
        error: () => created.set('missing'),
      });
      form = created;
    }
    return form.asReadonly();
  }
}
