import { InjectionToken } from '@angular/core';

/** Per-customer settings served as /config.json so one build runs in every instance. */
export interface RuntimeConfig {
  issuer: string;
  clientId: string;
}

export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>('RUNTIME_CONFIG');

export async function loadRuntimeConfig(
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<RuntimeConfig> {
  const response = await fetchFn('/config.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load /config.json (HTTP ${response.status})`);
  }
  const raw: unknown = await response.json();
  if (!isRuntimeConfig(raw)) {
    throw new Error('/config.json must contain string "issuer" and "clientId" values');
  }
  return { issuer: raw.issuer, clientId: raw.clientId };
}

function isRuntimeConfig(value: unknown): value is RuntimeConfig {
  const candidate = value as Partial<RuntimeConfig> | null;
  return typeof candidate?.issuer === 'string' && typeof candidate?.clientId === 'string';
}
