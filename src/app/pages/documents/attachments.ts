import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { DocumentSummary, DocumentView, formatSize } from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents.api';
import { WorkflowApi } from '../../core/workflow/workflow.api';
import { UploadList } from './upload-list';

/**
 * A request's documents (spec §6): readable by whoever may see the request. While it runs, its initiator and whoever
 * holds one of its tasks can add more.
 */
@Component({
  selector: 'app-attachments',
  imports: [DatePipe, RouterLink, UploadList],
  templateUrl: './attachments.html',
})
export class Attachments {
  private readonly documents = inject(DocumentsApi);
  private readonly workflow = inject(WorkflowApi);

  readonly instanceId = input.required<string>();

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly items = signal<DocumentSummary[]>([]);
  protected readonly canAttach = signal(false);
  protected readonly formatSize = formatSize;

  /** Answers for a request the panel has since left are ignored. */
  private loadRun = 0;

  constructor() {
    effect(() => {
      const id = this.instanceId();
      untracked(() => this.load(id));
    });
  }

  protected load(id = this.instanceId()): void {
    const run = ++this.loadRun;
    this.state.set('loading');
    this.canAttach.set(false);
    forkJoin([this.documents.instanceDocuments(id, true), this.workflow.access(id, true)]).subscribe({
      next: ([items, access]) => {
        if (run !== this.loadRun) {
          return;
        }
        this.items.set(items);
        this.canAttach.set(access.canAttach);
        this.state.set('ready');
      },
      error: () => run === this.loadRun && this.state.set('failed'),
    });
  }

  protected added(document: DocumentView): void {
    const summary: DocumentSummary = {
      id: document.id, folderId: document.folderId, name: document.name, typeId: document.typeId,
      currentVersion: document.versions.find((v) => v.id === document.currentVersionId) ?? null,
      checkedOutBy: document.checkedOutBy, checkedOutAt: document.checkedOutAt, updatedAt: document.updatedAt, kind: document.kind,
    };
    this.items.update((list) => [...list.filter((d) => d.id !== summary.id), summary]);
  }
}
