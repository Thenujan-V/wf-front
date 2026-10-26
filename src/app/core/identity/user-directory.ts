import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, Signal, WritableSignal, inject, signal } from '@angular/core';
import { Observable, map } from 'rxjs';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { GroupView, UserSummary } from './identity.models';

interface Page<T> {
  items: T[];
}

const NO_USER = signal('—').asReadonly();
const SYSTEM = signal('System').asReadonly();

/** Display names for user ids, looked up once per id; failures show "Unknown user" instead of a toast. */
@Injectable({ providedIn: 'root' })
export class UserDirectory {
  private readonly http = inject(HttpClient);
  private readonly names = new Map<string, WritableSignal<string>>();

  name(id: string | null | undefined): Signal<string> {
    if (!id) {
      return NO_USER;
    }
    if (id === 'system') {
      return SYSTEM;
    }
    let name = this.names.get(id);
    if (!name) {
      const created = signal('…');
      this.names.set(id, created);
      this.http
        .get<UserSummary>(`/api/identity/users/${encodeURIComponent(id)}`, {
          context: new HttpContext().set(SILENT_ERRORS, true),
        })
        .subscribe({
          next: (user) => created.set(user.displayName || user.username),
          error: () => created.set('Unknown user'),
        });
      name = created;
    }
    return name.asReadonly();
  }

  search(query: string): Observable<UserSummary[]> {
    return this.http
      .get<Page<UserSummary>>('/api/identity/users', { params: { q: query, size: 10 } })
      .pipe(map((page) => page.items));
  }

  groups(): Observable<GroupView[]> {
    return this.http.get<GroupView[]>('/api/identity/groups');
  }
}
