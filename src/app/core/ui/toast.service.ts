import { Injectable, signal } from '@angular/core';

export type ToastKind = 'error' | 'success';

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly items = signal<Toast[]>([]);
  readonly toasts = this.items.asReadonly();

  /** An error or warning the user should read. */
  show(message: string, durationMs = 6000): void {
    this.push(message, 'error', durationMs);
  }

  /** Confirmation that an action worked. */
  success(message: string, durationMs = 4000): void {
    this.push(message, 'success', durationMs);
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((toast) => toast.id !== id));
  }

  private push(message: string, kind: ToastKind, durationMs: number): void {
    const toast: Toast = { id: this.nextId++, message, kind };
    this.items.update((list) => [...list, toast]);
    setTimeout(() => this.dismiss(toast.id), durationMs);
  }
}
