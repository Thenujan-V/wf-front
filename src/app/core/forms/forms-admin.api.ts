import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { FieldError, FormDefinition } from './form.models';

/** A row of the designer's form list: the latest version (if any) and whether a draft exists. */
export interface FormSummary {
  key: string;
  name: string;
  latestVersion: number | null;
  /** DRAFT (never published), PUBLISHED or RETIRED. */
  status: string;
  hasDraft: boolean;
  draftUpdatedAt: string | null;
}

export interface FormDraft {
  key: string;
  name: string;
  definition: FormDefinition;
  updatedAt: string;
  updatedBy: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: FieldError[];
}

export interface PublishedFormRef {
  id: string;
  key: string;
  version: number;
  name: string;
  publishedAt: string;
}

export interface VersionSummary {
  version: number;
  status: string;
  publishedAt: string;
}

const BASE = '/api/forms/definitions';

/** Designer endpoints of form-service (process-designer or wms-admin). */
@Injectable({ providedIn: 'root' })
export class FormsAdminApi {
  private readonly http = inject(HttpClient);

  list(silent = false): Observable<FormSummary[]> {
    return this.http.get<FormSummary[]>(BASE, { context: context(silent) });
  }

  draft(key: string, silent = false): Observable<FormDraft> {
    return this.http.get<FormDraft>(`${BASE}/${encodeURIComponent(key)}/draft`, { context: context(silent) });
  }

  saveDraft(key: string, name: string, definition: FormDefinition): Observable<FormDraft> {
    return this.http.put<FormDraft>(`${BASE}/${encodeURIComponent(key)}/draft`, { name, definition });
  }

  validate(key: string): Observable<ValidationReport> {
    return this.http.post<ValidationReport>(`${BASE}/${encodeURIComponent(key)}/validate`, null);
  }

  publish(key: string): Observable<PublishedFormRef> {
    return this.http.post<PublishedFormRef>(`${BASE}/${encodeURIComponent(key)}/publish`, null);
  }

  versions(key: string, silent = false): Observable<VersionSummary[]> {
    return this.http.get<VersionSummary[]>(`${BASE}/${encodeURIComponent(key)}/versions`, { context: context(silent) });
  }

  retire(key: string): Observable<void> {
    return this.http.post<void>(`${BASE}/${encodeURIComponent(key)}/retire`, null);
  }
}

function context(silent: boolean): HttpContext {
  return new HttpContext().set(SILENT_ERRORS, silent);
}
