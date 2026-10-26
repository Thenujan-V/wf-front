import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DocumentView } from '../../core/documents/document.models';
import { UploadTarget, Uploader, uploadErrorMessage, uploadStatus } from '../../core/documents/uploader';

interface Entry {
  id: number;
  file: File;
  status: string;
  percent: number;
  done: boolean;
  error: string | null;
}

/** Files being uploaded into a folder or a request, one row each, with progress and a way to try again. */
@Component({
  selector: 'app-upload-list',
  templateUrl: './upload-list.html',
})
export class UploadList {
  private readonly uploader = inject(Uploader);
  private readonly destroyRef = inject(DestroyRef);

  /** Where new documents go: a library folder, or (spec §6) a request's attachments. Exactly one is given. */
  readonly folderId = input<string | null>(null);
  readonly instanceId = input<string | null>(null);
  readonly uploaded = output<DocumentView>();

  protected readonly entries = signal<Entry[]>([]);
  private nextId = 0;

  protected choose(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    input.value = '';
    files.forEach((file) => this.start(file));
  }

  protected retry(entry: Entry): void {
    this.dismiss(entry.id);
    this.start(entry.file);
  }

  protected dismiss(id: number): void {
    this.entries.update((list) => list.filter((e) => e.id !== id));
  }

  private start(file: File): void {
    const id = this.nextId++;
    this.entries.update((list) => [...list, { id, file, status: 'Waiting…', percent: 0, done: false, error: null }]);
    // Leaving the folder stops its uploads rather than letting them finish where nobody sees the result.
    this.uploader.upload(file, this.target()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (event) => {
        this.patch(id, {
          status: uploadStatus(event),
          percent: event.stage === 'sending' ? event.percent : event.stage === 'done' ? 100 : 0,
          done: event.stage === 'done',
        });
        if (event.stage === 'done') {
          this.uploaded.emit(event.document);
        }
      },
      error: (error: unknown) => this.patch(id, { status: 'Not uploaded', error: uploadErrorMessage(error) }),
    });
  }

  private target(): UploadTarget {
    const instanceId = this.instanceId();
    return instanceId ? { instanceId } : { folderId: this.folderId()! };
  }

  private patch(id: number, change: Partial<Entry>): void {
    this.entries.update((list) => list.map((e) => (e.id === id ? { ...e, ...change } : e)));
  }
}
