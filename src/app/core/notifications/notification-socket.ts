import { Injectable, InjectionToken, inject } from '@angular/core';
import { Client, StompConfig } from '@stomp/stompjs';
import { AuthService } from '../auth/auth.service';
import { PushFrame, parseFrame } from './notification.models';

/** The part of a STOMP client this app uses; specs put a stand-in behind {@link STOMP_FACTORY}. */
export interface StompLike {
  connectHeaders: Record<string, string>;
  activate(): void;
  deactivate(): Promise<void>;
  subscribe(destination: string, callback: (message: { body: string }) => void): unknown;
}

export type StompFactory = (config: StompConfig) => StompLike;

export const STOMP_FACTORY = new InjectionToken<StompFactory>('STOMP_FACTORY', {
  providedIn: 'root',
  factory: () => (config) => new Client(config),
});

/** notification-service's live endpoint, through the gateway (and the dev server's proxy). */
export const PUSH_URL = new InjectionToken<string>('PUSH_URL', {
  providedIn: 'root',
  factory: () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/notifications/ws`,
});

/** The only destination the server lets a connection subscribe to: the signed-in person's own notifications. */
export const PUSH_DESTINATION = '/user/queue/notifications';

const RECONNECT_MS = 5_000;
const HEARTBEAT_MS = 10_000;

export interface SocketHandlers {
  frame(frame: PushFrame): void;
  connected(): void;
  disconnected(): void;
}

/** Spec §8: notifications are pushed via STOMP over WebSocket. One connection, kept alive by the library. */
@Injectable({ providedIn: 'root' })
export class NotificationSocket {
  private readonly auth = inject(AuthService);
  private readonly factory = inject(STOMP_FACTORY);
  private readonly url = inject(PUSH_URL);
  private client: StompLike | null = null;

  open(handlers: SocketHandlers): void {
    if (this.client) {
      return;
    }
    const client: StompLike = this.factory({
      brokerURL: this.url,
      reconnectDelay: RECONNECT_MS,
      heartbeatIncoming: HEARTBEAT_MS,
      heartbeatOutgoing: HEARTBEAT_MS,
      // Read anew for every attempt: the server closes the connection when its token runs out, and the token the
      // person has by then is another one.
      beforeConnect: () => {
        client.connectHeaders = this.headers();
      },
      onConnect: () => {
        client.subscribe(PUSH_DESTINATION, (message) => {
          const frame = parseFrame(message.body);
          if (frame) {
            handlers.frame(frame);
          }
        });
        handlers.connected();
      },
      onWebSocketClose: () => handlers.disconnected(),
    });
    this.client = client;
    client.activate();
  }

  close(): void {
    const client = this.client;
    this.client = null;
    if (client) {
      void client.deactivate();
    }
  }

  private headers(): Record<string, string> {
    const token = this.auth.accessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
