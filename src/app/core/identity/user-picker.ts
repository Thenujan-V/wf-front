import { Component, inject, input, output, signal } from '@angular/core';
import { UserSummary } from './identity.models';
import { UserDirectory } from './user-directory';

@Component({
  selector: 'app-user-picker',
  template: `
    <form class="flex gap-2" (submit)="$event.preventDefault(); $event.stopPropagation(); search()">
      <input type="search" class="min-w-0 flex-1 rounded-md border border-line-strong px-3 py-1.5 text-sm"
             placeholder="Search people by name" aria-label="Search people" [value]="query()"
             (input)="query.set($any($event.target).value)" />
      <button type="submit" data-testid="user-search" class="btn btn-secondary px-3 py-1.5 text-sm">{{ searchLabel() }}</button>
    </form>
    @if (results(); as users) {
      <ul class="mt-2 divide-y divide-line rounded-md border border-line">
        @for (user of users; track user.id) {
          <li>
            <button type="button" data-testid="user-option" class="w-full px-3 py-2 text-left text-sm hover:bg-field" (click)="picked.emit(user)">
              <span class="font-medium">{{ user.displayName || user.username }}</span>
              <span class="text-muted"> · {{ user.department ?? user.username }}</span>
            </button>
          </li>
        } @empty {
          <li class="px-3 py-2 text-sm text-muted">No one found.</li>
        }
      </ul>
    }
  `,
})
export class UserPicker {
  private readonly directory = inject(UserDirectory);
  /** Usually the signed-in user, who cannot pick themselves. */
  readonly excludeId = input<string | null>(null);
  /** The button's word. A page with a Search button of its own gives another, so there is one "Search" on screen. */
  readonly searchLabel = input('Search');
  readonly picked = output<UserSummary>();
  protected readonly query = signal('');
  protected readonly results = signal<UserSummary[] | null>(null);

  protected search(): void {
    const query = this.query().trim();
    if (query.length < 2) {
      return;
    }
    this.directory.search(query).subscribe((users) => this.results.set(users.filter((u) => u.id !== this.excludeId())));
  }
}
