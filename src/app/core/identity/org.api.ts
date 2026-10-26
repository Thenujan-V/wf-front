import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { UserDetail, UserSummary } from './identity.models';

const BASE = '/api/identity';
const PAGE_SIZE = 20;
/** The most levels identity-service gives in one call. */
const MAX_LEVELS = 10;

/** Where an org field's value comes from: Keycloak (read-only here) or this app. */
export type OrgSource = 'KEYCLOAK' | 'LOCAL';

export interface OrgSettings {
  manager: OrgSource;
  department: OrgSource;
  position: OrgSource;
}

export interface UserPage {
  items: UserSummary[];
  page: number;
  size: number;
  total: number;
}

/** The people who report to someone; a very long list is cut, and `total` says how many there are. */
export interface ReportsPage {
  items: UserSummary[];
  total: number;
}

/** A person's org fields, all three; null clears one. */
export interface OrgUpdate {
  managerId: string | null;
  department: string | null;
  position: string | null;
}

function quiet(silent: boolean): HttpContext {
  return new HttpContext().set(SILENT_ERRORS, silent);
}

/** Spec §7 org hierarchy, for the org-chart admin page. */
@Injectable({ providedIn: 'root' })
export class OrgApi {
  private readonly http = inject(HttpClient);

  settings(silent = false): Observable<OrgSettings> {
    return this.http.get<OrgSettings>(`${BASE}/org/settings`, { context: quiet(silent) });
  }

  /** By username; people who have left are included, since they may still be someone's manager. */
  people(q: string, page: number, silent = false): Observable<UserPage> {
    let params = new HttpParams().set('page', page).set('size', PAGE_SIZE).set('includeDisabled', true);
    if (q.trim()) {
      params = params.set('q', q.trim());
    }
    return this.http.get<UserPage>(`${BASE}/users`, { params, context: quiet(silent) });
  }

  /** The chain above a person, nearest first. */
  managers(userId: string, silent = false): Observable<UserSummary[]> {
    return this.http.get<UserSummary[]>(`${BASE}/users/${encodeURIComponent(userId)}/managers`,
      { params: { levels: MAX_LEVELS }, context: quiet(silent) });
  }

  reports(userId: string, silent = false): Observable<ReportsPage> {
    return this.http.get<ReportsPage>(`${BASE}/users/${encodeURIComponent(userId)}/reports`,
      { params: { includeDisabled: true }, context: quiet(silent) });
  }

  update(userId: string, change: OrgUpdate): Observable<UserDetail> {
    return this.http.put<UserDetail>(`${BASE}/users/${encodeURIComponent(userId)}/org`, change);
  }
}
