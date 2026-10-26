import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ToastService } from '../../../core/ui/toast.service';
import { ProcessDefinitionsApi } from '../../../core/workflow/process-definitions.api';
import { ProcessSummary } from '../../../core/workflow/process.models';
import { keyFromName } from '../key-from-name';
import { PROCESS_KEY } from './process-model';

@Component({
  selector: 'app-processes-list',
  imports: [DatePipe, RouterLink],
  templateUrl: './processes-list.html',
})
export class ProcessesListPage {
  private readonly api = inject(ProcessDefinitionsApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly processes = signal<ProcessSummary[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly newKey = signal('');
  protected readonly newName = signal('');
  /** Once the person types a key of their own, the name no longer fills it in. */
  private readonly keyTyped = signal(false);
  private readonly keyValid = computed(() => PROCESS_KEY.test(this.newKey().trim()));
  protected readonly keyError = computed(() => {
    const key = this.newKey().trim();
    if (!key) {
      return null;
    }
    if (!this.keyValid()) {
      // A key still being filled in from the name is not the person's mistake yet.
      return this.keyTyped() ? 'Use lowercase letters, digits and dashes (2 to 100 characters), e.g. travel-request.' : null;
    }
    return this.processes()?.some((p) => p.key === key) ? `A process "${key}" already exists; open it from the list.` : null;
  });
  protected readonly canCreate = computed(() => this.keyValid() && !this.keyError());

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.failed.set(false);
    this.api.list().subscribe({ next: (list) => this.processes.set(list), error: () => this.failed.set(true) });
  }

  protected nameTyped(name: string): void {
    this.newName.set(name);
    if (!this.keyTyped()) {
      this.newKey.set(keyFromName(name));
    }
  }

  protected keyEdited(key: string): void {
    this.newKey.set(key);
    this.keyTyped.set(key !== '');
  }

  protected create(): void {
    const key = this.newKey().trim();
    if (!this.canCreate()) {
      return;
    }
    void this.router.navigate(['/admin/processes', key], { queryParams: { name: this.newName().trim() || key } });
  }

  protected retire(process: ProcessSummary): void {
    if (!window.confirm(`Retire "${process.name}"? Running requests finish on their version, but nobody can start a new one.`)) {
      return;
    }
    this.api.retire(process.key).subscribe(() => {
      this.toasts.success(`${process.name} retired`);
      this.reload();
    });
  }
}
