import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { VersionView } from '../../core/documents/document.models';
import { DocumentPreview } from './document-preview';
import { PDF_LOADER } from './pdf-viewer';

describe('DocumentPreview', () => {
  function setup(version: VersionView) {
    TestBed.configureTestingModule({
      imports: [DocumentPreview],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PDF_LOADER, useValue: () => new Promise(() => {}) }],
    });
    const fixture = TestBed.createComponent(DocumentPreview);
    fixture.componentRef.setInput('documentId', 'd1');
    fixture.componentRef.setInput('version', version);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const controller = TestBed.inject(HttpTestingController);
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    return { fixture, element, controller, el };
  }

  const version = (mimeType: string): VersionView => ({
    id: 'v1', label: '1.0', major: 1, minor: 0, size: 10, mimeType, fileName: 'f', sha256: 'a', createdBy: 'bob',
    createdAt: '2026-09-28T09:00:00Z', comment: null,
  });
  const link = (mimeType: string, inline: boolean) => ({
    url: 'http://storage/objects/v1?sig=1', fileName: 'f', mimeType, inline, expiresAt: '2026-09-28T09:05:00Z',
  });

  it('asks for an inline link and shows a PDF with pdf.js', async () => {
    const s = setup(version('application/pdf'));
    s.controller.expectOne('/api/documents/documents/d1/versions/v1/content?inline=true').flush(link('application/pdf', true));
    await s.fixture.whenStable();
    expect(s.element.querySelector('app-pdf-viewer')).not.toBeNull();
  });

  it('shows images as images', async () => {
    const s = setup(version('image/png'));
    s.controller.expectOne('/api/documents/documents/d1/versions/v1/content?inline=true').flush(link('image/png', true));
    await s.fixture.whenStable();
    expect(s.el<HTMLImageElement>('preview-image').getAttribute('src')).toBe('http://storage/objects/v1?sig=1');
  });

  it('shows plain text as text, and only the start of a very long one', async () => {
    const s = setup(version('text/plain'));
    s.controller.expectOne('/api/documents/documents/d1/versions/v1/content?inline=true').flush(link('text/plain', true));
    await s.fixture.whenStable();
    const text = s.controller.expectOne('http://storage/objects/v1?sig=1');
    expect(text.request.headers.has('Authorization')).toBe(false);
    text.flush('<b>not bold</b>' + 'x'.repeat(250_000));
    await s.fixture.whenStable();

    const pre = s.el('preview-text');
    expect(pre.textContent?.startsWith('<b>not bold</b>')).toBe(true);
    expect(pre.querySelector('b')).toBeNull();
    expect(pre.textContent?.length).toBe(DocumentPreview.TEXT_LIMIT);
    expect(s.el('preview-truncated')).not.toBeNull();
  });

  it('never shows a type the server did not allow inline', async () => {
    const s = setup(version('text/html'));
    s.controller.expectOne('/api/documents/documents/d1/versions/v1/content?inline=true').flush(link('text/html', false));
    await s.fixture.whenStable();

    expect(s.el('preview-none').textContent).toContain('No preview');
    expect(s.element.querySelector('iframe, app-pdf-viewer, img, pre')).toBeNull();
    s.controller.expectNone('http://storage/objects/v1?sig=1');
  });

  it('says so when the link cannot be had', async () => {
    const s = setup(version('application/pdf'));
    s.controller.expectOne('/api/documents/documents/d1/versions/v1/content?inline=true')
      .flush({ code: 'DOC_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await s.fixture.whenStable();
    expect(s.el('preview-failed')).not.toBeNull();
  });

  it('fetches only the start of a text file, and says when there is more', async () => {
    const s = setup({ ...version('text/plain'), size: 5_000_000 });
    s.controller.expectOne('/api/documents/documents/d1/versions/v1/content?inline=true').flush(link('text/plain', true));
    await s.fixture.whenStable();
    const text = s.controller.expectOne('http://storage/objects/v1?sig=1');
    expect(text.request.headers.get('Range')).toBe('bytes=0-799999');
    text.flush('first lines', { status: 206, statusText: 'Partial Content' });
    await s.fixture.whenStable();

    expect(s.el('preview-text').textContent).toBe('first lines');
    expect(s.el('preview-truncated')).not.toBeNull();
  });

  it('keeps the preview when the same version comes back in a changed document', async () => {
    const s = setup(version('image/png'));
    s.controller.expectOne('/api/documents/documents/d1/versions/v1/content?inline=true').flush(link('image/png', true));
    await s.fixture.whenStable();

    s.fixture.componentRef.setInput('version', { ...version('image/png') });
    await s.fixture.whenStable();
    s.controller.expectNone('/api/documents/documents/d1/versions/v1/content?inline=true');
    expect(s.el('preview-image')).not.toBeNull();
  });
});
