import { TestBed } from '@angular/core/testing';
import { StompConfig } from '@stomp/stompjs';
import { AuthService } from '../auth/auth.service';
import { PushFrame } from './notification.models';
import { NotificationSocket, PUSH_URL, STOMP_FACTORY, StompLike } from './notification-socket';

class FakeStomp implements StompLike {
  connectHeaders: Record<string, string> = {};
  activated = 0;
  deactivated = 0;
  readonly subscriptions = new Map<string, (message: { body: string }) => void>();

  constructor(readonly config: StompConfig) {}

  activate(): void {
    this.activated++;
  }

  deactivate(): Promise<void> {
    this.deactivated++;
    return Promise.resolve();
  }

  subscribe(destination: string, callback: (message: { body: string }) => void): void {
    this.subscriptions.set(destination, callback);
  }
}

/** The library calls these with arguments this app does not use. */
function call(callback: unknown): void {
  (callback as () => void)();
}

describe('NotificationSocket', () => {
  let socket: NotificationSocket;
  let clients: FakeStomp[];
  let token: string | null;

  beforeEach(() => {
    clients = [];
    token = 'token-1';
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { accessToken: () => token } },
        { provide: PUSH_URL, useValue: 'ws://app.example/api/notifications/ws' },
        {
          provide: STOMP_FACTORY,
          useValue: (config: StompConfig) => {
            const client = new FakeStomp(config);
            clients.push(client);
            return client;
          },
        },
      ],
    });
    socket = TestBed.inject(NotificationSocket);
  });

  function handlers() {
    const frames: PushFrame[] = [];
    const calls: string[] = [];
    return {
      frames,
      calls,
      frame: (frame: PushFrame) => frames.push(frame),
      connected: () => calls.push('connected'),
      disconnected: () => calls.push('disconnected'),
    };
  }

  it('connects to the push endpoint and comes back by itself when the connection drops', () => {
    socket.open(handlers());

    expect(clients).toHaveLength(1);
    expect(clients[0].activated).toBe(1);
    expect(clients[0].config.brokerURL).toBe('ws://app.example/api/notifications/ws');
    expect(clients[0].config.reconnectDelay).toBeGreaterThan(0);
  });

  it('sends the token the person has at that moment with every connect', () => {
    socket.open(handlers());

    call(clients[0].config.beforeConnect);
    expect(clients[0].connectHeaders).toEqual({ Authorization: 'Bearer token-1' });

    token = 'token-2'; // refreshed while the connection was down
    call(clients[0].config.beforeConnect);
    expect(clients[0].connectHeaders).toEqual({ Authorization: 'Bearer token-2' });

    token = null; // signed out
    call(clients[0].config.beforeConnect);
    expect(clients[0].connectHeaders).toEqual({});
  });

  it('subscribes to the person\'s own queue and hands on the frames it understands', () => {
    const h = handlers();
    socket.open(h);
    call(clients[0].config.onConnect);

    expect([...clients[0].subscriptions.keys()]).toEqual(['/user/queue/notifications']);
    expect(h.calls).toEqual(['connected']);

    const deliver = clients[0].subscriptions.get('/user/queue/notifications')!;
    deliver({ body: '{"type":"unread","notification":null,"unread":2}' });
    deliver({ body: 'garbage' });
    deliver({ body: '{"type":"other","unread":1}' });
    expect(h.frames).toEqual([{ type: 'unread', notification: null, unread: 2 }]);
  });

  it('says when the connection is lost', () => {
    const h = handlers();
    socket.open(h);
    call(clients[0].config.onConnect);
    call(clients[0].config.onWebSocketClose);

    expect(h.calls).toEqual(['connected', 'disconnected']);
  });

  it('keeps one connection however often it is opened, and can be closed and opened again', () => {
    socket.open(handlers());
    socket.open(handlers());
    expect(clients).toHaveLength(1);

    socket.close();
    expect(clients[0].deactivated).toBe(1);
    socket.close();
    expect(clients[0].deactivated).toBe(1);

    socket.open(handlers());
    expect(clients).toHaveLength(2);
  });
});
