import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DocumentType, SearchResults } from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents.api';
import { problemMessage } from '../../core/http/problem.interceptor';

const SIZE = 20;

/** Spec §6 search: names, metadata and content, only where the person may read; the URL holds the query. */
@Component({
  selector: 'app-document-search',
  imports: [DatePipe, RouterLink],
  templateUrl: './document-search.html',
})
export class DocumentSearchPage {
  private readonly api = inject(DocumentsApi);
  private readonly router = inject(Router);

  /** Query parameters. */
  readonly q = input<string | undefined>(undefined);
  readonly folderId = input<string | undefined>(undefined);
  readonly typeId = input<string | undefined>(undefined);
  readonly page = input<string | undefined>(undefined);

  protected readonly query = linkedSignal(() => this.q() ?? '');
  protected readonly type = linkedSignal(() => this.typeId() ?? '');
  protected readonly types = signal<DocumentType[]>([]);
  protected readonly state = signal<'idle' | 'loading' | 'ready' | 'invalid' | 'failed'>('idle');
  protected readonly invalidMessage = signal('');
  protected readonly results = signal<SearchResults | null>(null);
  protected readonly pageNumber = computed(() => Math.max(0, Math.floor(Number(this.page() ?? 0)) || 0));
  protected readonly lastPage = computed(() => {
    const r = this.results();
    return r ? Math.max(0, Math.ceil(r.total / SIZE) - 1) : 0;
  });

  constructor() {
    this.api.types(true).subscribe({ next: (types) => this.types.set(types), error: () => this.types.set([]) });
    effect(() => {
      const q = this.q();
      const folderId = this.folderId();
      const typeId = this.typeId();
      const page = this.pageNumber();
      untracked(() => this.search(q, folderId, typeId, page));
    });
  }

  private search(q: string | undefined, folderId: string | undefined, typeId: string | undefined, page: number): void {
    if (!q?.trim()) {
      this.state.set('idle');
      this.results.set(null);
      return;
    }
    this.state.set('loading');
    this.api.search(q, { folderId, typeId, page, size: SIZE }, true).subscribe({
      next: (results) => {
        this.results.set(results);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 400) {
          this.invalidMessage.set(problemMessage(error));
          this.state.set('invalid');
        } else {
          this.state.set('failed');
        }
      },
    });
  }

  protected submit(): void {
    this.navigate({ q: this.query().trim() || null, typeId: this.type() || null, page: null });
  }

  protected goTo(page: number): void {
    this.navigate({ page });
  }

  protected clearFolder(): void {
    this.navigate({ folderId: null, page: null });
  }

  private navigate(change: Record<string, string | number | null>): void {
    const queryParams = { q: this.q() ?? null, folderId: this.folderId() ?? null, typeId: this.typeId() ?? null,
      page: this.pageNumber(), ...change };
    void this.router.navigate(['/documents/search'], { queryParams });
  }
}
