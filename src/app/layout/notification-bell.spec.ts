import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NotificationCenter } from '../core/notifications/notification-center';
import { AppNotification } from '../core/notifications/notification.models';
import { NotificationBell } from './notification-bell';

function note(id: string, link: string | null, readAt: string | null = null): AppNotification {
  return { id, kind: 'TASK_ASSIGNED', title: `New task: ${id}`, body: 'You have a new task.', link, createdAt: '2026-10-01T09:00:00Z', readAt };
}

describe('NotificationBell', () => {
  function setup(unread = 0) {
    const center = {
      unread: signal(unread),
      recent: signal<AppNotification[]>([]),
      recentState: signal<'idle' | 'loading' | 'ready' | 'failed'>('idle'),
      start: vi.fn(),
      stop: vi.fn(),
      loadRecent: vi.fn(),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [NotificationBell],
      providers: [provideRouter([]), { provide: NotificationCenter, useValue: center }],
    });
    const fixture = TestBed.createComponent(NotificationBell);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const query = <T extends HTMLElement>(testId: string) => element.querySelector<T>(`[data-testid="${testId}"]`);
    const open = (items: AppNotification[]) => {
      query<HTMLButtonElement>('bell')!.click();
      center.recent.set(items);
      center.recentState.set('ready');
      fixture.detectChanges();
    };
    return { fixture, center, navigate, element, query, open };
  }

  it('starts listening when it appears and stops when it goes', () => {
    const { fixture, center } = setup();
    expect(center.start).toHaveBeenCalledTimes(1);

    fixture.destroy();
    expect(center.stop).toHaveBeenCalledTimes(1);
  });

  it('shows how many are unread, and nothing when none are', () => {
    const { fixture, center, query } = setup(0);
    expect(query('bell-badge')).toBeNull();
    expect(query('bell')!.getAttribute('aria-label')).toBe('Notifications');

    center.unread.set(3);
    fixture.detectChanges();
    expect(query('bell-badge')!.textContent!.trim()).toBe('3');
    expect(query('bell')!.getAttribute('aria-label')).toBe('Notifications, 3 unread');

    center.unread.set(150);
    fixture.detectChanges();
    expect(query('bell-badge')!.textContent!.trim()).toBe('99+');
  });

  it('opens with the latest notifications, loaded when it opens', () => {
    const { center, element, query, open } = setup(1);
    expect(query('bell-panel')).toBeNull();

    open([note('n1', '/inbox'), note('n2', '/requests/i-1', '2026-10-01T09:05:00Z')]);

    expect(center.loadRecent).toHaveBeenCalledTimes(1);
    expect(query('bell')!.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelectorAll('[data-testid="bell-item"]')).toHaveLength(2);
    expect(element.textContent).toContain('New task: n1');
  });

  it('says so when there is nothing, or when it could not be loaded', () => {
    const { fixture, center, element, open } = setup();
    open([]);
    expect(element.textContent).toContain('You have no notifications.');

    center.recentState.set('failed');
    fixture.detectChanges();
    expect(element.textContent).toContain('could not be loaded');
  });

  it('choosing one marks it read, goes where it leads and closes the panel', () => {
    const { fixture, center, navigate, element, query, open } = setup(1);
    const first = note('n1', '/requests/i-1');
    open([first]);

    element.querySelector<HTMLButtonElement>('[data-testid="bell-item"]')!.click();
    fixture.detectChanges();

    expect(center.markRead).toHaveBeenCalledWith(first);
    expect(navigate).toHaveBeenCalledWith('/requests/i-1');
    expect(query('bell-panel')).toBeNull();
  });

  it('never leaves the app for a notification without a usable link', () => {
    const { fixture, center, navigate, element, open } = setup(2);
    const items = [note('n1', null), note('n2', 'https://evil.example/x')];

    for (const index of [0, 1]) {
      open(items); // choosing one closes the panel
      element.querySelectorAll<HTMLButtonElement>('[data-testid="bell-item"]')[index].click();
      fixture.detectChanges();
    }

    expect(center.markRead).toHaveBeenCalledTimes(2);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('marks everything as read from the panel', () => {
    const { center, query, open } = setup(2);
    open([note('n1', '/inbox')]);

    query<HTMLButtonElement>('bell-read-all')!.click();

    expect(center.markAllRead).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and on a click anywhere else', () => {
    const { fixture, query, open } = setup();
    open([]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(query('bell-panel')).toBeNull();

    open([]);
    expect(query('bell-panel')).not.toBeNull();
    document.body.click();
    fixture.detectChanges();
    expect(query('bell-panel')).toBeNull();
  });
});
