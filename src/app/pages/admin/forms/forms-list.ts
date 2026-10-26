import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormSummary, FormsAdminApi } from '../../../core/forms/forms-admin.api';
import { ToastService } from '../../../core/ui/toast.service';
import { keyFromName } from '../key-from-name';
import { FORM_KEY } from './builder-model';

@Component({
  selector: 'app-forms-list',
  imports: [DatePipe, RouterLink],
  templateUrl: './forms-list.html',
})
export class FormsListPage {
  private readonly api = inject(FormsAdminApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly forms = signal<FormSummary[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly newKey = signal('');
  protected readonly newName = signal('');
  /** Once the person types a key of their own, the name no longer fills it in. */
  private readonly keyTyped = signal(false);
  private readonly keyValid = computed(() => FORM_KEY.test(this.newKey().trim()));
  protected readonly keyError = computed(() => {
    const key = this.newKey().trim();
    if (!key) {
      return null;
    }
    if (!this.keyValid()) {
      // A key still being filled in from the name is not the person's mistake yet.
      return this.keyTyped() ? 'Use lowercase letters, digits and dashes (2 to 100 characters), e.g. travel-request.' : null;
    }
    return this.forms()?.some((f) => f.key === key) ? `A form "${key}" already exists; open it from the list.` : null;
  });
  protected readonly canCreate = computed(() => this.keyValid() && !this.keyError());

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.failed.set(false);
    this.api.list().subscribe({ next: (forms) => this.forms.set(forms), error: () => this.failed.set(true) });
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
    void this.router.navigate(['/admin/forms', key], { queryParams: { name: this.newName().trim() || key } });
  }

  protected retire(form: FormSummary): void {
    if (!window.confirm(`Retire "${form.name}"? Running requests keep using their version, but no new process can pick it.`)) {
      return;
    }
    this.api.retire(form.key).subscribe(() => {
      this.toasts.success(`${form.name} retired`);
      this.reload();
    });
  }
}
