import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NotificationCenter } from '../../core/notifications/notification-center';
import { AppNotification } from '../../core/notifications/notification.models';
import { NotificationsPage } from './notifications';

function note(id: string, link: string | null = '/inbox', readAt: string | null = null): AppNotification {
  return { id, kind: 'TASK_ASSIGNED', title: `New task: ${id}`, body: 'You have a new task.', link, createdAt: '2026-10-01T09:00:00Z', readAt };
}

describe('NotificationsPage', () => {
  function setup() {
    const center = { changes: signal(0), markRead: vi.fn(), markAllRead: vi.fn() };
    TestBed.configureTestingModule({
      imports: [NotificationsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: NotificationCenter, useValue: center }],
    });
    const fixture = TestBed.createComponent(NotificationsPage);
    const controller = TestBed.inject(HttpTestingController);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const query = <T extends HTMLElement>(testId: string) => element.querySelector<T>(`[data-testid="${testId}"]`);
    const request = (): TestRequest => controller.expectOne((r) => r.url === '/api/notifications/notifications');
    const answer = (items: AppNotification[], total: number, unread: number, page = 0) => {
      request().flush({ items, total, unread, page, size: 20 });
      fixture.detectChanges();
    };
    return { fixture, center, controller, navigate, element, query, request, answer };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists the person\'s notifications, newest first as the server sends them', () => {
    const { element, request, fixture } = setup();
    const req = request();
    expect(req.request.params.get('unread')).toBe('false');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('20');
    req.flush({ items: [note('n2'), note('n1', '/inbox', '2026-10-01T09:05:00Z')], total: 2, unread: 1, page: 0, size: 20 });
    fixture.detectChanges();

    const rows = element.querySelectorAll('[data-testid="notification-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('New task: n2');
    expect(rows[0].textContent).toContain('Unread');
    expect(rows[1].textContent).not.toContain('Unread');
    expect(element.textContent).toContain('1 unread');
  });

  it('can show only what is unread, from the first page', () => {
    const { fixture, query, request, answer, element } = setup();
    answer([note('n1')], 1, 1);

    query<HTMLButtonElement>('filter-unread')!.click();
    fixture.detectChanges();

    const req = request();
    expect(req.request.params.get('unread')).toBe('true');
    expect(req.request.params.get('page')).toBe('0');
    req.flush({ items: [], total: 0, unread: 0, page: 0, size: 20 });
    fixture.detectChanges();
    expect(element.textContent).toContain('Nothing unread.');
  });

  it('pages through a long list', () => {
    const { fixture, query, request, answer, element } = setup();
    answer([note('n1')], 45, 0);
    expect(element.textContent).toContain('Page 1 of 3');
    expect(query<HTMLButtonElement>('previous')!.disabled).toBe(true);

    query<HTMLButtonElement>('next')!.click();
    fixture.detectChanges();

    expect(request().request.params.get('page')).toBe('1');
  });

  it('loads again, on the same page, when something arrives or is read elsewhere', () => {
    const { fixture, center, query, request, answer } = setup();
    answer([note('n1')], 45, 0);
    query<HTMLButtonElement>('next')!.click();
    fixture.detectChanges();
    answer([note('n21')], 45, 0, 1);

    center.changes.update((v) => v + 1);
    fixture.detectChanges();

    expect(request().request.params.get('page')).toBe('1');
  });

  it('steps back when the page it was on has emptied', () => {
    const { fixture, query, request, answer } = setup();
    answer([note('n1')], 21, 21);
    query<HTMLButtonElement>('next')!.click();
    fixture.detectChanges();

    request().flush({ items: [], total: 20, unread: 20, page: 1, size: 20 }); // the 21st was read meanwhile
    fixture.detectChanges();

    expect(request().request.params.get('page')).toBe('0');
  });

  it('opening one marks it read and goes where it leads, inside the app only', () => {
    const { fixture, center, navigate, element, answer } = setup();
    const first = note('n1', '/requests/i-1');
    const second = note('n2', 'https://evil.example');
    answer([first, second], 2, 2);

    const rows = element.querySelectorAll<HTMLButtonElement>('[data-testid="notification-open"]');
    rows[0].click();
    rows[1].click();
    fixture.detectChanges();

    expect(center.markRead).toHaveBeenCalledWith(first);
    expect(center.markRead).toHaveBeenCalledWith(second);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/requests/i-1');
  });

  it('marks everything as read when there is something unread', () => {
    const { center, query, answer } = setup();
    answer([note('n1')], 1, 1);

    query<HTMLButtonElement>('read-all')!.click();

    expect(center.markAllRead).toHaveBeenCalledTimes(1);
  });

  it('says so when there is nothing, and when the list cannot be loaded', () => {
    const { fixture, center, element, query, request, answer } = setup();
    answer([], 0, 0);
    expect(element.textContent).toContain('You have no notifications.');
    expect(query('read-all')).toBeNull();

    center.changes.update((v) => v + 1); // something arrived: the list loads again, and this time it fails
    fixture.detectChanges();
    request().flush(null, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();
    expect(element.textContent).toContain('could not be loaded');

    query<HTMLButtonElement>('retry')!.click();
    answer([note('n1')], 1, 1);
    expect(element.querySelectorAll('[data-testid="notification-row"]')).toHaveLength(1);
  });
});
