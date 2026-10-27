import { InjectionToken } from '@angular/core';

/** Per-customer settings served as /config.json so one build runs in every instance. */
export interface RuntimeConfig {
  issuer: string;
  clientId: string;
  /** auraDOCS page that shows a document; {docId} is replaced with the document id. */
  auradocsViewerUrl?: string;
}

export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>('RUNTIME_CONFIG');

/** Set at build time by a configuration that serves another file, e.g. the auraDOCS one. */
declare const WMS_CONFIG_URL: string | undefined;

export const CONFIG_URL = typeof WMS_CONFIG_URL === 'string' ? WMS_CONFIG_URL : '/config.json';

export async function loadRuntimeConfig(
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
  url = CONFIG_URL,
): Promise<RuntimeConfig> {
  const response = await fetchFn(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  }
  const raw: unknown = await response.json();
  if (!isRuntimeConfig(raw)) {
    throw new Error(`${url} must contain string "issuer" and "clientId" values`);
  }
  const config: RuntimeConfig = { issuer: raw.issuer, clientId: raw.clientId };
  if (typeof raw.auradocsViewerUrl === 'string' && raw.auradocsViewerUrl) {
    config.auradocsViewerUrl = raw.auradocsViewerUrl;
  }
  return config;
}

function isRuntimeConfig(value: unknown): value is RuntimeConfig {
  const candidate = value as Partial<RuntimeConfig> | null;
  return typeof candidate?.issuer === 'string' && typeof candidate?.clientId === 'string';
}
