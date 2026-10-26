import { Component, ElementRef, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, Router, RouterLink } from '@angular/router';
import { FolderTreeStore, TreeRow } from '../../core/documents/folder-tree.store';
import { Icon } from '../../core/ui/icon';

/**
 * The library's folders as a tree. A name opens the folder; the arrow only opens or closes the row. With the keyboard
 * it is one tab stop: Up and Down move, Right opens or steps in, Left closes or steps out, Enter opens the folder.
 */
@Component({
  selector: 'app-folder-tree',
  imports: [Icon, RouterLink],
  template: `
    <ul role="tree" aria-label="Folders" class="text-sm" (keydown)="onKey($event)">
      @for (row of store.rows(); track row.id) {
        <li role="none" data-testid="tree-row" class="tree-row" [class.tree-row-current]="row.id === current()"
            [style.padding-left.rem]="(row.level - 1) * 1.125">
          @if (row.expandable) {
            <span data-testid="tree-toggle" aria-hidden="true"
                  class="flex size-6 shrink-0 cursor-pointer items-center justify-center" (click)="toggle(row)">
              <app-icon [name]="row.expanded ? 'chevron-down' : 'chevron-right'" />
            </span>
          } @else {
            <span class="size-6 shrink-0"></span>
          }
          <a role="treeitem" data-testid="tree-link"
             class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pr-2 -outline-offset-2"
             [routerLink]="link(row)" [attr.data-id]="row.id" [attr.aria-level]="row.level"
             [attr.aria-expanded]="row.expandable || row.expanded ? row.expanded : null"
             [attr.aria-current]="row.id === current() ? 'page' : null"
             [attr.tabindex]="row.id === tabStop() ? 0 : -1" [title]="row.name"
             (focus)="focused.set(row.id)" (click)="choose(row)">
            <app-icon [name]="row.expanded ? 'folder-open' : 'folder'" />
            <span class="truncate">{{ row.name }}</span>
          </a>
        </li>
        @if (row.note === 'loading') {
          <li role="none" class="py-1 text-xs text-muted" [style.padding-left.rem]="row.level * 1.125 + 1.5">Loading…</li>
        }
        @if (row.note === 'failed') {
          <li role="none" data-testid="tree-failed" class="py-1 text-xs text-danger-text"
              [style.padding-left.rem]="row.level * 1.125 + 1.5">
            Could not load.
            <button type="button" data-testid="tree-retry" class="link" (click)="store.retry(row.id)">Retry</button>
          </li>
        }
      }
    </ul>
  `,
})
export class FolderTree {
  protected readonly store = inject(FolderTreeStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The id of the folder the page shows. */
  readonly current = input<string | null>(null);
  /** A folder's name was clicked; the page uses it to fold the tree away on a small screen. */
  readonly chosen = output<void>();

  protected readonly focused = signal<string | null>(null);
  /** The one row in the tab order: where the focus last was, else the current folder, else the first row. */
  protected readonly tabStop = computed(() => {
    const rows = this.store.rows();
    const shown = (id: string | null) => !!id && rows.some((row) => row.id === id);
    return shown(this.focused()) ? this.focused() : shown(this.current()) ? this.current() : (rows[0]?.id ?? null);
  });

  constructor() {
    // A move that rebuilt the page (library root to a folder, or back) started in the old tree: take the focus up again.
    const refocus = this.store.focusAfterMove;
    this.store.focusAfterMove = null;
    if (refocus) {
      afterNextRender(() => this.focusRow(refocus));
    }
    // A move that kept this tree needs no such help, and must not leave a request behind for a later visit.
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        this.store.focusAfterMove = null;
      }
    });
  }

  protected choose(row: TreeRow): void {
    if (row.id !== this.current()) {
      this.store.focusAfterMove = row.id;
    }
    this.chosen.emit();
  }

  private focusRow(id: string): void {
    [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-testid="tree-link"]')]
      .find((element) => element.getAttribute('data-id') === id)?.focus();
  }

  protected link(row: TreeRow): string[] {
    return row.parentId === null ? ['/documents'] : ['/documents/folders', row.id];
  }

  protected toggle(row: TreeRow): void {
    if (row.expanded) {
      this.store.collapse(row.id);
    } else {
      this.store.expand(row.id);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const rows = this.store.rows();
    const at = rows.findIndex((row) => row.id === (event.target as HTMLElement).getAttribute('data-id'));
    if (at < 0) {
      return; // not on a folder (the Retry button)
    }
    const row = rows[at];
    let to: TreeRow | undefined;
    switch (event.key) {
      case 'ArrowDown':
        to = rows[at + 1];
        break;
      case 'ArrowUp':
        to = rows[at - 1];
        break;
      case 'Home':
        to = rows[0];
        break;
      case 'End':
        to = rows[rows.length - 1];
        break;
      case 'ArrowRight':
        if (row.expandable && !row.expanded) {
          this.store.expand(row.id);
        } else if (rows[at + 1]?.parentId === row.id) {
          to = rows[at + 1];
        }
        break;
      case 'ArrowLeft':
        if (row.expandable && row.expanded) {
          this.store.collapse(row.id);
        } else {
          to = rows.find((other) => other.id === row.parentId);
        }
        break;
      default:
        return;
    }
    event.preventDefault();
    if (to) {
      this.focusRow(to.id);
    }
  }
}
