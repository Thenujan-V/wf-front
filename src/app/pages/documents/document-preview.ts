import { HttpBackend, HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ContentLink, VersionView } from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents.api';
import { PdfViewer } from './pdf-viewer';

type Kind = 'pdf' | 'image' | 'text' | 'none';

/**
 * Shows one version inline when the server allows it (spec §6: PDF, images, text). Text is rendered as text, never
 * as HTML, and only its start is shown; anything else is download-only.
 */
@Component({
  selector: 'app-document-preview',
  imports: [PdfViewer],
  templateUrl: './document-preview.html',
})
export class DocumentPreview {
  static readonly TEXT_LIMIT = 200_000;

  private readonly api = inject(DocumentsApi);
  /** Storage is another origin: no token, no toasts. */
  private readonly storage = new HttpClient(inject(HttpBackend));

  readonly documentId = input.required<string>();
  readonly version = input.required<VersionView>();

  protected readonly link = signal<ContentLink | null>(null);
  protected readonly failed = signal(false);
  protected readonly text = signal<string | null>(null);
  protected readonly truncated = signal(false);
  protected readonly kind = computed<Kind>(() => {
    const link = this.link();
    if (!link?.inline) {
      return 'none';
    }
    const mime = link.mimeType.split(';')[0].trim().toLowerCase();
    return mime === 'application/pdf' ? 'pdf' : mime.startsWith('image/') ? 'image' : mime === 'text/plain' ? 'text' : 'none';
  });

  /** The preview depends on which version it is, not on the object that describes it. */
  private readonly versionId = computed(() => this.version().id);

  constructor() {
    effect(() => {
      const documentId = this.documentId();
      const versionId = this.versionId();
      untracked(() => this.load(documentId, versionId));
    });
  }

  private load(documentId: string, versionId: string): void {
    this.link.set(null);
    this.failed.set(false);
    this.text.set(null);
    this.truncated.set(false);
    this.api.content(documentId, versionId, true, true).subscribe({
      next: (link) => {
        if (this.versionId() !== versionId) {
          return;
        }
        this.link.set(link);
        if (this.kind() === 'text') {
          this.loadText(link.url, versionId);
        }
      },
      error: () => this.failed.set(true),
    });
  }

  /** Only the start is fetched (UTF-8 needs at most 4 bytes a character), so a huge file never fills the tab. */
  private loadText(url: string, versionId: string): void {
    const bytes = DocumentPreview.TEXT_LIMIT * 4;
    this.storage.get(url, { responseType: 'text', headers: { Range: `bytes=0-${bytes - 1}` } }).subscribe({
      next: (text) => {
        if (this.versionId() !== versionId) {
          return;
        }
        this.truncated.set(text.length > DocumentPreview.TEXT_LIMIT || this.version().size > bytes);
        this.text.set(text.slice(0, DocumentPreview.TEXT_LIMIT));
      },
      error: () => this.failed.set(true),
    });
  }
}
