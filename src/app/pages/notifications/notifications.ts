import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { NotificationCenter } from '../../core/notifications/notification-center';
import { AppNotification, NotificationPage, appPath } from '../../core/notifications/notification.models';
import { NotificationsApi } from '../../core/notifications/notifications.api';

const SIZE = 20;

/** Spec §8/§9: everything the person was told, newest first; the bell shows only the latest few. */
@Component({
  selector: 'app-notifications',
  imports: [DatePipe],
  templateUrl: './notifications.html',
})
export class NotificationsPage {
  private readonly api = inject(NotificationsApi);
  private readonly router = inject(Router);
  protected readonly center = inject(NotificationCenter);

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly results = signal<NotificationPage | null>(null);
  protected readonly unreadOnly = signal(false);
  protected readonly page = signal(0);
  protected readonly pages = computed(() => {
    const r = this.results();
    return r ? Math.max(1, Math.ceil(r.total / r.size)) : 1;
  });
  private request: Subscription | null = null;

  constructor() {
    // Loads at once, and again when the filter or page changes, or when something arrives or is read (here or in
    // another tab): the centre's "changes" goes up.
    effect(() => {
      this.center.changes();
      this.unreadOnly();
      this.page();
      untracked(() => this.load());
    });
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  protected showUnreadOnly(value: boolean): void {
    this.page.set(0);
    this.unreadOnly.set(value);
  }

  protected go(delta: number): void {
    this.page.update((p) => Math.min(Math.max(0, p + delta), this.pages() - 1));
  }

  protected open(notification: AppNotification): void {
    this.center.markRead(notification);
    const path = appPath(notification.link);
    if (path) {
      void this.router.navigateByUrl(path);
    }
  }

  protected retry(): void {
    this.state.set('loading');
    this.load();
  }

  private load(): void {
    this.request?.unsubscribe();
    this.request = this.api.page({ unreadOnly: this.unreadOnly(), page: this.page(), size: SIZE }, true).subscribe({
      next: (r) => {
        if (r.items.length === 0 && r.total > 0 && this.page() > 0) {
          // The page we were on has emptied (what was on it was read): step back rather than show nothing.
          this.page.set(Math.max(0, Math.ceil(r.total / r.size) - 1));
          return;
        }
        this.results.set(r);
        this.state.set('ready');
      },
      error: () => this.state.set('failed'),
    });
  }
}
