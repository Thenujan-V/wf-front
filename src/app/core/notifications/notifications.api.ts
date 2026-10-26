import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { NotificationPage, NotificationPreference } from './notification.models';

const BASE = '/api/notifications';

function quiet(silent: boolean): HttpContext {
  return new HttpContext().set(SILENT_ERRORS, silent);
}

/** notification-service (spec §8), through the gateway: the signed-in person's own notifications and settings. */
@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  private readonly http = inject(HttpClient);

  /** Newest first. */
  page(options: { unreadOnly?: boolean; page?: number; size?: number } = {}, silent = false): Observable<NotificationPage> {
    const params = new HttpParams()
      .set('unread', options.unreadOnly ?? false)
      .set('page', options.page ?? 0)
      .set('size', options.size ?? 20);
    return this.http.get<NotificationPage>(`${BASE}/notifications`, { params, context: quiet(silent) });
  }

  /** Asked for in the background, so a failure is never shown. */
  unreadCount(): Observable<number> {
    return this.http.get<{ count: number }>(`${BASE}/notifications/unread-count`, { context: quiet(true) })
      .pipe(map((result) => result.count));
  }

  markRead(id: string): Observable<void> {
    return this.http.post<void>(`${BASE}/notifications/${encodeURIComponent(id)}/read`, null);
  }

  markAllRead(): Observable<void> {
    return this.http.post<void>(`${BASE}/notifications/read-all`, null);
  }

  /** Every kind, with the person's choice or its default. */
  preferences(silent = false): Observable<NotificationPreference[]> {
    return this.http.get<NotificationPreference[]>(`${BASE}/preferences`, { context: quiet(silent) });
  }

  /** Replaces the person's choices; returns them as stored. */
  savePreferences(preferences: NotificationPreference[]): Observable<NotificationPreference[]> {
    return this.http.put<NotificationPreference[]>(`${BASE}/preferences`, { preferences });
  }
}
