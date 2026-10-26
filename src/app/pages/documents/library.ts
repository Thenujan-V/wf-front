import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DocumentSummary, FolderView, covers, formatSize } from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents.api';
import { FolderTreeStore } from '../../core/documents/folder-tree.store';
import { UserDirectory } from '../../core/identity/user-directory';
import { Icon } from '../../core/ui/icon';
import { ToastService } from '../../core/ui/toast.service';
import { FolderTree } from './folder-tree';
import { UploadList } from './upload-list';

/** The library: the folder tree, and one folder's path and documents beside it (spec §9 "documents"). */
@Component({
  selector: 'app-library',
  imports: [DatePipe, FolderTree, Icon, RouterLink, UploadList],
  templateUrl: './library.html',
})
export class LibraryPage {
  private readonly api = inject(DocumentsApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly directory = inject(UserDirectory);
  private readonly tree = inject(FolderTreeStore);

  /** Route parameter :id; none means the library root. */
  readonly id = input<string | undefined>(undefined);

  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  protected readonly folder = signal<FolderView | null>(null);
  protected readonly documents = signal<DocumentSummary[]>([]);
  /** Null while the form is closed. */
  protected readonly newFolderName = signal<string | null>(null);
  /** The name being typed for a new written document; null while the form is closed. */
  protected readonly newDocumentName = signal<string | null>(null);
  protected readonly renaming = signal<string | null>(null);
  protected readonly query = signal('');
  /** The folder the address names, which the tree marks even before it has loaded. */
  protected readonly currentId = computed(() => this.id() ?? this.tree.rootId());
  /** Small screens only: whether the tree is shown. */
  protected readonly treeOpen = signal(false);

  protected readonly canWrite = computed(() => covers(this.folder()?.permission, 'WRITE'));
  protected readonly canDelete = computed(() => covers(this.folder()?.permission, 'DELETE') && !!this.folder()?.parentId);
  protected readonly canManage = computed(() => covers(this.folder()?.permission, 'MANAGE'));
  protected readonly formatSize = formatSize;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  /** Answers for a folder the page has since left are ignored. */
  private loadRun = 0;

  protected load(id: string | undefined): void {
    const run = ++this.loadRun;
    // Refreshing the folder already shown keeps it on screen, with its uploads still running.
    const shown = this.folder();
    const refresh = !!shown && (id ? shown.id === id : shown.parentId === null);
    if (!refresh) {
      this.state.set('loading');
    }
    this.newFolderName.set(null);
    this.newDocumentName.set(null);
    this.renaming.set(null);
    (id ? this.api.folder(id, true) : this.api.root(true)).subscribe({
      next: (folder) => {
        if (run !== this.loadRun) {
          return;
        }
        this.folder.set(folder);
        this.tree.reveal(folder);
        this.reloadDocuments();
      },
      error: (error: unknown) => {
        if (run !== this.loadRun) {
          return;
        }
        this.state.set(error instanceof HttpErrorResponse && error.status === 404 ? 'missing' : 'failed');
        this.tree.ensureRoot(); // the tree stays usable when this folder is not
      },
    });
  }

  /** After an upload or any change to the folder's documents. */
  uploaded(): void {
    this.reloadDocuments();
  }

  private reloadDocuments(): void {
    const folder = this.folder();
    if (!folder) {
      return;
    }
    this.api.documents(folder.id, true).subscribe({
      next: (documents) => {
        if (this.folder()?.id !== folder.id) {
          return;
        }
        this.documents.set(documents);
        this.state.set('ready');
      },
      error: () => this.state.set('failed'),
    });
  }

  protected userName(id: string) {
    return this.directory.name(id);
  }

  protected createFolder(): void {
    const name = (this.newFolderName() ?? '').trim();
    const folder = this.folder();
    if (!name || !folder) {
      return;
    }
    this.api.createFolder(folder.id, name).subscribe((created) => {
      this.toasts.success(`Folder "${created.name}" created`);
      this.load(this.id());
    });
  }

  protected createDocument(): void {
    const name = (this.newDocumentName() ?? '').trim();
    const folder = this.folder();
    if (!name || !folder) {
      return;
    }
    this.api.createWritten(folder.id, name).subscribe((created) => {
      this.newDocumentName.set(null);
      void this.router.navigate(['/documents', created.id, 'edit']);
    });
  }

  protected saveRename(): void {
    const name = (this.renaming() ?? '').trim();
    const folder = this.folder();
    if (!name || !folder) {
      return;
    }
    this.api.renameFolder(folder.id, name).subscribe((renamed) => {
      this.renaming.set(null);
      this.folder.set(renamed);
      this.tree.renamed(renamed.id, renamed.name);
    });
  }

  protected deleteFolder(): void {
    const folder = this.folder();
    if (!folder?.parentId || !window.confirm(`Delete the folder "${folder.name}"? Only an empty folder can be deleted.`)) {
      return;
    }
    const parentId = folder.parentId;
    this.api.deleteFolder(folder.id).subscribe(() => {
      this.toasts.success(`Folder "${folder.name}" deleted`);
      this.tree.removed(folder.id);
      void this.router.navigate(['/documents/folders', parentId]);
    });
  }

  protected search(): void {
    const q = this.query().trim();
    if (!q) {
      return;
    }
    void this.router.navigate(['/documents/search'], { queryParams: { q, folderId: this.folder()?.id } });
  }
}
