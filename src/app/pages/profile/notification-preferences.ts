import { Component, computed, inject, signal } from '@angular/core';
import { NotificationPreference, kindLabel } from '../../core/notifications/notification.models';
import { NotificationsApi } from '../../core/notifications/notifications.api';
import { ToastService } from '../../core/ui/toast.service';

/** Spec §8 "Honours per-user preferences": what the person wants to be told, in the app and by email. */
@Component({
  selector: 'app-notification-preferences',
  templateUrl: './notification-preferences.html',
})
export class NotificationPreferences {
  private readonly api = inject(NotificationsApi);
  private readonly toasts = inject(ToastService);

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly rows = signal<NotificationPreference[]>([]);
  private readonly saved = signal<NotificationPreference[]>([]);
  protected readonly saving = signal(false);
  protected readonly dirty = computed(() => JSON.stringify(this.rows()) !== JSON.stringify(this.saved()));
  protected readonly label = kindLabel;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api.preferences(true).subscribe({
      next: (list) => {
        this.rows.set(list);
        this.saved.set(list);
        this.state.set('ready');
      },
      error: () => this.state.set('failed'),
    });
  }

  protected choose(kind: string, channel: 'inApp' | 'email', value: boolean): void {
    this.rows.update((list) => list.map((row) => (row.kind === kind ? { ...row, [channel]: value } : row)));
  }

  protected save(): void {
    if (this.saving() || !this.dirty()) {
      return;
    }
    this.saving.set(true);
    this.api.savePreferences(this.rows()).subscribe({
      next: (list) => {
        this.rows.set(list);
        this.saved.set(list);
        this.saving.set(false);
        this.toasts.success('Your notification settings are saved.');
      },
      // The failure has been shown as a toast; what the person chose stays, so they can try again.
      error: () => this.saving.set(false),
    });
  }
}
