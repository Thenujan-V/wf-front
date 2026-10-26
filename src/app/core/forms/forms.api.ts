import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { PublishedForm } from './form.models';

@Injectable({ providedIn: 'root' })
export class FormsApi {
  private readonly http = inject(HttpClient);

  /** A published (or retired) form version, as pinned by a process step. */
  version(key: string, version: number, silent = false): Observable<PublishedForm> {
    return this.http.get<PublishedForm>(
      `/api/forms/definitions/${encodeURIComponent(key)}/versions/${version}`,
      { context: new HttpContext().set(SILENT_ERRORS, silent) },
    );
  }
}
