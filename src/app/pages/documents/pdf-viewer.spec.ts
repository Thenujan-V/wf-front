import { TestBed } from '@angular/core/testing';
import { PDF_LOADER, PdfDocument, PdfViewer } from './pdf-viewer';

describe('PdfViewer', () => {
  function setup(loader: (url: string) => Promise<PdfDocument>) {
    TestBed.configureTestingModule({ imports: [PdfViewer], providers: [{ provide: PDF_LOADER, useValue: loader }] });
    const fixture = TestBed.createComponent(PdfViewer);
    fixture.componentRef.setInput('url', 'http://storage/plan.pdf');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element };
  }

  const page = {
    getViewport: () => ({ width: 400, height: 600 }),
    render: () => ({ promise: Promise.resolve() }),
  };

  it('draws each page onto a canvas, at most twenty', async () => {
    const urls: string[] = [];
    const { element } = setup((url) => {
      urls.push(url);
      return Promise.resolve({ numPages: 25, getPage: () => Promise.resolve(page) });
    });

    await vi.waitFor(() => expect(element.querySelectorAll('[data-testid="pdf-page"]').length).toBe(20));
    expect(urls).toEqual(['http://storage/plan.pdf']);
    await vi.waitFor(() => expect(element.querySelector('[data-testid="pdf-more"]')?.textContent).toContain('first 20 of 25 pages'));
  });

  it('says so when the PDF cannot be read', async () => {
    const { element } = setup(() => Promise.reject(new Error('Invalid PDF structure')));

    await vi.waitFor(() => expect(element.querySelector('[data-testid="pdf-error"]')?.textContent).toContain('could not be shown'));
  });

  it('closes each PDF (and its pdf.js worker) when another is shown or the viewer goes away', async () => {
    const destroyed: string[] = [];
    const { fixture, element } = setup((url) => Promise.resolve({
      numPages: 1, getPage: () => Promise.resolve(page), destroy: () => { destroyed.push(url); },
    }));
    await vi.waitFor(() => expect(element.querySelectorAll('[data-testid="pdf-page"]').length).toBe(1));

    fixture.componentRef.setInput('url', 'http://storage/other.pdf');
    fixture.detectChanges();
    await vi.waitFor(() => expect(destroyed).toEqual(['http://storage/plan.pdf']));

    await vi.waitFor(() => expect(element.querySelectorAll('[data-testid="pdf-page"]').length).toBe(1));
    fixture.destroy();
    expect(destroyed).toEqual(['http://storage/plan.pdf', 'http://storage/other.pdf']);
  });
});
