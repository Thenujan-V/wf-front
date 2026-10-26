import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { UserDetail, UserSummary } from '../../core/identity/identity.models';
import { NotificationPreferences } from './notification-preferences';

@Component({
  selector: 'app-profile',
  imports: [NotificationPreferences],
  templateUrl: './profile.html',
})
export class ProfilePage {
  private readonly http = inject(HttpClient);
  protected readonly me = signal<UserDetail | null>(null);
  protected readonly manager = signal<UserSummary | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    this.http.get<UserDetail>('/api/identity/me').subscribe({
      next: (me) => {
        this.me.set(me);
        if (me.managerId) {
          this.http
            .get<UserSummary[]>(`/api/identity/users/${encodeURIComponent(me.id)}/managers`, { params: { levels: 1 } })
            .subscribe((chain) => this.manager.set(chain[0] ?? null));
        }
      },
      error: () => this.failed.set(true),
    });
  }
}
