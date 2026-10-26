import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { LibraryPage } from './library';

const root = { id: 'root', name: 'Library', parentId: null, inheritAcl: true, permission: 'READ', path: [],
  children: [{ id: 'fin', name: 'Finance' }] };
const finance = { id: 'fin', name: 'Finance', parentId: 'root', inheritAcl: true, permission: 'WRITE',
  path: [{ id: 'root', name: 'Library' }], children: [] };
const invoice = {
  id: 'd1', folderId: 'fin', name: 'Invoice March.pdf', typeId: null,
  currentVersion: { id: 'v2', label: '1.2', major: 1, minor: 2, size: 2048, mimeType: 'application/pdf', fileName: 'Invoice March.pdf',
    sha256: 'a', createdBy: 'bob', createdAt: '2026-09-28T09:00:00Z', comment: null },
  checkedOutBy: 'bob', checkedOutAt: '2026-09-28T09:00:00Z', updatedAt: '2026-09-28T09:00:00Z',
};

describe('LibraryPage', () => {
  function setup(id?: string) {
    TestBed.configureTestingModule({
      imports: [LibraryPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(LibraryPage);
    if (id) {
      fixture.componentRef.setInput('id', id);
    }
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const controller = TestBed.inject(HttpTestingController);
    const el = <T extends HTMLElement>(testId: string) => element.querySelector(`[data-testid="${testId}"]`) as T;
    const all = (testId: string) => [...element.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)];
    const type = (testId: string, value: string) => {
      el<HTMLInputElement>(testId).value = value;
      el<HTMLInputElement>(testId).dispatchEvent(new Event('input'));
    };
    return { fixture, element, controller, el, all, type };
  }

  async function open(s: ReturnType<typeof setup>, folder: object, url: string, documents: object[] = []) {
    s.controller.expectOne(url).flush(folder);
    await s.fixture.whenStable();
    s.controller.expectOne(`/api/documents/folders/${(folder as { id: string }).id}/documents`).flush(documents);
    await s.fixture.whenStable();
  }

  it('opens the library root with its subfolders; readers get no folder actions', async () => {
    const s = setup();
    await open(s, root, '/api/documents/folders/root');

    expect(s.el('folder-name').textContent).toContain('Library');
    expect(s.all('tree-link').map((a) => a.getAttribute('href'))).toEqual(['/documents', '/documents/folders/fin']);
    expect(s.element.querySelector('[aria-current="page"]')?.textContent).toContain('Library');
    expect(s.all('subfolder')).toEqual([]);
    expect(s.el('new-folder')).toBeNull();
    expect(s.el('upload-input')).toBeNull();
    expect(s.el('delete-folder')).toBeNull();
    expect(s.el('permissions-link')).toBeNull();
  });

  it('shows a folder with its path and its documents, versions, sizes and locks', async () => {
    const s = setup('fin');
    await open(s, finance, '/api/documents/folders/fin', [invoice]);
    s.controller.match('/api/identity/users/bob').forEach((r) => r.flush({ id: 'bob', username: 'bob', displayName: 'Bob Builder' }));
    await s.fixture.whenStable();

    expect(s.all('crumb').map((a) => a.textContent?.trim())).toEqual(['Library']);
    const row = s.el('document-row');
    expect(row.textContent).toContain('Invoice March.pdf');
    expect(row.textContent).toContain('1.2');
    expect(row.textContent).toContain('2.0 KB');
    expect(row.textContent).toContain('Checked out by Bob Builder');
    expect(row.querySelector('a')?.getAttribute('href')).toBe('/documents/d1');
  });

  it('lets writers start a written document and opens its editor', async () => {
    const s = setup('fin');
    await open(s, finance, '/api/documents/folders/fin');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    s.el<HTMLButtonElement>('new-document').click();
    await s.fixture.whenStable();
    expect(s.el<HTMLButtonElement>('create-document').disabled).toBe(true); // nothing to name it yet
    s.type('new-document-name', '  Travel policy ');
    await s.fixture.whenStable();
    s.el<HTMLButtonElement>('create-document').click();

    const create = s.controller.expectOne({ method: 'POST', url: '/api/documents/written' });
    expect(create.request.body).toEqual({ folderId: 'fin', name: 'Travel policy' });
    create.flush({ id: 'd9' });
    expect(navigate).toHaveBeenCalledWith(['/documents', 'd9', 'edit']);
  });

  it('readers get no New document', async () => {
    const reader = setup();
    await open(reader, root, '/api/documents/folders/root');
    expect(reader.el('new-document')).toBeNull();
  });

  it('marks a written document that is still a draft', async () => {
    const s = setup('fin');
    const draft = { id: 'd2', folderId: 'fin', name: 'Travel policy', typeId: null, currentVersion: null,
      checkedOutBy: null, checkedOutAt: null, updatedAt: '2026-10-06T09:00:00Z', kind: 'WRITTEN' };
    await open(s, finance, '/api/documents/folders/fin', [{ ...invoice, kind: 'FILE' }, draft]);

    const rows = s.all('document-row');
    expect(rows[0].querySelector('.badge')).toBeNull();
    expect(rows[1].querySelector('.badge')?.textContent).toContain('Draft');
  });

  it('lets writers create a subfolder', async () => {
    const s = setup('fin');
    await open(s, finance, '/api/documents/folders/fin');

    s.el<HTMLButtonElement>('new-folder').click();
    await s.fixture.whenStable();
    s.type('new-folder-name', ' Q3 ');
    s.el<HTMLButtonElement>('create-folder').click();
    const create = s.controller.expectOne({ method: 'POST', url: '/api/documents/folders' });
    expect(create.request.body).toEqual({ parentId: 'fin', name: 'Q3' });
    create.flush({ ...finance, id: 'q3', name: 'Q3' });
    await s.fixture.whenStable();

    s.controller.expectOne('/api/documents/folders/fin').flush({ ...finance, children: [{ id: 'q3', name: 'Q3' }] });
    await s.fixture.whenStable();
    s.controller.expectOne('/api/documents/folders/fin/documents').flush([]);
    await s.fixture.whenStable();
    expect(s.all('tree-link').map((a) => a.textContent?.trim())).toEqual(['Library', 'Finance', 'Q3']);
  });

  it('renames a folder, and deletes it after asking, going back to its parent', async () => {
    const s = setup('fin');
    await open(s, { ...finance, permission: 'DELETE' }, '/api/documents/folders/fin');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    s.el<HTMLButtonElement>('rename-folder').click();
    await s.fixture.whenStable();
    s.type('rename-input', 'Accounts');
    s.el<HTMLButtonElement>('save-rename').click();
    const rename = s.controller.expectOne({ method: 'PATCH', url: '/api/documents/folders/fin' });
    expect(rename.request.body).toEqual({ name: 'Accounts' });
    rename.flush({ ...finance, name: 'Accounts', permission: 'DELETE' });
    await s.fixture.whenStable();
    expect(s.el('folder-name').textContent).toContain('Accounts');
    expect(s.all('tree-link').map((a) => a.textContent?.trim())).toEqual(['Library', 'Accounts']);

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    s.el<HTMLButtonElement>('delete-folder').click();
    s.controller.expectOne({ method: 'DELETE', url: '/api/documents/folders/fin' }).flush(null);
    await s.fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/documents/folders', 'root']);
    expect(s.all('tree-link').map((a) => a.textContent?.trim())).toEqual(['Library']);
    confirm.mockRestore();
  });

  it('explains a folder that does not exist or cannot be read', async () => {
    const s = setup('secret');
    s.controller.expectOne('/api/documents/folders/secret').flush({ code: 'DOC_FOLDER_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await s.fixture.whenStable();

    expect(s.el('missing').textContent).toContain('does not exist or you do not have access to it');
  });

  it('searches from the folder, within it', async () => {
    const s = setup('fin');
    await open(s, finance, '/api/documents/folders/fin');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    s.type('search-input', ' budget ');
    s.el<HTMLButtonElement>('search-submit').click();

    expect(navigate).toHaveBeenCalledWith(['/documents/search'], { queryParams: { q: 'budget', folderId: 'fin' } });
  });

  it('offers uploads to writers and refreshes the documents after one', async () => {
    const s = setup('fin');
    await open(s, finance, '/api/documents/folders/fin');
    expect(s.el('upload-input')).not.toBeNull();

    const list = s.fixture.debugElement.query((d) => d.name === 'app-upload-list');
    list.componentInstance.uploaded.emit({ id: 'd9' });
    s.controller.expectOne('/api/documents/folders/fin/documents').flush([invoice]);
    await s.fixture.whenStable();
    expect(s.all('document-row').length).toBe(1);
  });

  it('shows the folder the address names even when an earlier folder answers last', async () => {
    const s = setup('root');
    const first = s.controller.expectOne('/api/documents/folders/root');
    s.fixture.componentRef.setInput('id', 'fin');
    await s.fixture.whenStable();
    s.controller.expectOne('/api/documents/folders/fin').flush(finance);
    await s.fixture.whenStable();
    s.controller.expectOne('/api/documents/folders/fin/documents').flush([invoice]);
    await s.fixture.whenStable();

    first.flush(root);
    await s.fixture.whenStable();
    s.controller.expectNone('/api/documents/folders/root/documents');
    expect(s.el('folder-name').textContent).toContain('Finance');
  });

  it('keeps the folder and its uploads on screen while it refreshes', async () => {
    const s = setup('fin');
    await open(s, finance, '/api/documents/folders/fin');

    s.el<HTMLButtonElement>('new-folder').click();
    await s.fixture.whenStable();
    s.type('new-folder-name', 'Q4');
    s.el<HTMLButtonElement>('create-folder').click();
    s.controller.expectOne({ method: 'POST', url: '/api/documents/folders' }).flush({ ...finance, id: 'q4', name: 'Q4' });
    await s.fixture.whenStable();

    expect(s.el('upload-input')).not.toBeNull();
    expect(s.el('folder-name').textContent).toContain('Finance');
  });

  it('shows the tree beside the folder, open down to it, and fills in the rest when the root answers', async () => {
    const s = setup('fin');
    await open(s, { ...finance, children: [{ id: 'q3', name: 'Q3' }] }, '/api/documents/folders/fin');

    expect(s.all('tree-link').map((a) => a.textContent?.trim())).toEqual(['Library', 'Finance', 'Q3']);
    expect(s.element.querySelector('[aria-current="page"]')?.textContent).toContain('Finance');

    s.controller.expectOne('/api/documents/folders/root').flush({ ...root, children: [{ id: 'fin', name: 'Finance' }, { id: 'hr', name: 'HR' }] });
    await s.fixture.whenStable();
    expect(s.all('tree-link').map((a) => a.textContent?.trim())).toEqual(['Library', 'Finance', 'Q3', 'HR']);
  });

  it('keeps the tree on screen when the folder cannot be opened', async () => {
    const s = setup('secret');
    s.controller.expectOne('/api/documents/folders/secret').flush({ code: 'DOC_FOLDER_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await s.fixture.whenStable();
    s.controller.expectOne('/api/documents/folders/root').flush(root);
    await s.fixture.whenStable();

    expect(s.el('missing')).not.toBeNull();
    expect(s.all('tree-link').map((a) => a.textContent?.trim())).toEqual(['Library', 'Finance']);
    expect(s.element.querySelector('[aria-current="page"]')).toBeNull();
  });

  it('folds the tree behind a Folders button on a small screen, and away again once a folder is chosen', async () => {
    const s = setup();
    await open(s, root, '/api/documents/folders/root');
    const button = s.el<HTMLButtonElement>('folders-toggle');
    const panel = s.element.querySelector('#folder-tree') as HTMLElement;
    expect(button.getAttribute('aria-controls')).toBe('folder-tree');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.classList.contains('hidden')).toBe(true);

    button.click();
    await s.fixture.whenStable();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.classList.contains('hidden')).toBe(false);

    s.fixture.debugElement.query((d) => d.name === 'app-folder-tree').componentInstance.chosen.emit();
    await s.fixture.whenStable();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.classList.contains('hidden')).toBe(true);
  });

  it('keeps the keyboard focus in the tree when a folder is opened from the root, a move that rebuilds the page', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'documents', component: LibraryPage }, { path: 'documents/folders/:id', component: LibraryPage }],
          withComponentInputBinding()),
        provideHttpClient(), provideHttpClientTesting(),
      ],
    });
    const harness = await RouterTestingHarness.create('/documents');
    const controller = TestBed.inject(HttpTestingController);
    const host = harness.fixture.nativeElement as HTMLElement;
    const link = () => host.querySelector<HTMLAnchorElement>('[data-testid="tree-link"][data-id="fin"]')!;
    controller.expectOne('/api/documents/folders/root').flush(root);
    await harness.fixture.whenStable();
    controller.expectOne('/api/documents/folders/root/documents').flush([]);
    await harness.fixture.whenStable();
    const before = link();

    before.focus();
    before.click(); // what Enter does on a link
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/documents/folders/fin'));
    await harness.fixture.whenStable();

    expect(link()).not.toBe(before); // the page was rebuilt
    expect(document.activeElement).toBe(link());
  });
});
