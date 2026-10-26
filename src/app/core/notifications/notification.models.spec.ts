import { appPath, kindLabel, parseFrame } from './notification.models';

describe('notification models', () => {
  it('follows only links that stay inside the app', () => {
    expect(appPath('/inbox')).toBe('/inbox');
    expect(appPath('/requests/i-1')).toBe('/requests/i-1');
    for (const bad of [null, undefined, '', 'inbox', '//evil.example/x', 'https://evil.example', 'javascript:alert(1)', '/\\evil.example']) {
      expect(appPath(bad)).toBeNull();
    }
  });

  it('understands the two frames the server sends', () => {
    const notification = { id: 'n1', kind: 'TASK_ASSIGNED', title: 'New task: Review', body: 'You have a new task.', link: '/inbox',
      createdAt: '2026-10-01T09:00:00Z', readAt: null };

    expect(parseFrame(JSON.stringify({ type: 'created', notification, unread: 3 }))).toEqual({ type: 'created', notification, unread: 3 });
    expect(parseFrame('{"type":"unread","notification":null,"unread":0}')).toEqual({ type: 'unread', notification: null, unread: 0 });
  });

  it('ignores anything else that comes over the connection', () => {
    for (const bad of ['', 'not json', 'null', '[]', '{"type":"deleted","unread":1}', '{"type":"unread"}',
      '{"type":"unread","unread":-1}', '{"type":"unread","unread":"3"}', '{"type":"created","unread":1}',
      '{"type":"created","notification":{"id":7},"unread":1}']) {
      expect(parseFrame(bad)).toBeNull();
    }
  });

  it('names the kinds people can choose, and falls back to the kind itself', () => {
    expect(kindLabel('TASK_ASSIGNED').label).toBe('A task is assigned to me');
    expect(kindLabel('SOMETHING_NEW')).toEqual({ label: 'SOMETHING_NEW', hint: '' });
  });
});
