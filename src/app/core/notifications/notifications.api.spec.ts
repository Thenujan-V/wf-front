import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { NotificationsApi } from './notifications.api';

describe('NotificationsApi', () => {
  let api: NotificationsApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(NotificationsApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('asks for a page of the person\'s notifications', () => {
    api.page().subscribe();
    const first = controller.expectOne((r) => r.url === '/api/notifications/notifications');
    expect(first.request.params.get('unread')).toBe('false');
    expect(first.request.params.get('page')).toBe('0');
    expect(first.request.params.get('size')).toBe('20');
    expect(first.request.context.get(SILENT_ERRORS)).toBe(false);
    first.flush({ items: [], total: 0, unread: 0, page: 0, size: 20 });

    api.page({ unreadOnly: true, page: 2, size: 10 }, true).subscribe();
    const second = controller.expectOne((r) => r.url === '/api/notifications/notifications');
    expect(second.request.params.get('unread')).toBe('true');
    expect(second.request.params.get('page')).toBe('2');
    expect(second.request.params.get('size')).toBe('10');
    expect(second.request.context.get(SILENT_ERRORS)).toBe(true);
    second.flush({ items: [], total: 0, unread: 0, page: 2, size: 10 });
  });

  it('asks for the unread count quietly, since nobody asked for it', () => {
    let count = -1;
    api.unreadCount().subscribe((n) => (count = n));

    const req = controller.expectOne('/api/notifications/notifications/unread-count');
    expect(req.request.context.get(SILENT_ERRORS)).toBe(true);
    req.flush({ count: 4 });
    expect(count).toBe(4);
  });

  it('marks one or all as read', () => {
    api.markRead('n/1').subscribe();
    const one = controller.expectOne('/api/notifications/notifications/n%2F1/read');
    expect(one.request.method).toBe('POST');
    one.flush(null);

    api.markAllRead().subscribe();
    const all = controller.expectOne('/api/notifications/notifications/read-all');
    expect(all.request.method).toBe('POST');
    all.flush(null);
  });

  it('reads and replaces the person\'s preferences', () => {
    const preferences = [{ kind: 'TASK_ASSIGNED', inApp: true, email: false }];
    api.preferences(true).subscribe();
    const read = controller.expectOne('/api/notifications/preferences');
    expect(read.request.method).toBe('GET');
    expect(read.request.context.get(SILENT_ERRORS)).toBe(true);
    read.flush(preferences);

    api.savePreferences(preferences).subscribe();
    const save = controller.expectOne('/api/notifications/preferences');
    expect(save.request.method).toBe('PUT');
    expect(save.request.body).toEqual({ preferences });
    save.flush(preferences);
  });
});
