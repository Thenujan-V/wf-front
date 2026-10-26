import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import {
  ProcessDraft, ProcessGraph, ProcessSummary, ProcessValidationReport, ProcessVersion, PublishedProcess,
} from './process.models';

const BASE = '/api/workflow/definitions';

/** Designer endpoints of workflow-service (process-designer or wms-admin). */
@Injectable({ providedIn: 'root' })
export class ProcessDefinitionsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<ProcessSummary[]> {
    return this.http.get<ProcessSummary[]>(BASE);
  }

  draft(key: string, silent = false): Observable<ProcessDraft> {
    return this.http.get<ProcessDraft>(`${BASE}/${encodeURIComponent(key)}/draft`, { context: context(silent) });
  }

  saveDraft(key: string, name: string, graph: ProcessGraph): Observable<ProcessDraft> {
    return this.http.put<ProcessDraft>(`${BASE}/${encodeURIComponent(key)}/draft`, { name, graph });
  }

  validate(key: string): Observable<ProcessValidationReport> {
    return this.http.post<ProcessValidationReport>(`${BASE}/${encodeURIComponent(key)}/validate`, null);
  }

  publish(key: string): Observable<PublishedProcess> {
    return this.http.post<PublishedProcess>(`${BASE}/${encodeURIComponent(key)}/publish`, null);
  }

  version(key: string, version: number, silent = false): Observable<ProcessVersion> {
    return this.http.get<ProcessVersion>(`${BASE}/${encodeURIComponent(key)}/versions/${version}`, { context: context(silent) });
  }

  retire(key: string): Observable<void> {
    return this.http.post<void>(`${BASE}/${encodeURIComponent(key)}/retire`, null);
  }
}

function context(silent: boolean): HttpContext {
  return new HttpContext().set(SILENT_ERRORS, silent);
}
