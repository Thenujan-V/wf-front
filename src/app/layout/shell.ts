import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { Icon } from '../core/ui/icon';
import { IconName } from '../core/ui/icons';
import { Logo } from '../core/ui/logo';
import { NotificationBell } from './notification-bell';
import { ThemeSwitch } from './theme-switch';
import { UserMenu } from './user-menu';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  /** Shown only to people holding one of these roles. */
  roles?: string[];
}

interface NavGroup {
  /** No heading for the group everyone sees. */
  label: string | null;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { path: '/inbox', label: 'Inbox', icon: 'inbox' },
      { path: '/requests', label: 'My requests', icon: 'file' },
      { path: '/documents', label: 'Documents', icon: 'folder' },
      { path: '/dashboard', label: 'Dashboard', icon: 'chart' },
    ],
  },
  {
    label: 'Design',
    items: [
      { path: '/admin/forms', label: 'Forms', icon: 'form', roles: ['process-designer', 'wms-admin'] },
      { path: '/admin/processes', label: 'Processes', icon: 'flow', roles: ['process-designer', 'wms-admin'] },
      { path: '/admin/document-types', label: 'Document types', icon: 'tag', roles: ['document-admin', 'wms-admin'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { path: '/admin/monitor', label: 'Monitor', icon: 'activity', roles: ['wms-admin'] },
      { path: '/admin/org-chart', label: 'Org chart', icon: 'users', roles: ['wms-admin'] },
      { path: '/admin/audit', label: 'Audit', icon: 'shield', roles: ['wms-admin'] },
    ],
  },
];

/** The frame around every page: the menu, and a header with the theme, notifications and the person signed in. */
@Component({
  selector: 'app-shell',
  imports: [Icon, Logo, NgTemplateOutlet, NotificationBell, RouterLink, RouterLinkActive, RouterOutlet, ThemeSwitch, UserMenu],
  templateUrl: './shell.html',
  host: { '(document:keydown.escape)': 'closeMenu()' },
})
export class Shell {
  protected readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  /** The menu as a slide-out, on screens too narrow for the sidebar. */
  protected readonly menuOpen = signal(false);
  /** A group is shown only when the person sees at least one of its items. */
  protected readonly groups = computed(() =>
    NAV.map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.some((role) => this.auth.hasRole(role))),
    })).filter((group) => group.items.length > 0));

  constructor() {
    // The drawer is a dialog: focus goes into it when it appears, and the page behind does not scroll.
    effect(() => this.closeButton()?.nativeElement.focus());
    effect(() => {
      this.document.body.style.overflow = this.menuOpen() ? 'hidden' : '';
    });
    inject(DestroyRef).onDestroy(() => (this.document.body.style.overflow = ''));
  }

  /** Closes the drawer and puts the focus back on the button that opened it. */
  protected closeMenu(): void {
    if (!this.menuOpen()) {
      return;
    }
    this.menuOpen.set(false);
    // After the render: until then the page behind is still inert and cannot take the focus.
    afterNextRender(() => this.menuButton()?.nativeElement.focus(), { injector: this.injector });
  }
}
