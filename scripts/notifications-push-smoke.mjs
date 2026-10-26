// carol starts an expense request; bob, connected through the gateway, is told live. A connection without a token is
// refused. Needs the samples loaded (deploy/samples/load.sh) and notification-service running.
// Usage: node frontend/scripts/notifications-push-smoke.mjs      (WMS_GATEWAY=http://localhost:4200 goes through the dev server)
import { Client } from '@stomp/stompjs';

const GATEWAY = process.env.WMS_GATEWAY ?? 'http://localhost:8080';
const ISSUER = process.env.WMS_OIDC_ISSUER ?? 'http://localhost:8180/realms/wms';
const SOCKET = `${GATEWAY.replace(/^http/, 'ws')}/api/notifications/ws`;
/** How long the connection must stay open: longer than the gateway's 30-second response timeout. */
const HOLD_MS = Number(process.env.WMS_PUSH_HOLD_MS ?? 40000);

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function token(username) {
  const response = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'password', client_id: 'wms-dev-cli', username, password: 'wms-dev-123' }),
  });
  if (!response.ok) {
    fail(`no token for ${username}: HTTP ${response.status}`);
  }
  return (await response.json()).access_token;
}

/** Resolves with { outcome: 'connected' | 'refused', client }. */
function connect(connectHeaders, onFrame) {
  return new Promise((resolve) => {
    const client = new Client({
      brokerURL: SOCKET,
      connectHeaders,
      reconnectDelay: 0,
      onConnect: () => {
        client.subscribe('/user/queue/notifications', (message) => onFrame?.(JSON.parse(message.body)));
        resolve({ outcome: 'connected', client });
      },
      onStompError: () => resolve({ outcome: 'refused', client }),
      onWebSocketError: () => resolve({ outcome: 'refused', client }),
      onWebSocketClose: () => resolve({ outcome: 'refused', client }),
    });
    client.activate();
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const bob = await token('bob');
const carol = await token('carol');

const anonymous = await connect({});
await anonymous.client.deactivate();
if (anonymous.outcome !== 'refused') {
  fail('a connection without a token was accepted');
}
console.log('a connection without a token is refused');

const key = `PUSH-${Date.now()}`;
let told;
const arrived = new Promise((resolve) => (told = resolve));
const live = await connect({ Authorization: `Bearer ${bob}` }, (frame) => {
  if (frame.type === 'created' && frame.notification?.body?.includes(key)) {
    told(frame);
  }
});
if (live.outcome !== 'connected') {
  fail(`bob could not connect to ${SOCKET}`);
}
console.log(`bob is connected to ${SOCKET}`);
await wait(1000); // the subscription takes a moment to take effect

const started = await fetch(`${GATEWAY}/api/workflow/instances`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${carol}`, 'content-type': 'application/json' },
  body: JSON.stringify({ processKey: 'expense-request', businessKey: key, data: { amount: 500, category: 'travel', purpose: 'Taxi' } }),
});
if (!started.ok) {
  fail(`carol could not start a request: HTTP ${started.status}`);
}
console.log(`request ${key} started`);

const connectedAt = Date.now();
const frame = await Promise.race([arrived, wait(30000).then(() => null)]);
if (!frame) {
  await live.client.deactivate();
  fail('bob was not told live within 30 seconds');
}
console.log(`bob is told live: "${frame.notification.title}" (${frame.unread} unread)`);

// A proxy with a short idle or response timeout would cut the connection; heartbeats must keep it open.
await wait(Math.max(0, HOLD_MS - (Date.now() - connectedAt)));
const stillOpen = live.client.connected;
await live.client.deactivate();
if (!stillOpen) {
  fail(`the connection did not stay open for ${HOLD_MS / 1000} seconds`);
}
console.log(`the connection stayed open for ${HOLD_MS / 1000} seconds`);
process.exit(0);
