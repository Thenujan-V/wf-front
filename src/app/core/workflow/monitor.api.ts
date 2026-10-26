import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { InstanceSummary } from './workflow.models';

const BASE = '/api/workflow';

export interface InstancePage {
  items: InstanceSummary[];
  total: number;
  page: number;
  size: number;
}

export interface InstanceQuery {
  /** ACTIVE, SUSPENDED, COMPLETED or CANCELLED. */
  status?: string;
  processKey?: string;
  /** A request's id, or the start of its reference. */
  q?: string;
  page?: number;
  size?: number;
}

/** A job that used up its retries, with the request it belongs to. */
export interface DeadJob {
  id: string;
  instanceId: string;
  type: string;
  status: string;
  dueAt: string;
  attempts: number;
  lastError: string | null;
  processKey: string;
  businessKey: string | null;
}

function quiet(silent: boolean): HttpContext {
  return new HttpContext().set(SILENT_ERRORS, silent);
}

/** Spec §9 admin/monitor: every request and every dead job; administrators only. */
@Injectable({ providedIn: 'root' })
export class MonitorApi {
  private readonly http = inject(HttpClient);

  /** Newest first. */
  instances(query: InstanceQuery = {}, silent = false): Observable<InstancePage> {
    let params = new HttpParams().set('page', query.page ?? 0).set('size', query.size ?? 20);
    for (const key of ['status', 'processKey', 'q'] as const) {
      const value = query[key]?.trim();
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<InstancePage>(`${BASE}/admin/instances`, { params, context: quiet(silent) });
  }

  deadJobs(silent = false): Observable<DeadJob[]> {
    return this.http.get<DeadJob[]>(`${BASE}/jobs`, { params: { status: 'DEAD' }, context: quiet(silent) });
  }

  retry(jobId: string): Observable<void> {
    return this.http.post<void>(`${BASE}/jobs/${encodeURIComponent(jobId)}/retry`, null);
  }

  cancel(instanceId: string): Observable<void> {
    return this.act(instanceId, 'cancel');
  }

  suspend(instanceId: string): Observable<void> {
    return this.act(instanceId, 'suspend');
  }

  resume(instanceId: string): Observable<void> {
    return this.act(instanceId, 'resume');
  }

  private act(instanceId: string, action: string): Observable<void> {
    return this.http.post<void>(`${BASE}/instances/${encodeURIComponent(instanceId)}/${action}`, null);
  }
}
