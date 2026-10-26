import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FolderView } from './document.models';
import { FolderTreeStore } from './folder-tree.store';

const view = (id: string, name: string, path: { id: string; name: string }[], children: { id: string; name: string }[]): FolderView => ({
  id, name, parentId: path.length ? path[path.length - 1].id : null, inheritAcl: true, permission: 'READ', path, children,
});
const LIB = { id: 'root', name: 'Library' };
const FIN = { id: 'fin', name: 'Finance' };
const HR = { id: 'hr', name: 'HR' };
const Q3 = { id: 'q3', name: 'Q3' };
const root = view('root', 'Library', [], [FIN, HR]);
const finance = view('fin', 'Finance', [LIB], [Q3]);
const q3 = view('q3', 'Q3', [LIB, FIN], []);

describe('FolderTreeStore', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const store = TestBed.inject(FolderTreeStore);
    const controller = TestBed.inject(HttpTestingController);
    const names = () => store.rows().map((r) => r.name);
    const row = (id: string) => store.rows().find((r) => r.id === id)!;
    return { store, controller, names, row };
  }

  it('has no rows until it has learned a folder', () => {
    const { store } = setup();
    expect(store.rows()).toEqual([]);
    expect(store.rootId()).toBeNull();
  });

  it('shows the root, always open and without an arrow, with its subfolders closed', () => {
    const { store, row } = setup();
    store.learn(root);

    expect(store.rootId()).toBe('root');
    expect(store.rows()).toEqual([
      { id: 'root', name: 'Library', level: 1, parentId: null, expandable: false, expanded: true, note: null },
      { id: 'fin', name: 'Finance', level: 2, parentId: 'root', expandable: true, expanded: false, note: null },
      { id: 'hr', name: 'HR', level: 2, parentId: 'root', expandable: true, expanded: false, note: null },
    ]);
    expect(row('fin').expandable).toBe(true); // not asked yet, so it may have subfolders
  });

  it('asks for subfolders on the first expand only', () => {
    const { store, controller, names, row } = setup();
    store.learn(root);

    store.expand('fin');
    store.expand('fin'); // a second click while the answer is on the way
    expect(row('fin').note).toBe('loading');
    controller.expectOne('/api/documents/folders/fin').flush(finance);
    expect(names()).toEqual(['Library', 'Finance', 'Q3', 'HR']);
    expect(row('fin').note).toBeNull();

    store.collapse('fin');
    expect(names()).toEqual(['Library', 'Finance', 'HR']);
    store.expand('fin');
    expect(names()).toEqual(['Library', 'Finance', 'Q3', 'HR']);
    controller.verify();
  });

  it('drops the arrow of a folder that turns out to have no subfolders', () => {
    const { store, controller, row } = setup();
    store.learn(root);
    store.expand('hr');
    controller.expectOne('/api/documents/folders/hr').flush(view('hr', 'HR', [LIB], []));

    expect(row('hr').expandable).toBe(false);
    expect(row('hr').expanded).toBe(false);
  });

  it('says when subfolders could not be loaded, and tries again on request', () => {
    const { store, controller, names, row } = setup();
    store.learn(root);
    store.expand('fin');
    controller.expectOne('/api/documents/folders/fin').flush(null, { status: 503, statusText: 'Unavailable' });
    expect(row('fin').note).toBe('failed');
    expect(row('fin').expanded).toBe(true);

    store.retry('fin');
    controller.expectOne('/api/documents/folders/fin').flush(finance);
    expect(row('fin').note).toBeNull();
    expect(names()).toEqual(['Library', 'Finance', 'Q3', 'HR']);
  });

  it('reveals a folder at once, before its ancestors have answered', () => {
    const { store, controller, names, row } = setup();
    store.reveal(q3);

    expect(names()).toEqual(['Library', 'Finance', 'Q3']);
    expect(row('q3').level).toBe(3);
    expect(row('q3').expandable).toBe(false); // its own answer says it has none

    controller.expectOne('/api/documents/folders/root').flush(root);
    controller.expectOne('/api/documents/folders/fin').flush(finance);
    expect(names()).toEqual(['Library', 'Finance', 'Q3', 'HR']);
    controller.verify();
  });

  it('opens the revealed folder itself, so its subfolders show', () => {
    const { store, controller, names } = setup();
    store.reveal(finance);
    controller.expectOne('/api/documents/folders/root').flush(root);

    expect(names()).toEqual(['Library', 'Finance', 'Q3', 'HR']);
  });

  it('keeps the way down when an ancestor cannot be loaded', () => {
    const { store, controller, names, row } = setup();
    store.reveal(q3);
    // The server lists only the subfolders this person may read: Finance is not among the root's.
    controller.expectOne('/api/documents/folders/root').flush({ ...root, children: [HR] });
    controller.expectOne('/api/documents/folders/fin').flush(null, { status: 404, statusText: 'Not Found' });

    expect(names()).toEqual(['Library', 'HR', 'Finance', 'Q3']);
    expect(row('fin').note).toBe('failed');

    store.reveal(q3); // coming back to it does not ask the root again
    controller.verify();
    expect(names()).toEqual(['Library', 'HR', 'Finance', 'Q3']);

    store.removed('fin');
    expect(names()).toEqual(['Library', 'HR']);
  });

  it('asks again for a parent that does not list the folder being opened', () => {
    const { store, controller, names } = setup();
    store.learn(root); // loaded before a colleague created "Legal"
    const legal = view('legal', 'Legal', [LIB], []);

    store.reveal(legal);
    expect(names()).toContain('Legal');
    controller.expectOne('/api/documents/folders/root').flush({ ...root, children: [FIN, HR, { id: 'legal', name: 'Legal' }] });
    expect(names()).toEqual(['Library', 'Finance', 'HR', 'Legal']);
  });

  it('takes a new name from a rename, and from any later answer', () => {
    const { store, names } = setup();
    store.learn(root);

    store.renamed('fin', 'Accounts');
    expect(names()).toEqual(['Library', 'Accounts', 'HR']);

    store.learn(view('hr', 'People', [LIB], []));
    expect(names()).toEqual(['Library', 'Accounts', 'People']);
  });

  it('forgets a removed folder', () => {
    const { store, controller, names, row } = setup();
    store.reveal(finance);
    controller.expectOne('/api/documents/folders/root').flush({ ...root, children: [FIN] });

    store.removed('q3');
    expect(names()).toEqual(['Library', 'Finance']);
    expect(row('fin').expandable).toBe(false);

    store.removed('fin');
    expect(names()).toEqual(['Library']);
  });

  it('can fetch the root by itself, once', () => {
    const { store, controller, names } = setup();
    store.ensureRoot();
    store.ensureRoot();
    controller.expectOne('/api/documents/folders/root').flush(root);

    expect(names()).toEqual(['Library', 'Finance', 'HR']);
    store.ensureRoot();
    controller.verify();
  });
});
