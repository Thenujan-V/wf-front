import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FolderView } from '../../core/documents/document.models';
import { FolderTreeStore } from '../../core/documents/folder-tree.store';
import { FolderTree } from './folder-tree';

@Component({ template: '' })
class Blank {}

const LIB = { id: 'root', name: 'Library' };
const LONG = 'Finance and accounting records for the whole group, all years';
const root: FolderView = { id: 'root', name: 'Library', parentId: null, inheritAcl: true, permission: 'READ', path: [],
  children: [{ id: 'fin', name: LONG }, { id: 'hr', name: 'HR' }] };
const finance: FolderView = { id: 'fin', name: LONG, parentId: 'root', inheritAcl: true, permission: 'READ', path: [LIB],
  children: [{ id: 'q3', name: 'Q3' }] };
const empty = (id: string, name: string, path: { id: string; name: string }[]): FolderView =>
  ({ id, name, parentId: path[path.length - 1].id, inheritAcl: true, permission: 'READ', path, children: [] });

describe('FolderTree', () => {
  /** The tree as it is after opening "fin": Library > [fin > Q3], HR. */
  function setup() {
    TestBed.configureTestingModule({
      imports: [FolderTree],
      providers: [provideRouter([{ path: '**', component: Blank }]), provideHttpClient(), provideHttpClientTesting()],
    });
    const store = TestBed.inject(FolderTreeStore);
    const controller = TestBed.inject(HttpTestingController);
    store.reveal(finance);
    controller.expectOne('/api/documents/folders/root').flush(root);
    const fixture = TestBed.createComponent(FolderTree);
    fixture.componentRef.setInput('current', 'fin');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const links = () => [...element.querySelectorAll<HTMLAnchorElement>('[data-testid="tree-link"]')];
    const link = (id: string) => element.querySelector<HTMLAnchorElement>(`[data-testid="tree-link"][data-id="${id}"]`)!;
    const toggleOf = (id: string) => link(id).parentElement!.querySelector<HTMLElement>('[data-testid="tree-toggle"]');
    const key = (id: string, name: string) => {
      const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
      link(id).dispatchEvent(event);
      return event;
    };
    const focusedId = () => (document.activeElement as HTMLElement | null)?.getAttribute('data-id');
    return { fixture, element, store, controller, links, link, toggleOf, key, focusedId };
  }

  it('shows the tree down to the current folder, as a tree, and marks that folder', async () => {
    const { fixture, element, links, link } = setup();
    await fixture.whenStable();

    expect(element.querySelector('[role="tree"]')?.getAttribute('aria-label')).toBe('Folders');
    expect(links().map((a) => a.getAttribute('data-id'))).toEqual(['root', 'fin', 'q3', 'hr']);
    expect(links().every((a) => a.getAttribute('role') === 'treeitem')).toBe(true);
    expect(links().map((a) => a.getAttribute('aria-level'))).toEqual(['1', '2', '3', '2']);
    expect(links().map((a) => a.getAttribute('aria-expanded'))).toEqual(['true', 'true', 'false', 'false']);
    expect(links().map((a) => a.getAttribute('href'))).toEqual(['/documents', '/documents/folders/fin', '/documents/folders/q3', '/documents/folders/hr']);
    expect(link('fin').getAttribute('aria-current')).toBe('page');
    expect(link('hr').getAttribute('aria-current')).toBeNull();
    expect(link('fin').parentElement!.classList.contains('tree-row-current')).toBe(true);
    expect(link('fin').getAttribute('title')).toBe(LONG);
    expect(link('fin').querySelector('.truncate')?.textContent).toBe(LONG);
  });

  it('has one tab stop: the current folder until another row takes the focus', async () => {
    const { fixture, element, link } = setup();
    await fixture.whenStable();
    const stops = () => [...element.querySelectorAll('[tabindex="0"]')].map((e) => e.getAttribute('data-id'));
    expect(stops()).toEqual(['fin']);

    link('hr').focus();
    await fixture.whenStable();
    expect(stops()).toEqual(['hr']);
  });

  it('expands with the arrow without leaving the folder, and drops the arrow of an empty folder', async () => {
    const { fixture, controller, links, link, toggleOf } = setup();
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    const before = router.url;

    toggleOf('hr')!.click();
    await fixture.whenStable();
    expect(link('hr').getAttribute('aria-expanded')).toBe('true');
    controller.expectOne('/api/documents/folders/hr').flush(empty('hr', 'HR', [LIB]));
    await fixture.whenStable();

    expect(router.url).toBe(before);
    expect(toggleOf('hr')).toBeNull();
    expect(link('hr').getAttribute('aria-expanded')).toBeNull();

    toggleOf('fin')!.click(); // an open folder closes
    await fixture.whenStable();
    expect(links().map((a) => a.getAttribute('data-id'))).toEqual(['root', 'fin', 'hr']);
  });

  it('says a folder was chosen when its name is clicked', async () => {
    const { fixture, link } = setup();
    await fixture.whenStable();
    let chosen = 0;
    fixture.componentInstance.chosen.subscribe(() => chosen++);

    link('hr').click();
    await fixture.whenStable();

    expect(chosen).toBe(1);
  });

  it('moves with the arrow keys, Home and End', async () => {
    const { fixture, link, key, focusedId } = setup();
    await fixture.whenStable();
    link('fin').focus();

    expect(key('fin', 'ArrowDown').defaultPrevented).toBe(true);
    expect(focusedId()).toBe('q3');
    key('q3', 'ArrowUp');
    expect(focusedId()).toBe('fin');
    key('fin', 'End');
    expect(focusedId()).toBe('hr');
    key('hr', 'ArrowDown'); // nothing below the last row
    expect(focusedId()).toBe('hr');
    key('hr', 'Home');
    expect(focusedId()).toBe('root');
    expect(key('root', 'a').defaultPrevented).toBe(false); // other keys are left alone
  });

  it('opens and closes with Right and Left, and steps into and out of a folder', async () => {
    const { fixture, controller, links, link, key, focusedId } = setup();
    await fixture.whenStable();
    link('q3').focus();

    key('q3', 'ArrowLeft'); // closed: go to the parent
    expect(focusedId()).toBe('fin');
    key('fin', 'ArrowLeft'); // open: close it
    await fixture.whenStable();
    expect(links().map((a) => a.getAttribute('data-id'))).toEqual(['root', 'fin', 'hr']);
    expect(focusedId()).toBe('fin');

    key('fin', 'ArrowRight'); // closed: open it
    await fixture.whenStable();
    expect(links().map((a) => a.getAttribute('data-id'))).toEqual(['root', 'fin', 'q3', 'hr']);
    expect(focusedId()).toBe('fin');
    key('fin', 'ArrowRight'); // open: go to the first subfolder
    expect(focusedId()).toBe('q3');

    key('q3', 'ArrowRight'); // not asked yet: ask
    controller.expectOne('/api/documents/folders/q3').flush(empty('q3', 'Q3', [LIB, { id: 'fin', name: LONG }]));
    await fixture.whenStable();
    key('q3', 'ArrowRight'); // nothing inside: stay
    expect(focusedId()).toBe('q3');
    key('root', 'ArrowLeft'); // the root has no parent and does not close
    expect(links().length).toBe(4);
  });

  it('says so under a folder whose subfolders could not be loaded, with a retry', async () => {
    const { fixture, element, controller, links, toggleOf } = setup();
    await fixture.whenStable();

    toggleOf('hr')!.click();
    await fixture.whenStable();
    expect(element.textContent).toContain('Loading');
    controller.expectOne('/api/documents/folders/hr').flush(null, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="tree-failed"]')?.textContent).toContain('Could not load');

    element.querySelector<HTMLButtonElement>('[data-testid="tree-retry"]')!.click();
    controller.expectOne('/api/documents/folders/hr').flush({ ...empty('hr', 'HR', [LIB]), children: [{ id: 'pay', name: 'Payroll' }] });
    await fixture.whenStable();

    expect(element.querySelector('[data-testid="tree-failed"]')).toBeNull();
    expect(links().map((a) => a.getAttribute('data-id'))).toEqual(['root', 'fin', 'q3', 'hr', 'pay']);
  });
});
