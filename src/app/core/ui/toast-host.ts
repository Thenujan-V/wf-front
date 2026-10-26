import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  template: `
    <div class="fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-96" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="card flex items-start gap-3 p-3 text-sm text-ink shadow-pop"
             [attr.data-kind]="toast.kind" [attr.role]="toast.kind === 'error' ? 'alert' : 'status'">
          <span class="mt-1.5 size-2 shrink-0 rounded-full" [class.bg-danger]="toast.kind === 'error'" [class.bg-ok]="toast.kind === 'success'"
                aria-hidden="true"></span>
          <span class="flex-1">{{ toast.message }}</span>
          <button type="button" class="text-muted hover:text-ink" aria-label="Dismiss" (click)="toasts.dismiss(toast.id)">✕</button>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);
}
