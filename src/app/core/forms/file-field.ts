import { Component, DestroyRef, afterNextRender, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Uploader, uploadErrorMessage, uploadStatus } from '../documents/uploader';
import { FileRef, MAX_FILES } from './form.models';

interface Pending {
  id: number;
  file: File;
  status: string;
  error: string | null;
}

/**
 * Spec §5 file field: each chosen file is uploaded at once as a staged file (only its uploader can read it), and the
 * field holds references to them. The request gets them as attachments when the form is submitted.
 */
@Component({
  selector: 'app-file-field',
  templateUrl: './file-field.html',
})
export class FileField {
  private readonly uploader = inject(Uploader);
  private readonly destroyRef = inject(DestroyRef);

  readonly fieldId = input.required<string>();
  readonly files = input<FileRef[]>([]);
  readonly readOnly = input(false);
  readonly changed = output<FileRef[]>();
  /** True while an upload is still running: the form must not be submitted without that file. */
  readonly busy = output<boolean>();

  /** The latest list, also when two uploads finish before the form passes the new value back. */
  protected readonly current = linkedSignal(() => this.files());
  protected readonly pending = signal<Pending[]>([]);
  protected readonly full = computed(() => this.current().length + this.running() >= MAX_FILES);
  private nextId = 0;

  constructor() {
    // A field shown again after a rule hid it starts with nothing uploading.
    afterNextRender(() => this.report());
  }

  protected choose(input: HTMLInputElement): void {
    const room = Math.max(MAX_FILES - this.current().length - this.running(), 0);
    const files = Array.from(input.files ?? []).slice(0, room);
    input.value = '';
    files.forEach((file) => this.start(file));
  }

  protected remove(ref: FileRef): void {
    this.update(this.current().filter((f) => f.documentId !== ref.documentId));
  }

  protected retry(entry: Pending): void {
    this.dismiss(entry.id);
    this.start(entry.file);
  }

  protected dismiss(id: number): void {
    this.pending.update((list) => list.filter((p) => p.id !== id));
    this.report();
  }

  private start(file: File): void {
    const id = this.nextId++;
    this.pending.update((list) => [...list, { id, file, status: 'Waiting…', error: null }]);
    this.report();
    // Leaving the form stops its uploads; a staged file nobody submits is removed after a day.
    this.uploader.upload(file, { staged: true }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (event) => {
        if (event.stage !== 'done') {
          this.patch(id, { status: uploadStatus(event) });
          return;
        }
        this.pending.update((list) => list.filter((p) => p.id !== id));
        this.update([...this.current(), { documentId: event.document.id, name: event.document.name }]);
        this.report();
      },
      error: (error: unknown) => {
        this.patch(id, { status: 'Not uploaded', error: uploadErrorMessage(error) });
        this.report();
      },
    });
  }

  private running(): number {
    return this.pending().filter((p) => !p.error).length;
  }

  private update(files: FileRef[]): void {
    this.current.set(files);
    this.changed.emit(files);
  }

  private patch(id: number, change: Partial<Pending>): void {
    this.pending.update((list) => list.map((p) => (p.id === id ? { ...p, ...change } : p)));
  }

  private report(): void {
    this.busy.emit(this.running() > 0);
  }
}
