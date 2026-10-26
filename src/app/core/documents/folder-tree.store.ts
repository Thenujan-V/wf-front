import { Injectable, computed, inject, signal } from '@angular/core';
import { FolderView, PathItem } from './document.models';
import { DocumentsApi } from './documents.api';

/** One visible line of the folder tree. */
export interface TreeRow {
  id: string;
  name: string;
  /** 1 for the library root. */
  level: number;
  parentId: string | null;
  /** Whether the row has an arrow. A folder not asked about yet has one: the server does not say in advance. */
  expandable: boolean;
  expanded: boolean;
  /** What to say under an open row whose subfolders are not there. */
  note: 'loading' | 'failed' | null;
}

type Load = 'loading' | 'loaded' | 'failed';

/**
 * What the app has learned about the library's folders, kept while the app is open so the tree stays as the person
 * left it. It only ever shows folders the server listed for this person.
 */
@Injectable({ providedIn: 'root' })
export class FolderTreeStore {
  private readonly api = inject(DocumentsApi);

  private readonly root = signal<PathItem | null>(null);
  /** What the server listed, per folder. */
  private readonly children = signal<Record<string, PathItem[]>>({});
  /**
   * Subfolders known from an opened folder's path, per parent. They are kept apart from the server's lists, which
   * leave out what the person may not read: a readable folder under an unreadable one must stay in the tree.
   */
  private readonly pinned = signal<Record<string, PathItem[]>>({});
  private readonly loads = signal<Record<string, Load>>({});
  private readonly expandedIds = signal<ReadonlySet<string>>(new Set());
  private rootRequested = false;

  /**
   * The folder whose row should take the keyboard focus when the tree is next built. Opening a folder from the
   * library root (or the root from a folder) rebuilds the page, and the focus would otherwise fall out of the tree.
   */
  focusAfterMove: string | null = null;

  readonly rootId = computed(() => this.root()?.id ?? null);

  /** The tree as a flat list, top to bottom: a folder, then (when open) its subfolders. */
  readonly rows = computed<TreeRow[]>(() => {
    const root = this.root();
    if (!root) {
      return [];
    }
    const children = this.children();
    const pinned = this.pinned();
    const loads = this.loads();
    const expandedIds = this.expandedIds();
    const rows: TreeRow[] = [];
    const visit = (item: PathItem, level: number, parentId: string | null): void => {
      const listed = children[item.id] ?? [];
      const kids = [...listed, ...(pinned[item.id] ?? []).filter((pin) => !listed.some((kid) => kid.id === pin.id))];
      const load = loads[item.id];
      const isRoot = parentId === null;
      const expandable = !isRoot && (load !== 'loaded' || kids.length > 0);
      const expanded = isRoot || (expandable && expandedIds.has(item.id));
      const note = !expanded ? null : load === 'failed' ? 'failed' : load === 'loading' && !kids.length ? 'loading' : null;
      rows.push({ id: item.id, name: item.name, level, parentId, expandable, expanded, note });
      if (expanded) {
        kids.forEach((kid) => visit(kid, level + 1, item.id));
      }
    };
    visit(root, 1, null);
    return rows;
  });

  /** Takes a folder answer, wherever it came from: its subfolders and its name are now known. */
  learn(folder: FolderView): void {
    if (!this.root()) {
      this.root.set(folder.parentId === null ? { id: folder.id, name: folder.name } : (folder.path[0] ?? null));
    }
    this.children.update((all) => ({ ...all, [folder.id]: folder.children }));
    this.loads.update((all) => ({ ...all, [folder.id]: 'loaded' }));
    this.renamed(folder.id, folder.name);
  }

  /** Learns the folder and opens the tree down to it, and the folder itself. */
  reveal(folder: FolderView): void {
    this.learn(folder);
    const chain = [...folder.path, { id: folder.id, name: folder.name }];
    const stale: string[] = [];
    // The way down is shown at once, and stays whatever the ancestors answer; their other subfolders arrive with it.
    this.pinned.update((all) => {
      const next = { ...all };
      for (let i = 1; i < chain.length; i++) {
        const parent = chain[i - 1].id;
        const known = (kids: PathItem[] | undefined) => !!kids?.some((kid) => kid.id === chain[i].id);
        if (!known(this.children()[parent]) && !known(next[parent])) {
          next[parent] = [...(next[parent] ?? []), chain[i]];
          if (this.loads()[parent] === 'loaded') {
            stale.push(parent); // perhaps loaded before this folder existed; asked once, since it is now pinned
          }
        }
      }
      return next;
    });
    stale.forEach((id) => this.load(id));
    chain.forEach((item) => this.expand(item.id));
  }

  expand(id: string): void {
    this.expandedIds.update((ids) => new Set(ids).add(id));
    if (!this.loads()[id]) {
      this.load(id);
    }
  }

  collapse(id: string): void {
    this.expandedIds.update((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
  }

  retry(id: string): void {
    this.load(id);
  }

  renamed(id: string, name: string): void {
    if (this.root()?.id === id) {
      this.root.set({ id, name });
    }
    const rename = (all: Record<string, PathItem[]>) => Object.fromEntries(Object.entries(all).map(([parent, kids]) =>
      [parent, kids.some((kid) => kid.id === id && kid.name !== name) ? kids.map((kid) => (kid.id === id ? { id, name } : kid)) : kids]));
    this.children.update(rename);
    this.pinned.update(rename);
  }

  removed(id: string): void {
    const remove = (all: Record<string, PathItem[]>) => Object.fromEntries(Object.entries(all)
      .filter(([parent]) => parent !== id)
      .map(([parent, kids]) => [parent, kids.some((kid) => kid.id === id) ? kids.filter((kid) => kid.id !== id) : kids]));
    this.children.update(remove);
    this.pinned.update(remove);
    this.loads.update((all) => Object.fromEntries(Object.entries(all).filter(([key]) => key !== id)));
    this.collapse(id);
  }

  /** For when no folder answer has arrived (the page's own request failed): the tree still needs its root. */
  ensureRoot(): void {
    if (this.root() || this.rootRequested) {
      return;
    }
    this.rootRequested = true;
    this.api.root(true).subscribe({
      next: (folder) => this.learn(folder),
      error: () => (this.rootRequested = false),
    });
  }

  private load(id: string): void {
    this.loads.update((all) => ({ ...all, [id]: 'loading' }));
    this.api.folder(id, true).subscribe({
      next: (folder) => this.learn(folder),
      error: () => this.loads.update((all) => ({ ...all, [id]: 'failed' })),
    });
  }
}
