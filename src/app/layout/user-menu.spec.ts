import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { UserMenu, initialsOf } from './user-menu';

describe('UserMenu', () => {
  function setup(name = 'Bob Manager') {
    const logout = vi.fn();
    TestBed.configureTestingModule({
      imports: [UserMenu],
      providers: [provideRouter([]), { provide: AuthService, useValue: { displayName: signal(name), logout } }],
    });
    const fixture = TestBed.createComponent(UserMenu);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector<HTMLButtonElement>('[data-testid="user-menu"]')!;
    const panel = () => element.querySelector('[data-testid="user-menu-panel"]');
    return { fixture, element, button, panel, logout };
  }

  it('shows who is signed in, by initials and name', () => {
    const { button } = setup();

    expect(button.textContent).toContain('BM');
    expect(button.textContent).toContain('Bob Manager');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens to the profile and signing out', () => {
    const { fixture, element, button, panel, logout } = setup();
    expect(panel()).toBeNull();

    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel()!.querySelector('a')!.getAttribute('href')).toBe('/profile');

    element.querySelector<HTMLButtonElement>('[data-testid="sign-out"]')!.click();
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape, giving the focus back, and on a click anywhere else', () => {
    const { fixture, button, panel } = setup();
    button.click();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button);

    button.click();
    fixture.detectChanges();
    expect(panel()).not.toBeNull();
    document.body.click();
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });

  it('makes initials from whatever name there is', () => {
    expect(initialsOf('Bob Manager')).toBe('BM');
    expect(initialsOf('  carol  ')).toBe('C');
    expect(initialsOf('Ana Maria de Souza')).toBe('AS');
    expect(initialsOf('')).toBe('?');
    expect(initialsOf(null)).toBe('?');
  });

  it('has a name even where the name is not shown (a phone)', () => {
    const { button } = setup('Bob Manager');
    expect(button.getAttribute('aria-label')).toBe('Account: Bob Manager');
  });
});
