import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { Icon } from '../core/ui/icon';

/** "Bob Manager" -> "BM"; one word gives one letter; nothing gives "?". */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (words[0][0] + last).toUpperCase();
}

/** Who is signed in, with their profile and signing out behind it. */
@Component({
  selector: 'app-user-menu',
  imports: [Icon, RouterLink],
  host: {
    class: 'relative',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    <button type="button" data-testid="user-menu" aria-haspopup="menu" [attr.aria-expanded]="open()"
            [attr.aria-label]="'Account: ' + auth.displayName()"
            class="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 text-sm font-medium text-ink hover:bg-field"
            (click)="open.set(!open())">
      <span class="grid size-8 place-items-center rounded-full bg-accent text-xs font-bold text-on-solid" aria-hidden="true">{{ initials() }}</span>
      <span class="hidden sm:inline">{{ auth.displayName() }}</span>
      <app-icon name="chevron-down" class="text-muted" />
    </button>
    @if (open()) {
      <div role="menu" data-testid="user-menu-panel" class="card absolute right-0 z-30 mt-2 w-48 p-1 shadow-pop">
        <a routerLink="/profile" role="menuitem" class="nav-item" (click)="open.set(false)"><app-icon name="user" />Your profile</a>
        <button type="button" role="menuitem" data-testid="sign-out" class="nav-item w-full text-left" (click)="auth.logout()">
          <app-icon name="log-out" />Sign out
        </button>
      </div>
    }
  `,
})
export class UserMenu {
  protected readonly auth = inject(AuthService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly open = signal(false);
  protected readonly initials = computed(() => initialsOf(this.auth.displayName()));

  protected onEscape(): void {
    if (this.open()) {
      this.open.set(false);
      this.host.nativeElement.querySelector('button')?.focus(); // back to where the person was
    }
  }

  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
