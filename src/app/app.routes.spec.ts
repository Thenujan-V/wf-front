import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { DocumentPage } from './pages/documents/document-page';
import { FolderPermissionsPage } from './pages/documents/folder-permissions';
import { DocumentSearchPage } from './pages/documents/document-search';
import { LibraryPage } from './pages/documents/library';
import { DocumentTypesPage } from './pages/admin/document-types/document-types';
import { FormEditorPage } from './pages/admin/forms/form-editor';
import { FormsListPage } from './pages/admin/forms/forms-list';
import { unsavedChangesGuard } from './pages/admin/forms/unsaved-changes.guard';
import { ProcessDesignerPage } from './pages/admin/processes/process-designer';
import { ProcessesListPage } from './pages/admin/processes/processes-list';
import { InboxPage } from './pages/inbox/inbox';
import { RequestDetailPage } from './pages/requests/request-detail';
import { NotificationsPage } from './pages/notifications/notifications';
import { MonitorPage } from './pages/admin/monitor/monitor';
import { OrgChartPage } from './pages/admin/org-chart/org-chart';
import { DashboardPage } from './pages/dashboard/dashboard';
import { RequestsPage } from './pages/requests/requests';

describe('routes', () => {
  const children = routes[0].children!;

  async function componentFor(path: string) {
    const route = children.find((r) => r.path === path)!;
    return route.loadComponent!();
  }

  it('lazy-loads the inbox and requests pages', async () => {
    expect(await componentFor('inbox')).toBe(InboxPage);
    expect(await componentFor('requests')).toBe(RequestsPage);
    expect(await componentFor('requests/:id')).toBe(RequestDetailPage);
  });

  it('routes designers to the form builder and guards unsaved edits', async () => {
    const list = children.find((r) => r.path === 'admin/forms')!;
    const editor = children.find((r) => r.path === 'admin/forms/:key')!;

    expect(await list.loadComponent!()).toBe(FormsListPage);
    expect(await editor.loadComponent!()).toBe(FormEditorPage);
    expect(editor.canDeactivate).toEqual([unsavedChangesGuard]);
    expect(list.canMatch?.length).toBe(1);
    expect(children.indexOf(list)).toBeLessThan(children.findIndex((r) => r.path === 'admin'));
  });

  it('routes designers to the process list and the designer, which asks before losing changes', async () => {
    const list = children.find((r) => r.path === 'admin/processes')!;
    const designer = children.find((r) => r.path === 'admin/processes/:key')!;

    expect(await list.loadComponent!()).toBe(ProcessesListPage);
    expect(await designer.loadComponent!()).toBe(ProcessDesignerPage);
    expect(designer.canDeactivate).toEqual([unsavedChangesGuard]);
    expect(list.canMatch?.length).toBe(1);
    expect(children.indexOf(designer)).toBeLessThan(children.findIndex((r) => r.path === 'admin'));
  });

  it('opens the document library at its root and at any folder', async () => {
    expect(await componentFor('documents')).toBe(LibraryPage);
    expect(await componentFor('documents/folders/:id')).toBe(LibraryPage);
  });

  it('opens a document by id, after the folder routes', async () => {
    const document = children.find((r) => r.path === 'documents/:id')!;
    expect(await document.loadComponent!()).toBe(DocumentPage);
    expect(children.indexOf(document)).toBeGreaterThan(children.findIndex((r) => r.path === 'documents/folders/:id'));
  });

  it('opens folder permissions', async () => {
    expect(await componentFor('documents/folders/:id/permissions')).toBe(FolderPermissionsPage);
  });

  it('opens document search before a document id could swallow it', async () => {
    const search = children.find((r) => r.path === 'documents/search')!;
    expect(await search.loadComponent!()).toBe(DocumentSearchPage);
    expect(children.indexOf(search)).toBeLessThan(children.findIndex((r) => r.path === 'documents/:id'));
  });

  it('lets library admins manage document types', async () => {
    const route = children.find((r) => r.path === 'admin/document-types')!;
    expect(await route.loadComponent!()).toBe(DocumentTypesPage);
    expect(route.canMatch?.length).toBe(1);
    expect(children.indexOf(route)).toBeLessThan(children.findIndex((r) => r.path === 'admin'));
  });

  it('lazy-loads the notifications page', async () => {
    expect(await componentFor('notifications')).toBe(NotificationsPage);
  });

  it('lazy-loads the admin monitor', async () => {
    expect(await componentFor('admin/monitor')).toBe(MonitorPage);
  });

  it('lazy-loads the org chart', async () => {
    expect(await componentFor('admin/org-chart')).toBe(OrgChartPage);
  });

  it('lazy-loads the dashboard for everyone', async () => {
    expect(await componentFor('dashboard')).toBe(DashboardPage);
    expect(children.find((r) => r.path === 'dashboard')!.canMatch).toBeUndefined();
  });

  it('sends /admin to the monitor, which is for admins only', () => {
    const admin = children.find((r) => r.path === 'admin')!;
    expect(admin.redirectTo).toBe('admin/monitor');
    // A redirect cannot carry a guard (the router refuses the whole configuration); the monitor route has it.
    expect(admin.canMatch).toBeUndefined();
    expect(children.find((r) => r.path === 'admin/monitor')!.canMatch).toHaveLength(1);
    expect(admin.loadComponent).toBeUndefined();
  });

  it('is a configuration the router accepts', () => {
    // In development mode the router validates every route when it is created; one bad route stops the whole app.
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });

    expect(() => TestBed.inject(Router)).not.toThrow();
  });

  it('asks before leaving the org chart with unsaved changes', () => {
    expect(children.find((r) => r.path === 'admin/org-chart')!.canDeactivate).toEqual([unsavedChangesGuard]);
  });
});
