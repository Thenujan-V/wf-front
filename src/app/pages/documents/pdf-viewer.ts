import { Component, DestroyRef, ElementRef, InjectionToken, afterRenderEffect, inject, input, signal, untracked, viewChild } from '@angular/core';

export interface PdfPage {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(params: { canvas: HTMLCanvasElement; viewport: unknown }): { promise: Promise<unknown> };
}

export interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  /** Frees the document and the pdf.js worker created for it. */
  destroy?(): unknown;
}

/** Opens a PDF with pdf.js; loaded only when a PDF is shown, so pdf.js stays out of every other page. */
export const PDF_LOADER = new InjectionToken<(url: string) => Promise<PdfDocument>>('PDF_LOADER', {
  providedIn: 'root',
  factory: () => loadWithPdfJs,
});

async function loadWithPdfJs(url: string): Promise<PdfDocument> {
  const pdfjs = await import('pdfjs-dist');
  // Served from the app's root (angular.json assets).
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return (await pdfjs.getDocument({ url }).promise) as unknown as PdfDocument;
}

/** Spec §6: PDFs are shown with pdf.js. Long documents show their first pages; the rest is a download away. */
@Component({
  selector: 'app-pdf-viewer',
  template: `
    @if (error(); as message) {
      <p data-testid="pdf-error" class="text-sm text-danger-text">{{ message }}</p>
    }
    <div #pages class="space-y-4"></div>
    @if (more(); as m) {
      <p data-testid="pdf-more" class="mt-2 text-xs text-muted">
        Showing the first {{ m.shown }} of {{ m.total }} pages. Download the file to see the rest.
      </p>
    }
  `,
})
export class PdfViewer {
  static readonly MAX_PAGES = 20;

  private readonly load = inject(PDF_LOADER);
  readonly url = input.required<string>();
  private readonly pages = viewChild.required<ElementRef<HTMLElement>>('pages');

  protected readonly error = signal<string | null>(null);
  protected readonly more = signal<{ shown: number; total: number } | null>(null);
  private run = 0;
  private shown: PdfDocument | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.run++;
      this.close();
    });
    afterRenderEffect(() => {
      const url = this.url();
      untracked(() => void this.render(url));
    });
  }

  private close(): void {
    void this.shown?.destroy?.();
    this.shown = null;
  }

  private async render(url: string): Promise<void> {
    const run = ++this.run;
    this.close();
    const host = this.pages().nativeElement;
    host.replaceChildren();
    this.error.set(null);
    this.more.set(null);
    try {
      const pdf = await this.load(url);
      if (run !== this.run) {
        void pdf.destroy?.(); // a newer PDF (or none) is wanted now
        return;
      }
      this.shown = pdf;
      const count = Math.min(pdf.numPages, PdfViewer.MAX_PAGES);
      for (let n = 1; n <= count; n++) {
        const page = await pdf.getPage(n);
        if (run !== this.run) {
          return;
        }
        const viewport = page.getViewport({ scale: 1.25 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.className = 'mx-auto block max-w-full shadow';
        canvas.setAttribute('data-testid', 'pdf-page');
        host.appendChild(canvas);
        await page.render({ canvas, viewport }).promise;
      }
      if (pdf.numPages > count) {
        this.more.set({ shown: count, total: pdf.numPages });
      }
    } catch {
      if (run === this.run) {
        this.error.set('This PDF could not be shown. Download it instead.');
      }
    }
  }
}
