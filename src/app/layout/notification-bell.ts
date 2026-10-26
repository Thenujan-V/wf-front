import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../core/ui/icon';
import { NotificationCenter } from '../core/notifications/notification-center';
import { AppNotification, appPath } from '../core/notifications/notification.models';

/** The bell in the header: how many notifications are unread, and the latest ones on demand. */
@Component({
  selector: 'app-notification-bell',
  imports: [DatePipe, Icon, RouterLink],
  templateUrl: './notification-bell.html',
  host: {
    class: 'relative',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
})
export class NotificationBell {
  protected readonly center = inject(NotificationCenter);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly open = signal(false);
  protected readonly badge = computed(() => (this.center.unread() > 99 ? '99+' : String(this.center.unread())));
  protected readonly label = computed(() =>
    this.center.unread() === 0 ? 'Notifications' : `Notifications, ${this.center.unread()} unread`);

  constructor() {
    this.center.start();
    inject(DestroyRef).onDestroy(() => this.center.stop());
  }

  protected toggle(): void {
    const opening = !this.open();
    this.open.set(opening);
    if (opening) {
      this.center.loadRecent();
    }
  }

  protected choose(notification: AppNotification): void {
    this.center.markRead(notification);
    this.open.set(false);
    const path = appPath(notification.link);
    if (path) {
      void this.router.navigateByUrl(path);
    }
  }

  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
