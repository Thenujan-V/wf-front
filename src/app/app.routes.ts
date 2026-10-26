import { Routes } from '@angular/router';
import { roleGuard } from './core/auth/role.guard';
import { Shell } from './layout/shell';
import { unsavedChangesGuard } from './pages/admin/forms/unsaved-changes.guard';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inbox' },
      { path: 'inbox', loadComponent: () => import('./pages/inbox/inbox').then((m) => m.InboxPage) },
      { path: 'requests', loadComponent: () => import('./pages/requests/requests').then((m) => m.RequestsPage) },
      {
        path: 'requests/:id',
        loadComponent: () => import('./pages/requests/request-detail').then((m) => m.RequestDetailPage),
      },
      { path: 'documents', loadComponent: () => import('./pages/documents/library').then((m) => m.LibraryPage) },
      {
        path: 'documents/search',
        loadComponent: () => import('./pages/documents/document-search').then((m) => m.DocumentSearchPage),
      },
      {
        path: 'documents/folders/:id/permissions',
        loadComponent: () => import('./pages/documents/folder-permissions').then((m) => m.FolderPermissionsPage),
      },
      {
        path: 'documents/folders/:id',
        loadComponent: () => import('./pages/documents/library').then((m) => m.LibraryPage),
      },
      {
        path: 'documents/:id/edit',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./pages/documents/document-editor').then((m) => m.DocumentEditorPage),
      },
      {
        path: 'documents/:id',
        loadComponent: () => import('./pages/documents/document-page').then((m) => m.DocumentPage),
      },
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage) },
      {
        path: 'admin/forms',
        canMatch: [roleGuard('process-designer', 'wms-admin')],
        loadComponent: () => import('./pages/admin/forms/forms-list').then((m) => m.FormsListPage),
      },
      {
        path: 'admin/forms/:key',
        canMatch: [roleGuard('process-designer', 'wms-admin')],
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./pages/admin/forms/form-editor').then((m) => m.FormEditorPage),
      },
      {
        path: 'admin/processes',
        canMatch: [roleGuard('process-designer', 'wms-admin')],
        loadComponent: () => import('./pages/admin/processes/processes-list').then((m) => m.ProcessesListPage),
      },
      {
        path: 'admin/processes/:key',
        canMatch: [roleGuard('process-designer', 'wms-admin')],
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./pages/admin/processes/process-designer').then((m) => m.ProcessDesignerPage),
      },
      {
        path: 'admin/document-types',
        canMatch: [roleGuard('document-admin', 'wms-admin')],
        loadComponent: () => import('./pages/admin/document-types/document-types').then((m) => m.DocumentTypesPage),
      },
      {
        path: 'admin/audit',
        canMatch: [roleGuard('wms-admin')],
        loadComponent: () => import('./pages/admin/audit/audit').then((m) => m.AuditPage),
      },
      {
        path: 'admin/monitor',
        canMatch: [roleGuard('wms-admin')],
        loadComponent: () => import('./pages/admin/monitor/monitor').then((m) => m.MonitorPage),
      },
      {
        path: 'admin/org-chart',
        canMatch: [roleGuard('wms-admin')],
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./pages/admin/org-chart/org-chart').then((m) => m.OrgChartPage),
      },
      // No guard here: the router refuses a redirect with canMatch. The monitor route it leads to is guarded.
      { path: 'admin', pathMatch: 'full', redirectTo: 'admin/monitor' },
      {
        path: 'notifications',
        loadComponent: () => import('./pages/notifications/notifications').then((m) => m.NotificationsPage),
      },
      { path: 'profile', loadComponent: () => import('./pages/profile/profile').then((m) => m.ProfilePage) },
      { path: 'forbidden', loadComponent: () => import('./pages/forbidden').then((m) => m.ForbiddenPage) },
      { path: '**', redirectTo: 'inbox' },
    ],
  },
];
