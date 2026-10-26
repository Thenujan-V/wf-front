import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import {
  CatalogEntry,
  HistoryEntry,
  InstanceAccess,
  InstanceDetail,
  InstanceSummary,
  StartRequest,
  TaskView,
  TaskFormView,
  TaskViewName,
} from './workflow.models';

const BASE = '/api/workflow';

@Injectable({ providedIn: 'root' })
export class WorkflowApi {
  private readonly http = inject(HttpClient);

  catalog(silent = false): Observable<CatalogEntry[]> {
    return this.http.get<CatalogEntry[]>(`${BASE}/catalog`, { context: context(silent) });
  }

  tasks(view: TaskViewName, silent = false): Observable<TaskView[]> {
    return this.http.get<TaskView[]>(`${BASE}/tasks`, { params: { view }, context: context(silent) });
  }

  claim(taskId: string): Observable<void> {
    return this.http.post<void>(`${BASE}/tasks/${encodeURIComponent(taskId)}/claim`, null);
  }

  unclaim(taskId: string): Observable<void> {
    return this.http.post<void>(`${BASE}/tasks/${encodeURIComponent(taskId)}/unclaim`, null);
  }

  delegate(taskId: string, toUserId: string): Observable<void> {
    return this.http.post<void>(`${BASE}/tasks/${encodeURIComponent(taskId)}/delegate`, { toUserId });
  }

  complete(taskId: string, outcome: string, data: Record<string, unknown>, comment?: string): Observable<void> {
    const body = comment ? { outcome, data, comment } : { outcome, data };
    return this.http.post<void>(`${BASE}/tasks/${encodeURIComponent(taskId)}/complete`, body);
  }

  taskForm(taskId: string, silent = false): Observable<TaskFormView> {
    return this.http.get<TaskFormView>(`${BASE}/tasks/${encodeURIComponent(taskId)}/form`, { context: context(silent) });
  }

  start(request: StartRequest): Observable<InstanceSummary> {
    return this.http.post<InstanceSummary>(`${BASE}/instances`, request);
  }

  myRequests(silent = false): Observable<InstanceSummary[]> {
    return this.http.get<InstanceSummary[]>(`${BASE}/instances`, { context: context(silent) });
  }

  request(id: string, silent = false): Observable<InstanceDetail> {
    return this.http.get<InstanceDetail>(`${BASE}/instances/${encodeURIComponent(id)}`, { context: context(silent) });
  }

  history(id: string, silent = false): Observable<HistoryEntry[]> {
    return this.http.get<HistoryEntry[]>(`${BASE}/instances/${encodeURIComponent(id)}/history`, { context: context(silent) });
  }

  access(id: string, silent = false): Observable<InstanceAccess> {
    return this.http.get<InstanceAccess>(`${BASE}/instances/${encodeURIComponent(id)}/access-check`, { context: context(silent) });
  }
}

function context(silent: boolean): HttpContext {
  return new HttpContext().set(SILENT_ERRORS, silent);
}
