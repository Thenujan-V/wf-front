import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AclEntry, FolderView, PERMISSIONS, Permission, PrincipalType } from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents.api';
import { GroupView, UserSummary } from '../../core/identity/identity.models';
import { UserDirectory } from '../../core/identity/user-directory';
import { UserPicker } from '../../core/identity/user-picker';
import { ToastService } from '../../core/ui/toast.service';
import { KNOWN_ROLES } from '../admin/processes/task-properties';

/** Who may do what in a folder (spec §6): people, groups and roles, and whether the parent's entries apply. */
@Component({
  selector: 'app-folder-permissions',
  imports: [RouterLink, UserPicker],
  templateUrl: './folder-permissions.html',
})
export class FolderPermissionsPage {
  private readonly api = inject(DocumentsApi);
  private readonly directory = inject(UserDirectory);
  private readonly toasts = inject(ToastService);

  /** Route parameter :id. */
  readonly id = input.required<string>();

  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'forbidden' | 'failed'>('loading');
  protected readonly folder = signal<FolderView | null>(null);
  protected readonly inheritAcl = signal(true);
  protected readonly rows = signal<AclEntry[]>([]);
  protected readonly inherited = signal<AclEntry[]>([]);
  protected readonly groups = signal<GroupView[]>([]);
  protected readonly adding = signal<PrincipalType | null>(null);
  protected readonly saving = signal(false);
  protected readonly permissions = PERMISSIONS;
  protected readonly roles = KNOWN_ROLES;

  constructor() {
    this.directory.groups().subscribe({ next: (groups) => this.groups.set(groups), error: () => this.groups.set([]) });
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  /** Answers for a folder the page has since left are ignored. */
  private loadRun = 0;

  protected load(id: string): void {
    const run = ++this.loadRun;
    this.state.set('loading');
    this.api.folder(id, true).subscribe({
      next: (folder) => {
        if (run !== this.loadRun) {
          return;
        }
        this.folder.set(folder);
        this.api.acl(id, true).subscribe({
          next: (acl) => {
            if (run !== this.loadRun) {
              return;
            }
            this.inheritAcl.set(acl.inheritAcl);
            this.rows.set(acl.entries);
            this.inherited.set(acl.inherited);
            this.state.set('ready');
          },
          error: (error: unknown) =>
            this.state.set(error instanceof HttpErrorResponse && error.status === 403 ? 'forbidden' : 'failed'),
        });
      },
      error: (error: unknown) =>
        this.state.set(error instanceof HttpErrorResponse && error.status === 404 ? 'missing' : 'failed'),
    });
  }

  protected label(entry: AclEntry): string {
    switch (entry.principalType) {
      case 'USER':
        return this.directory.name(entry.principalId)();
      case 'GROUP':
        return this.groups().find((g) => g.id === entry.principalId)?.path ?? entry.principalId;
      case 'ROLE':
        return `Everyone with the role ${entry.principalId}`;
    }
  }

  protected setPermission(index: number, permission: Permission): void {
    this.rows.update((rows) => rows.map((r, i) => (i === index ? { ...r, permission } : r)));
  }

  protected remove(index: number): void {
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected addUser(user: UserSummary): void {
    this.add({ principalType: 'USER', principalId: user.id, permission: 'READ' });
  }

  protected addGroup(id: string): void {
    if (id) {
      this.add({ principalType: 'GROUP', principalId: id, permission: 'READ' });
    }
  }

  protected addRole(role: string): void {
    if (role) {
      this.add({ principalType: 'ROLE', principalId: role, permission: 'READ' });
    }
  }

  private add(entry: AclEntry): void {
    this.adding.set(null);
    if (this.rows().some((r) => r.principalType === entry.principalType && r.principalId === entry.principalId)) {
      this.toasts.show(`${this.label(entry)} already has access here`);
      return;
    }
    this.rows.update((rows) => [...rows, entry]);
  }

  /** A refusal (e.g. taking away your own MANAGE) is toasted by the problem interceptor; the edits stay to fix. */
  protected save(): void {
    this.saving.set(true);
    this.api.setAcl(this.id(), this.inheritAcl(), this.rows()).subscribe({
      next: (acl) => {
        this.saving.set(false);
        this.inheritAcl.set(acl.inheritAcl);
        this.rows.set(acl.entries);
        this.inherited.set(acl.inherited);
        this.toasts.success('Permissions saved');
      },
      error: () => this.saving.set(false),
    });
  }
}
