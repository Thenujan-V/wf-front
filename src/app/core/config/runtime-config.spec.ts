import { loadRuntimeConfig } from './runtime-config';

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;
}

describe('loadRuntimeConfig', () => {
  it('returns issuer and clientId', async () => {
    const config = await loadRuntimeConfig(fakeFetch(200, { issuer: 'http://kc/realms/wms', clientId: 'wms-frontend', extra: 1 }));
    expect(config).toEqual({ issuer: 'http://kc/realms/wms', clientId: 'wms-frontend' });
  });

  it('keeps the embedding settings when present', async () => {
    const config = await loadRuntimeConfig(fakeFetch(200, {
      issuer: 'i', clientId: 'c', embedAllowedOrigins: ['http://docs', 3], auradocsViewerUrl: 'http://docs/view?docId={docId}',
    }));
    expect(config).toEqual({
      issuer: 'i', clientId: 'c', embedAllowedOrigins: ['http://docs'], auradocsViewerUrl: 'http://docs/view?docId={docId}',
    });
  });

  it('reads the file it is given', async () => {
    const fetchFn = vi.fn(fakeFetch(200, { issuer: 'i', clientId: 'c' }));
    await loadRuntimeConfig(fetchFn, '/config.auradocs.json');
    expect(fetchFn).toHaveBeenCalledWith('/config.auradocs.json', { cache: 'no-store' });
  });

  it('rejects a config without clientId', async () => {
    await expect(loadRuntimeConfig(fakeFetch(200, { issuer: 'x' }))).rejects.toThrow(/clientId/);
  });

  it('rejects an HTTP error', async () => {
    await expect(loadRuntimeConfig(fakeFetch(404, null))).rejects.toThrow(/404/);
  });
});
