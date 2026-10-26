import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DocumentsApi } from '../../core/documents/documents.api';
import { RichTextEditor } from '../../core/documents/rich-text-editor';
import { problemMessage } from '../../core/http/problem.interceptor';

type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'failed';

/** Why editing stopped, and whether reloading can start it again. */
interface Problem {
  message: string;
  canReload: boolean;
}

/**
 * Writing a document (written-documents spec §4). Opening takes the check-out; the text is saved a moment after
 * typing stops, one save at a time, each against the revision the last one returned. Anything that means the text
 * can no longer be saved here stops the editing and says why, with the text still on screen.
 */
@Component({
  selector: 'app-document-editor',
  imports: [RichTextEditor, RouterLink],
  templateUrl: './document-editor.html',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class DocumentEditorPage implements OnDestroy {
  static readonly SAVE_DELAY_MS = 1500;
  static readonly RETRY_DELAY_MS = 5000;

  private readonly api = inject(DocumentsApi);
  private readonly router = inject(Router);

  /** Route parameter :id. */
  readonly id = input.required<string>();

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly failure = signal('');
  protected readonly name = signal('');
  /** The text the editor starts from; changed only when (re)loaded. */
  protected readonly loaded = signal('');
  protected readonly status = signal<SaveStatus>('saved');
  protected readonly problem = signal<Problem | null>(null);
  protected readonly canEdit = signal(false);
  protected readonly editing = computed(() => this.canEdit() && !this.problem());

  private revision = 0;
  /** What the person has typed that the server does not have yet. */
  private pending: string | null = null;
  private saving = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private afterSave: (() => void) | null = null;
  /** Whether this page took the check-out and still has it to give back. */
  private holding = false;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.open(id));
    });
  }

  /**
   * Leaving by any road gives the check-out back, so the next person can write (spec §4). Done does it before it
   * leaves; this covers Back, a menu link and the like. Closing the tab is not covered: the page gets no chance.
   */
  ngOnDestroy(): void {
    this.clearTimer();
    this.release();
  }

  private release(): void {
    if (this.holding) {
      this.holding = false;
      this.api.cancelCheckout(this.id(), true).subscribe({ error: () => {} });
    }
  }

  hasUnsavedChanges(): boolean {
    return this.status() !== 'saved';
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  /** Takes the check-out, then reads the text. Someone else's check-out still shows the text, read-only. */
  protected open(id: string): void {
    this.clearTimer();
    this.pending = null;
    this.saving = false;
    this.state.set('loading');
    this.problem.set(null);
    this.status.set('saved');
    this.api.checkout(id).subscribe({
      next: (document) => {
        this.holding = true;
        this.name.set(document.name);
        this.read(id, null);
      },
      error: (error: unknown) => {
        const code = codeOf(error);
        if (code === 'DOC_CHECKED_OUT') {
          this.read(id, { message: 'This document is being edited by someone else. You can read it, but not change it.', canReload: true });
        } else {
          this.fail(error);
        }
      },
    });
  }

  private read(id: string, problem: Problem | null): void {
    this.api.draft(id, true).subscribe({
      next: (draft) => {
        this.revision = draft.revision;
        this.loaded.set(draft.html);
        this.canEdit.set(draft.editable);
        this.problem.set(problem ?? (draft.editable ? null
          : { message: 'This document cannot be changed right now.', canReload: true }));
        this.state.set('ready');
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.failure.set(error instanceof HttpErrorResponse ? problemMessage(error) : 'This document could not be opened.');
    this.state.set('failed');
  }

  protected typed(html: string): void {
    if (!this.editing()) {
      return;
    }
    this.pending = html;
    this.status.set('unsaved');
    this.schedule(DocumentEditorPage.SAVE_DELAY_MS);
  }

  private schedule(delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => this.save(), delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private save(): void {
    this.clearTimer();
    if (this.saving || this.pending === null || this.problem()) {
      return;
    }
    const html = this.pending;
    this.pending = null;
    this.saving = true;
    this.status.set('saving');
    this.api.saveDraft(this.id(), html, this.revision).subscribe({
      next: (draft) => {
        this.saving = false;
        this.revision = draft.revision;
        if (this.pending !== null) {
          this.status.set('unsaved');
          this.save(); // typed while this save was on its way
          return;
        }
        this.status.set('saved');
        const then = this.afterSave;
        this.afterSave = null;
        then?.();
      },
      error: (error: unknown) => {
        this.saving = false;
        this.pending ??= html; // keep the newest text for the next try
        this.status.set('failed');
        this.afterSave = null;
        const code = codeOf(error);
        const stopped = stopReason(code);
        if (code === 'DOC_NOT_CHECKED_OUT' || code === 'DOC_CHECKED_OUT') {
          this.holding = false; // the server says it is no longer ours to give back
        }
        if (stopped) {
          this.problem.set(stopped);
        } else {
          this.schedule(DocumentEditorPage.RETRY_DELAY_MS);
        }
      },
    });
  }

  /** Saves what is left, gives the check-out back and returns to the document. */
  protected done(): void {
    const back = () => void this.router.navigate(['/documents', this.id()]);
    const leave = () => {
      if (!this.holding) {
        back();
        return;
      }
      this.holding = false;
      this.api.cancelCheckout(this.id(), true).subscribe({ next: back, error: back });
    };
    if (!this.editing()) {
      leave();
    } else if (this.pending !== null || this.saving) {
      this.afterSave = leave;
      this.save();
    } else {
      leave();
    }
  }
}

function codeOf(error: unknown): string | null {
  const body = error instanceof HttpErrorResponse ? (error.error as { code?: unknown } | null) : null;
  return typeof body?.code === 'string' ? body.code : null;
}

/** The refusals that mean saving here is over, with what to tell the person; null for a failure worth retrying. */
function stopReason(code: string | null): Problem | null {
  switch (code) {
    case 'DOC_DRAFT_CHANGED':
      return { message: 'This document was changed somewhere else, perhaps in another tab. Reload to see the latest text; what you typed since your last save will be lost.', canReload: true };
    case 'DOC_NOT_CHECKED_OUT':
    case 'DOC_CHECKED_OUT':
      return { message: 'This document is no longer checked out to you, so your last changes were not saved. Reload to continue.', canReload: true };
    case 'DOC_IN_APPROVAL':
      return { message: 'This document has been sent for approval and cannot be changed until the request finishes.', canReload: false };
    case 'DOC_TEXT_TOO_LARGE':
      return { message: 'This document is too long to save. Reload, then shorten it or split it in two.', canReload: true };
    default:
      return null;
  }
}
