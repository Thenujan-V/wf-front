import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ToastService } from '../ui/toast.service';
import { AppNotification } from './notification.models';
import { NotificationCenter, POLL_MS } from './notification-center';
import { NotificationSocket, SocketHandlers } from './notification-socket';

const COUNT = '/api/notifications/notifications/unread-count';

function note(id: string, readAt: string | null = null): AppNotification {
  return { id, kind: 'TASK_ASSIGNED', title: `New task: ${id}`, body: 'You have a new task.', link: '/inbox',
    createdAt: '2026-10-01T09:00:00Z', readAt };
}

describe('NotificationCenter', () => {
  let center: NotificationCenter;
  let controller: HttpTestingController;
  let toasts: ToastService;
  let handlers: SocketHandlers | null;
  let socket: { open: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    handlers = null;
    socket = { open: vi.fn((h: SocketHandlers) => { handlers = h; }), close: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: NotificationSocket, useValue: socket }],
    });
    center = TestBed.inject(NotificationCenter);
    controller = TestBed.inject(HttpTestingController);
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => {
    center.stop();
    controller.verify();
    vi.useRealTimers();
  });

  function count(n: number): void {
    controller.expectOne(COUNT).flush({ count: n });
  }

  function recent(items: AppNotification[], unread: number): void {
    const req = controller.expectOne((r) => r.url === '/api/notifications/notifications');
    expect(req.request.params.get('size')).toBe('10');
    req.flush({ items, total: items.length, unread, page: 0, size: 10 });
  }

  it('asks for the unread count and opens the live connection, once', () => {
    center.start();
    center.start();

    count(3);
    expect(center.unread()).toBe(3);
    expect(socket.open).toHaveBeenCalledTimes(1);
    expect(center.live()).toBe(false);
  });

  it('shows a notification the moment it arrives', () => {
    center.start();
    count(0);
    center.loadRecent();
    recent([note('n1', '2026-10-01T09:01:00Z')], 0);
    const before = center.changes();

    handlers!.frame({ type: 'created', notification: note('n2'), unread: 1 });

    expect(center.unread()).toBe(1);
    expect(center.recent().map((n) => n.id)).toEqual(['n2', 'n1']);
    expect(toasts.toasts().map((t) => t.message)).toEqual(['New task: n2']);
    expect(center.changes()).toBeGreaterThan(before);
  });

  it('follows what the person read in another tab, without announcing it', () => {
    center.start();
    count(4);

    handlers!.frame({ type: 'unread', notification: null, unread: 1 });

    expect(center.unread()).toBe(1);
    expect(toasts.toasts()).toEqual([]);
  });

  it('asks for the count now and then while the live connection is down, and at once when it is back', () => {
    center.start();
    count(1);

    vi.advanceTimersByTime(POLL_MS);
    count(2);
    expect(center.unread()).toBe(2);

    handlers!.connected();
    count(3);
    expect(center.live()).toBe(true);
    vi.advanceTimersByTime(POLL_MS * 3);
    controller.expectNone(COUNT);

    handlers!.disconnected();
    expect(center.live()).toBe(false);
    vi.advanceTimersByTime(POLL_MS);
    count(4);
    expect(center.unread()).toBe(4);
  });

  it('keeps the count it has when asking for it fails', () => {
    center.start();
    count(5);

    center.refresh();
    controller.expectOne(COUNT).flush(null, { status: 503, statusText: 'Service Unavailable' });

    expect(center.unread()).toBe(5);
  });

  it('loads the latest notifications, and says so when it cannot', () => {
    center.loadRecent();
    expect(center.recentState()).toBe('loading');
    recent([note('n1'), note('n2')], 2);
    expect(center.recentState()).toBe('ready');
    expect(center.recent()).toHaveLength(2);
    expect(center.unread()).toBe(2);

    center.loadRecent();
    controller.expectOne((r) => r.url === '/api/notifications/notifications').flush(null, { status: 502, statusText: 'Bad Gateway' });
    expect(center.recentState()).toBe('failed');
  });

  it('marks one as read, once', () => {
    center.loadRecent();
    recent([note('n1'), note('n2')], 2);

    center.markRead(center.recent()[0]);
    controller.expectOne('/api/notifications/notifications/n1/read').flush(null);

    expect(center.unread()).toBe(1);
    expect(center.recent()[0].readAt).not.toBeNull();
    center.markRead(center.recent()[0]); // already read: nothing is sent
    controller.expectNone('/api/notifications/notifications/n1/read');
  });

  it('marks everything as read', () => {
    center.loadRecent();
    recent([note('n1'), note('n2')], 7);

    center.markAllRead();
    controller.expectOne('/api/notifications/notifications/read-all').flush(null);

    expect(center.unread()).toBe(0);
    expect(center.recent().every((n) => n.readAt !== null)).toBe(true);
  });

  it('stops asking and closes the connection when it is stopped', () => {
    center.start();
    count(1);

    center.stop();

    expect(socket.close).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(POLL_MS * 2);
    controller.expectNone(COUNT);
  });
});
