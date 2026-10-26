import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { AuditQuery, AuditResults } from './audit.models';

const BASE = '/api/audit';

/** audit-service (spec §8), through the gateway; administrators only. */
@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);

  entries(query: AuditQuery = {}, silent = false): Observable<AuditResults> {
    let params = new HttpParams().set('page', query.page ?? 0).set('size', query.size ?? 20);
    for (const key of ['actor', 'entityType', 'entityId', 'action', 'from', 'to'] as const) {
      const value = query[key];
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AuditResults>(`${BASE}/entries`, { params, context: new HttpContext().set(SILENT_ERRORS, silent) });
  }
}
