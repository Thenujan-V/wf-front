import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToastService } from '../../core/ui/toast.service';
import { FolderPermissionsPage } from './folder-permissions';

const folder = { id: 'fin', name: 'Finance', parentId: 'root', inheritAcl: true, permission: 'MANAGE',
  path: [{ id: 'root', name: 'Library' }], children: [] };
const acl = {
  inheritAcl: true,
  entries: [
    { principalType: 'USER', principalId: 'bob', permission: 'MANAGE' },
    { principalType: 'GROUP', principalId: 'g-fin', permission: 'WRITE' },
  ],
  inherited: [{ principalType: 'ROLE', principalId: 'user', permission: 'READ' }],
};

describe('FolderPermissionsPage', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [FolderPermissionsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(FolderPermissionsPage);
    fixture.componentRef.setInput('id', 'fin');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const controller = TestBed.inject(HttpTestingController);
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const all = (id: string) => [...element.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
    const choose = (target: HTMLSelectElement, value: string) => {
      target.value = value;
      target.dispatchEvent(new Event('change'));
    };
    const toasts = () => TestBed.inject(ToastService).toasts().map((t) => t.message);
    return { fixture, element, controller, el, all, choose, toasts };
  }

  async function load(s: ReturnType<typeof setup>) {
    s.controller.expectOne('/api/identity/groups').flush([{ id: 'g-fin', name: 'Finance', path: '/Finance' }, { id: 'g-it', name: 'IT', path: '/IT' }]);
    s.controller.expectOne('/api/documents/folders/fin').flush(folder);
    await s.fixture.whenStable();
    s.controller.expectOne('/api/documents/folders/fin/acl').flush(acl);
    await s.fixture.whenStable();
    s.controller.match('/api/identity/users/bob').forEach((r) => r.flush({ id: 'bob', username: 'bob', displayName: 'Bob Builder' }));
    await s.fixture.whenStable();
  }

  it('lists who has access, by name, and what the folder inherits (read-only)', async () => {
    const s = setup();
    await load(s);

    expect(s.all('acl-row').map((r) => r.textContent)).toEqual([expect.stringContaining('Bob Builder'), expect.stringContaining('/Finance')]);
    expect(s.all('inherited-row')[0].textContent).toContain('user');
    expect(s.all('inherited-row')[0].querySelector('select, button')).toBeNull();
    expect(s.el<HTMLInputElement>('inherit').checked).toBe(true);
  });

  it('changes, adds and removes entries, then saves them', async () => {
    const s = setup();
    await load(s);

    s.choose(s.all('acl-permission')[1] as HTMLSelectElement, 'DELETE');
    s.el<HTMLButtonElement>('add-role').click();
    await s.fixture.whenStable();
    s.choose(s.el<HTMLSelectElement>('add-role-select'), 'document-admin');
    await s.fixture.whenStable();
    s.all('acl-remove')[0].click();
    s.el<HTMLInputElement>('inherit').click();
    await s.fixture.whenStable();

    s.el<HTMLButtonElement>('save-acl').click();
    const save = s.controller.expectOne({ method: 'PUT', url: '/api/documents/folders/fin/acl' });
    expect(save.request.body).toEqual({
      inheritAcl: false,
      entries: [
        { principalType: 'GROUP', principalId: 'g-fin', permission: 'DELETE' },
        { principalType: 'ROLE', principalId: 'document-admin', permission: 'READ' },
      ],
    });
    save.flush({ ...acl, inheritAcl: false, entries: save.request.body.entries, inherited: [] });
    await s.fixture.whenStable();
    expect(s.toasts()).toContain('Permissions saved');
  });

  it('adds a group once only', async () => {
    const s = setup();
    await load(s);

    s.el<HTMLButtonElement>('add-group').click();
    await s.fixture.whenStable();
    s.choose(s.el<HTMLSelectElement>('add-group-select'), 'g-fin');
    await s.fixture.whenStable();
    expect(s.all('acl-row').length).toBe(2);
    expect(s.toasts()).toContain('/Finance already has access here');
  });

  it('keeps the edits on screen when the server refuses them', async () => {
    const s = setup();
    await load(s);

    s.all('acl-remove')[0].click();
    await s.fixture.whenStable();
    s.el<HTMLButtonElement>('save-acl').click();
    s.controller.expectOne({ method: 'PUT', url: '/api/documents/folders/fin/acl' }).flush(
      { code: 'DOC_ACL_LOCKOUT', detail: 'This change would take away your own right to manage the folder' },
      { status: 409, statusText: 'Conflict' });
    await s.fixture.whenStable();

    expect(s.all('acl-row').length).toBe(1);
    expect(s.el<HTMLButtonElement>('save-acl').disabled).toBe(false);
  });

  it('explains when only managers may see this page', async () => {
    const s = setup();
    s.controller.expectOne('/api/identity/groups').flush([]);
    s.controller.expectOne('/api/documents/folders/fin').flush({ ...folder, permission: 'READ' });
    await s.fixture.whenStable();
    s.controller.expectOne('/api/documents/folders/fin/acl').flush(null, { status: 403, statusText: 'Forbidden' });
    await s.fixture.whenStable();
    expect(s.el('forbidden').textContent).toContain('Only managers of this folder');
  });

  it('shows the folder the address names even when an earlier folder answers last', async () => {
    const s = setup();
    s.controller.expectOne('/api/identity/groups').flush([]);
    const first = s.controller.expectOne('/api/documents/folders/fin');
    s.fixture.componentRef.setInput('id', 'hr');
    await s.fixture.whenStable();
    s.controller.expectOne('/api/documents/folders/hr').flush({ ...folder, id: 'hr', name: 'HR' });
    await s.fixture.whenStable();
    s.controller.expectOne('/api/documents/folders/hr/acl').flush({ inheritAcl: false, entries: [], inherited: [] });
    await s.fixture.whenStable();

    first.flush(folder);
    await s.fixture.whenStable();
    s.controller.expectNone('/api/documents/folders/fin/acl');
    expect(s.element.textContent).toContain('Who has access to "HR"');
  });
});
