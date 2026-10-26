import { Injectable, inject, signal } from '@angular/core';
import { ToastService } from '../ui/toast.service';
import { AppNotification, PushFrame } from './notification.models';
import { NotificationSocket } from './notification-socket';
import { NotificationsApi } from './notifications.api';

/** How often the unread count is asked for while the live connection is down. */
export const POLL_MS = 60_000;
/** How many notifications the bell shows. */
const RECENT = 10;

/**
 * The signed-in person's notifications, for the bell, the list and anything else that shows them. Live push is best
 * effort: what is stored on the server is the truth, and this asks for it again whenever the connection comes back.
 */
@Injectable({ providedIn: 'root' })
export class NotificationCenter {
  private readonly api = inject(NotificationsApi);
  private readonly socket = inject(NotificationSocket);
  private readonly toasts = inject(ToastService);

  private readonly count = signal(0);
  private readonly items = signal<AppNotification[]>([]);
  private readonly loadState = signal<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  private readonly connected = signal(false);
  private readonly version = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly unread = this.count.asReadonly();
  /** The latest few, newest first; loaded by {@link loadRecent}. */
  readonly recent = this.items.asReadonly();
  readonly recentState = this.loadState.asReadonly();
  /** Whether new notifications arrive by themselves right now. */
  readonly live = this.connected.asReadonly();
  /** Goes up whenever the person's notifications changed, so an open list knows to load again. */
  readonly changes = this.version.asReadonly();

  start(): void {
    if (this.timer !== null) {
      return;
    }
    this.refresh();
    this.socket.open({
      frame: (frame) => this.onFrame(frame),
      connected: () => {
        this.connected.set(true);
        this.refresh(); // whatever happened while it was down
      },
      disconnected: () => this.connected.set(false),
    });
    this.timer = setInterval(() => {
      if (!this.connected()) {
        this.refresh();
      }
    }, POLL_MS);
  }

  stop(): void {
    if (this.timer === null) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
    this.socket.close();
    this.connected.set(false);
  }

  refresh(): void {
    this.api.unreadCount().subscribe({ next: (n) => this.count.set(n), error: () => undefined });
  }

  loadRecent(): void {
    this.loadState.set('loading');
    this.api.page({ size: RECENT }, true).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.count.set(page.unread);
        this.loadState.set('ready');
      },
      error: () => this.loadState.set('failed'),
    });
  }

  markRead(notification: AppNotification): void {
    if (notification.readAt) {
      return;
    }
    this.api.markRead(notification.id).subscribe({
      next: () => {
        const readAt = new Date().toISOString();
        this.items.update((list) => list.map((n) => (n.id === notification.id ? { ...n, readAt } : n)));
        this.count.update((n) => Math.max(0, n - 1));
        this.version.update((v) => v + 1);
      },
      error: () => undefined, // the failure has been shown as a toast
    });
  }

  markAllRead(): void {
    this.api.markAllRead().subscribe({
      next: () => {
        const readAt = new Date().toISOString();
        this.items.update((list) => list.map((n) => (n.readAt ? n : { ...n, readAt })));
        this.count.set(0);
        this.version.update((v) => v + 1);
      },
      error: () => undefined,
    });
  }

  private onFrame(frame: PushFrame): void {
    this.count.set(frame.unread);
    const arrived = frame.notification;
    if (frame.type === 'created' && arrived) {
      this.items.update((list) => [arrived, ...list.filter((n) => n.id !== arrived.id)].slice(0, RECENT));
      this.toasts.success(arrived.title);
    }
    this.version.update((v) => v + 1);
  }
}
