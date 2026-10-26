import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApplicationRef, Component, signal } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';
import { EmbedService } from '../core/embed/embed.service';
import { NotificationBell } from './notification-bell';
import { Shell } from './shell';

@Component({ selector: 'app-notification-bell', template: '' })
class BellStub {}

describe('Shell', () => {
  function render(roles: string[], embedded = false) {
    const logout = vi.fn();
    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        // Menu links are clicked in these tests; every path leads somewhere, so no navigation fails after a test ends.
        provideRouter([{ path: '**', component: BellStub }]),
        {
          provide: AuthService,
          useValue: { displayName: signal('Alice Admin'), hasRole: (r: string) => roles.includes(r), logout },
        },
        { provide: EmbedService, useValue: { embedded: signal(embedded) } },
      ],
    });
    TestBed.overrideComponent(Shell, { remove: { imports: [NotificationBell] }, add: { imports: [BellStub] } });
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    return { element: fixture.nativeElement as HTMLElement, logout };
  }

  it('shows the user and core navigation', () => {
    const { element } = render(['user']);
    expect(element.textContent).toContain('Alice Admin');
    expect(element.textContent).toContain('Inbox');
    expect(element.textContent).not.toContain('Administration');
  });

  it('has no placeholder link left', () => {
    expect(render(['wms-admin']).element.querySelector('a[href="/admin"]')).toBeNull();
  });

  it('signs out from the user menu', () => {
    const { element, logout } = render(['user']);
    (element.querySelector('[data-testid="user-menu"]') as HTMLButtonElement).click();
    TestBed.inject(ApplicationRef).tick();
    (element.querySelector('[data-testid="sign-out"]') as HTMLButtonElement).click();
    expect(logout).toHaveBeenCalled();
  });

  it('shows Forms to process designers and admins only', () => {
    expect(render(['process-designer']).element.textContent).toContain('Forms');
    TestBed.resetTestingModule();
    expect(render(['user']).element.textContent).not.toContain('Forms');
  });

  it('shows Processes to process designers and admins only', () => {
    expect(render(['wms-admin']).element.textContent).toContain('Processes');
    TestBed.resetTestingModule();
    expect(render(['user']).element.textContent).not.toContain('Processes');
  });

  it('shows Document types to library admins only', () => {
    expect(render(['document-admin']).element.textContent).toContain('Document types');
    TestBed.resetTestingModule();
    expect(render(['user']).element.textContent).not.toContain('Document types');
  });

  it('has the notification bell next to the user', () => {
    expect(render(['user']).element.querySelector('header app-notification-bell')).not.toBeNull();
  });

  it('shows Monitor to admins only', () => {
    expect(render(['wms-admin']).element.textContent).toContain('Monitor');
    TestBed.resetTestingModule();
    expect(render(['process-designer']).element.textContent).not.toContain('Monitor');
  });

  it('shows Org chart to admins only', () => {
    expect(render(['wms-admin']).element.textContent).toContain('Org chart');
    TestBed.resetTestingModule();
    expect(render(['document-admin']).element.textContent).not.toContain('Org chart');
  });

  it('carries the product name and the theme switch', () => {
    const { element } = render(['user']);
    expect(element.textContent).toContain('Auradot');
    expect(element.querySelector('header [data-testid="theme-switch"]')).not.toBeNull();
  });

  it('groups the menu, showing a heading only when the person sees something under it', () => {
    const headings = (roles: string[]) => {
      const found = Array.from(render(roles).element.querySelectorAll('aside .nav-group')).map((h) => h.textContent!.trim());
      TestBed.resetTestingModule();
      return found;
    };

    expect(headings(['user'])).toEqual([]);
    expect(headings(['document-admin'])).toEqual(['Design']);
    expect(headings(['wms-admin'])).toEqual(['Design', 'Administration']);
  });

  it('gives every menu item an icon', () => {
    const items = Array.from(render(['wms-admin']).element.querySelectorAll('aside a.nav-item'));
    expect(items.length).toBe(10);
    expect(items.every((item) => item.querySelector('svg') !== null)).toBe(true);
  });

  it('opens the menu from a button on small screens, and closes it again', () => {
    const { element } = render(['user']);
    const tick = () => TestBed.inject(ApplicationRef).tick();
    const button = element.querySelector('[data-testid="menu-button"]') as HTMLButtonElement;
    const dialog = () => element.querySelector('[role="dialog"]');
    expect(dialog()).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');

    button.click();
    tick();
    expect(dialog()!.textContent).toContain('My requests');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    (dialog()!.querySelector('a.nav-item') as HTMLAnchorElement).click();
    tick();
    expect(dialog()).toBeNull();

    button.click();
    tick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    tick();
    expect(dialog()).toBeNull();

    button.click();
    tick();
    (element.querySelector('[data-testid="menu-backdrop"]') as HTMLElement).click();
    tick();
    expect(dialog()).toBeNull();
  });

  it('treats the small-screen menu as a dialog: focus goes in, the page behind is out of reach, and focus comes back', () => {
    const { element } = render(['user']);
    const tick = () => TestBed.inject(ApplicationRef).tick();
    const button = element.querySelector('[data-testid="menu-button"]') as HTMLButtonElement;
    const page = element.querySelector('[data-testid="page"]') as HTMLElement;

    button.click();
    tick();
    const close = element.querySelector('[data-testid="menu-close"]') as HTMLButtonElement;
    expect(close.getAttribute('aria-label')).toBe('Close the menu');
    expect(document.activeElement).toBe(close);
    expect(page.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    tick();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(page.hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(button);

    button.click();
    tick();
    (element.querySelector('[data-testid="menu-close"]') as HTMLButtonElement).click();
    tick();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('shows only the page when embedded in auraDOCS', () => {
    const { element } = render(['wms-admin'], true);
    expect(element.querySelector('router-outlet')).not.toBeNull();
    expect(element.querySelector('nav')).toBeNull();
    expect(element.querySelector('header')).toBeNull();
    expect(element.querySelector('app-notification-bell')).toBeNull();
  });
});
