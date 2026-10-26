import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ContentLink, DocumentView, DraftView, VersionView, covers, formatSize } from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents.api';
import { Uploader, uploadErrorMessage, uploadStatus } from '../../core/documents/uploader';
import { UserDirectory } from '../../core/identity/user-directory';
import { ToastService } from '../../core/ui/toast.service';
import { DocumentPreview } from './document-preview';
import { MetadataEditor } from './metadata-editor';
import { PdfViewer } from './pdf-viewer';
import { SendForApproval } from './send-for-approval';

/**
 * One document: who holds it, its versions and preview (spec §6). Changes need WRITE and nobody else's check-out;
 * only the holder uploads or restores a version; a folder manager may release someone else's check-out.
 */
@Component({
  selector: 'app-document-page',
  imports: [DatePipe, DocumentPreview, MetadataEditor, PdfViewer, RouterLink, SendForApproval],
  templateUrl: './document-page.html',
})
export class DocumentPage {
  private readonly api = inject(DocumentsApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly directory = inject(UserDirectory);
  private readonly uploader = inject(Uploader);

  /** Route parameter :id. */
  readonly id = input.required<string>();

  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  protected readonly document = signal<DocumentView | null>(null);
  /** The version shown in the preview; null = the current one. */
  protected readonly selected = signal<string | null>(null);
  protected readonly renaming = signal<string | null>(null);
  protected readonly major = signal(false);
  protected readonly comment = signal('');
  protected readonly versionUpload = signal<{ status: string; error: string | null } | null>(null);
  protected readonly formatSize = formatSize;
  protected readonly sending = signal(false);

  private readonly permission = computed(() => this.document()?.permission);
  protected readonly holder = computed(() => {
    const d = this.document();
    return !!d?.checkedOutBy && d.checkedOutBy === this.auth.userId();
  });
  protected readonly lockedByOther = computed(() => {
    const d = this.document();
    return !!d?.checkedOutBy && d.checkedOutBy !== this.auth.userId();
  });
  protected readonly canEdit = computed(() => covers(this.permission(), 'WRITE') && !this.lockedByOther());
  protected readonly isWritten = computed(() => this.document()?.kind === 'WRITTEN');
  /** The text being worked on, shown read-only here; editing happens on the editor page. */
  protected readonly draft = signal<DraftView | null>(null);
  /** The PDF of the text as it was sent, while the document is in approval. */
  protected readonly review = signal<ContentLink | null>(null);
  protected readonly reviewFailed = signal(false);
  protected readonly inApproval = computed(() => this.isWritten() && this.document()?.state === 'IN_APPROVAL');
  protected readonly stateLabel = computed(() => ({ DRAFT: 'Draft', IN_APPROVAL: 'In approval', APPROVED: 'Approved',
    REVISION: 'Revision in progress' })[this.document()?.state ?? 'DRAFT']);
  /** A written document is edited (on the editor page) while it is a draft or a revision. */
  protected readonly canWrite = computed(() => {
    const d = this.document();
    return !!d && d.kind === 'WRITTEN' && (d.state === 'DRAFT' || d.state === 'REVISION') && this.canEdit();
  });
  protected readonly canCheckOut = computed(() => !this.isWritten() && covers(this.permission(), 'WRITE') && !this.document()?.checkedOutBy);
  protected readonly canRelease = computed(() => this.lockedByOther() && covers(this.permission(), 'MANAGE'));
  protected readonly canDelete = computed(() => covers(this.permission(), 'DELETE') && !this.lockedByOther() && !this.inApproval());
  /** Spec §6: a library document that belongs to no request yet can be sent for approval by someone who may change it. */
  protected readonly canSend = computed(() => {
    const d = this.document();
    if (!d || !d.inLibrary || d.linkedInstanceId || !this.canEdit()) {
      return false;
    }
    // A written document is sent while it has a text being worked on; what it sends is that text, frozen.
    return d.kind === 'FILE' || (this.beingWritten() && this.draftHasText());
  });
  private readonly beingWritten = computed(() => {
    const d = this.document();
    return !!d && d.kind === 'WRITTEN' && (d.state === 'DRAFT' || d.state === 'REVISION') && d.hasDraft;
  });
  /**
   * Whether the text has any words. Sending starts the request first and attaches the document second, and the server
   * refuses an empty text: that would leave a running request that can never get its document. False until the text is
   * loaded, so the button is never offered on a guess.
   */
  private readonly draftHasText = computed(() => {
    const html = this.draft()?.html ?? '';
    return (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').trim() !== '';
  });
  /** The text is loaded and has no words: say why there is no Send button. */
  protected readonly nothingToSend = computed(() => {
    const d = this.document();
    return !!d && d.inLibrary && this.canEdit() && this.beingWritten() && this.draft() !== null && !this.draftHasText();
  });
  protected readonly previewed = computed(() => {
    const d = this.document();
    if (!d) {
      return null;
    }
    const id = this.selected() ?? d.currentVersionId;
    return d.versions.find((v) => v.id === id) ?? d.versions[0] ?? null;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  /** Answers for a document the page has since left are ignored. */
  private loadRun = 0;

  protected load(id: string): void {
    const run = ++this.loadRun;
    this.state.set('loading');
    this.selected.set(null);
    this.renaming.set(null);
    this.versionUpload.set(null);
    this.sending.set(false);
    this.draft.set(null);
    this.review.set(null);
    this.reviewFailed.set(false);
    this.api.document(id, true).subscribe({
      next: (document) => {
        if (run !== this.loadRun) {
          return;
        }
        this.document.set(document);
        this.state.set('ready');
        this.loadWritten(document, run);
      },
      error: (error: unknown) => run === this.loadRun &&
        this.state.set(error instanceof HttpErrorResponse && error.status === 404 ? 'missing' : 'failed'),
    });
  }

  /** Shows the document as the server now has it (after any change). */
  apply(document: DocumentView): void {
    if (document.id !== this.id()) {
      return; // a late answer about a document the page has since left
    }
    const previous = this.document();
    this.document.set(document);
    if (document.state !== previous?.state) {
      this.loadWritten(document, this.loadRun);
    }
  }

  /** What a written document shows besides itself: its text while it is being written, its review PDF in approval. */
  private loadWritten(document: DocumentView, run: number): void {
    this.draft.set(null);
    this.review.set(null);
    this.reviewFailed.set(false);
    if (document.kind !== 'WRITTEN') {
      return;
    }
    if (document.state === 'IN_APPROVAL') {
      this.api.review(document.id, true).subscribe({
        next: (link) => run === this.loadRun && this.review.set(link),
        error: () => run === this.loadRun && this.reviewFailed.set(true),
      });
    } else if (document.hasDraft && covers(document.permission, 'WRITE')) {
      this.api.draft(document.id, true).subscribe({ next: (draft) => run === this.loadRun && this.draft.set(draft), error: () => {} });
    }
  }

  /**
   * Opens the whole review copy in a new tab. The viewer on the page shows only the first pages of a long document,
   * and its link is short-lived, so a fresh one is asked for each time.
   */
  protected openReview(): void {
    this.api.review(this.id()).subscribe((link) => window.open(link.url, '_blank', 'noopener'));
  }

  protected sent(document: DocumentView): void {
    this.apply(document);
    this.sending.set(false);
  }

  protected userName(id: string) {
    return this.directory.name(id);
  }

  protected isCurrent(version: VersionView): boolean {
    return version.id === this.document()?.currentVersionId;
  }

  protected checkout(): void {
    this.api.checkout(this.id()).subscribe((document) => {
      this.apply(document);
      this.toasts.success('Checked out. Upload a new version, or cancel the check-out when you are done.');
    });
  }

  protected cancelCheckout(): void {
    this.api.cancelCheckout(this.id()).subscribe((document) => this.apply(document));
  }

  protected release(): void {
    const document = this.document();
    if (!document?.checkedOutBy) {
      return;
    }
    const holder = this.directory.name(document.checkedOutBy)();
    if (!window.confirm(`Release the check-out held by ${holder}? A version they have not uploaded yet will need a new check-out.`)) {
      return;
    }
    this.api.cancelCheckout(document.id).subscribe((next) => {
      this.apply(next);
      this.toasts.success('Check-out released');
    });
  }

  protected saveRename(): void {
    const name = (this.renaming() ?? '').trim();
    if (!name) {
      return;
    }
    this.api.rename(this.id(), name).subscribe((document) => {
      this.renaming.set(null);
      this.apply(document);
    });
  }

  protected download(version: VersionView): void {
    this.api.content(this.id(), version.id, false).subscribe((link) => this.openUrl(link.url));
  }

  /** The link answers with "attachment", so the browser downloads instead of navigating. */
  protected openUrl(url: string): void {
    window.location.assign(url);
  }

  protected restore(version: VersionView): void {
    this.api.restore(this.id(), version.id).subscribe((document) => {
      this.apply(document);
      this.selected.set(null);
      this.toasts.success(`Version ${version.label} restored as ${document.versions[0]?.label}`);
    });
  }

  protected remove(): void {
    const document = this.document();
    if (!document || !window.confirm(`Delete "${document.name}" and all its versions? This cannot be undone.`)) {
      return;
    }
    this.api.deleteDocument(document.id).subscribe(() => {
      this.toasts.success(`"${document.name}" deleted`);
      void this.router.navigate(document.inLibrary || !document.linkedInstanceId
        ? ['/documents/folders', document.folderId] : ['/requests', document.linkedInstanceId]);
    });
  }

  protected chooseVersion(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const comment = this.comment().trim();
    this.versionUpload.set({ status: 'Waiting…', error: null });
    const documentId = this.id();
    this.uploader.upload(file, { documentId, major: this.major(), ...(comment ? { comment } : {}) }).subscribe({
      next: (event) => {
        if (this.id() !== documentId) {
          return;
        }
        if (event.stage !== 'done') {
          this.versionUpload.set({ status: uploadStatus(event), error: null });
          return;
        }
        this.apply(event.document);
        this.versionUpload.set(null);
        this.major.set(false);
        this.comment.set('');
        this.selected.set(null);
        this.toasts.success(`Version ${event.document.versions[0]?.label} uploaded and checked in`);
      },
      error: (error: unknown) => this.versionUpload.set({ status: '', error: uploadErrorMessage(error) }),
    });
  }
}
