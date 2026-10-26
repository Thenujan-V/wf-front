import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { UserSummary } from '../../../core/identity/identity.models';
import { OrgSettings } from '../../../core/identity/org.api';
import { UserPicker } from '../../../core/identity/user-picker';
import { ToastService } from '../../../core/ui/toast.service';
import { OrgChartPage } from './org-chart';

@Component({ selector: 'app-user-picker', template: '' })
class PickerStub {
  readonly excludeId = input<string | null>(null);
  readonly picked = output<UserSummary>();
}

function person(id: string, displayName: string, managerId: string | null, extra: Partial<UserSummary> = {}): UserSummary {
  return { id, username: displayName.split(' ')[0].toLowerCase(), displayName, email: null, department: 'Finance',
    position: 'Accountant', managerId, enabled: true, ...extra };
}

const alice = person('a', 'Alice Admin', null, { department: 'Management', position: 'Chief Executive' });
const bob = person('b', 'Bob Manager', 'a', { position: 'Finance Manager' });
const carol = person('c', 'Carol Clerk', 'b');
const dan = person('d', 'Dan Former', 'b', { enabled: false });

describe('OrgChartPage', () => {
  function setup(settings: OrgSettings | null = { manager: 'LOCAL', department: 'LOCAL', position: 'LOCAL' }) {
    TestBed.configureTestingModule({ imports: [OrgChartPage], providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.overrideComponent(OrgChartPage, { remove: { imports: [UserPicker] }, add: { imports: [PickerStub] } });
    const fixture = TestBed.createComponent(OrgChartPage);
    const controller = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    if (settings) {
      controller.expectOne('/api/identity/org/settings').flush(settings);
    } else {
      controller.expectOne('/api/identity/org/settings').flush(null, { status: 502, statusText: 'Bad Gateway' });
    }
    controller.expectOne((r) => r.url === '/api/identity/users').flush({ items: [alice, bob, carol, dan], page: 0, size: 20, total: 4 });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const query = <T extends HTMLElement>(testId: string) => element.querySelector<T>(`[data-testid="${testId}"]`);
    const choose = (id: string, managers: UserSummary[], reports: UserSummary[]) => {
      query<HTMLButtonElement>(`person-${id}`)!.click();
      controller.expectOne((r) => r.url === `/api/identity/users/${id}/managers`).flush(managers);
      controller.expectOne((r) => r.url === `/api/identity/users/${id}/reports`).flush({ items: reports, total: reports.length });
      fixture.detectChanges();
    };
    const type = (testId: string, value: string) => {
      const field = query<HTMLInputElement>(testId)!;
      field.value = value;
      field.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, controller, element, query, choose, type };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.inject(HttpTestingController).verify();
  });

  it('lists people, marking those who have left', () => {
    const { element, query } = setup();

    expect(element.querySelectorAll('[data-testid^="person-"]')).toHaveLength(4);
    expect(query('person-c')!.textContent).toContain('Carol Clerk');
    expect(query('person-c')!.textContent).toContain('Accountant');
    expect(query('person-d')!.textContent).toContain('Disabled');
    expect(query('detail')).toBeNull();
  });

  it('searches people from the first page', () => {
    const { fixture, controller, query, type } = setup();
    type('people-search', 'car');
    query<HTMLButtonElement>('people-search-go')!.click();
    fixture.detectChanges();

    const req = controller.expectOne((r) => r.url === '/api/identity/users');
    expect(req.request.params.get('q')).toBe('car');
    expect(req.request.params.get('page')).toBe('0');
    req.flush({ items: [carol], page: 0, size: 20, total: 1 });
  });

  it('shows who is above and below the chosen person', () => {
    const { query, choose } = setup();
    choose('b', [alice], [carol, dan]);

    expect(query('detail')!.textContent).toContain('Bob Manager');
    expect(query('chain')!.textContent!.replace(/\s+/g, ' ')).toContain('Alice Admin');
    expect(query('reports')!.textContent).toContain('Carol Clerk');
    expect(query('reports')!.textContent).toContain('Dan Former');
    expect(query<HTMLInputElement>('department')!.value).toBe('Finance');
    expect(query<HTMLInputElement>('position')!.value).toBe('Finance Manager');
    expect(query('manager-name')!.textContent).toContain('Alice Admin');
    expect(query<HTMLButtonElement>('save')!.disabled).toBe(true);
  });

  it('walks the chart by choosing someone above or below', () => {
    const { fixture, controller, query, choose } = setup();
    choose('b', [alice], [carol]);

    query('reports')!.querySelector<HTMLButtonElement>('button')!.click();
    controller.expectOne((r) => r.url === '/api/identity/users/c/managers').flush([bob, alice]);
    controller.expectOne((r) => r.url === '/api/identity/users/c/reports').flush({ items: [], total: 0 });
    fixture.detectChanges();

    expect(query('detail')!.textContent).toContain('Carol Clerk');
    expect(query('chain')!.textContent!.replace(/\s+/g, ' ')).toMatch(/Alice Admin.*Bob Manager/);
    expect(query('reports')!.textContent).toContain('Nobody reports to Carol Clerk.');
  });

  it('saves a new manager, department and position, trimmed, with blanks as nothing', () => {
    const { fixture, controller, query, choose, type } = setup();
    choose('c', [bob, alice], []);

    query<HTMLButtonElement>('change-manager')!.click();
    fixture.detectChanges();
    const picker = fixture.debugElement.query(By.directive(PickerStub)).componentInstance as PickerStub;
    expect(picker.excludeId()).toBe('c');
    picker.picked.emit(alice);
    fixture.detectChanges();
    expect(query('manager-name')!.textContent).toContain('Alice Admin');
    type('department', '  Audit ');
    type('position', '   ');
    expect(query<HTMLButtonElement>('save')!.disabled).toBe(false);

    query<HTMLButtonElement>('save')!.click();
    const req = controller.expectOne('/api/identity/users/c/org');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ managerId: 'a', department: 'Audit', position: null });
    req.flush({ ...carol, managerId: 'a', department: 'Audit', position: null, roles: [], groups: [] });
    controller.expectOne((r) => r.url === '/api/identity/users/c/managers').flush([alice]);
    controller.expectOne((r) => r.url === '/api/identity/users/c/reports').flush({ items: [], total: 0 });
    controller.expectOne((r) => r.url === '/api/identity/users').flush({ items: [alice, bob, carol, dan], page: 0, size: 20, total: 4 });
    fixture.detectChanges();

    expect(TestBed.inject(ToastService).toasts().map((t) => t.message)).toEqual(['Carol Clerk is updated.']);
    expect(query<HTMLButtonElement>('save')!.disabled).toBe(true);
  });

  it('can take a person\'s manager away', () => {
    const { fixture, controller, query, choose } = setup();
    choose('c', [bob], []);

    query<HTMLButtonElement>('clear-manager')!.click();
    fixture.detectChanges();
    expect(query('manager-name')!.textContent).toContain('No manager');
    query<HTMLButtonElement>('save')!.click();

    const req = controller.expectOne('/api/identity/users/c/org');
    expect(req.request.body).toEqual({ managerId: null, department: 'Finance', position: 'Accountant' });
    req.flush(null, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(query<HTMLButtonElement>('save')!.disabled).toBe(false); // what was chosen stays, to try again
  });

  it('shows fields kept in Keycloak as read-only and sends them unchanged', () => {
    const { controller, query, choose, type } = setup({ manager: 'KEYCLOAK', department: 'KEYCLOAK', position: 'LOCAL' });
    choose('c', [bob], []);

    expect(query('change-manager')).toBeNull();
    expect(query('clear-manager')).toBeNull();
    expect(query<HTMLInputElement>('department')!.disabled).toBe(true);
    expect(query<HTMLInputElement>('position')!.disabled).toBe(false);
    expect(query('detail')!.textContent).toContain('Kept in Keycloak');

    type('position', 'Senior Accountant');
    query<HTMLButtonElement>('save')!.click();
    const req = controller.expectOne('/api/identity/users/c/org');
    expect(req.request.body).toEqual({ managerId: 'b', department: 'Finance', position: 'Senior Accountant' });
    req.flush(null, { status: 500, statusText: 'Server Error' });
  });

  it('says so when nothing can be changed here', () => {
    const { query, choose } = setup({ manager: 'KEYCLOAK', department: 'KEYCLOAK', position: 'KEYCLOAK' });
    choose('c', [bob], []);

    expect(query('detail')!.textContent).toContain('Nothing can be changed here');
    expect(query('save')).toBeNull();
  });

  it('does not claim anything about Keycloak when the settings could not be loaded, and can load them again', () => {
    const { fixture, controller, query, choose } = setup(null);
    expect(query('person-c')).not.toBeNull(); // the list of people is still there
    choose('c', [bob], []);

    expect(query('detail')!.textContent).not.toContain('Nothing can be changed here');
    expect(query('detail')!.textContent).toContain('could not be loaded');
    expect(query('save')).toBeNull();
    expect(query('department')).toBeNull();

    query<HTMLButtonElement>('retry-settings')!.click();
    controller.expectOne('/api/identity/org/settings').flush({ manager: 'LOCAL', department: 'LOCAL', position: 'LOCAL' });
    fixture.detectChanges();
    expect(query<HTMLInputElement>('department')!.value).toBe('Finance');
    expect(query('save')).not.toBeNull();
  });

  it('shows the person chosen last, whatever order the answers come in', () => {
    const { fixture, controller, query } = setup();
    query<HTMLButtonElement>('person-b')!.click();
    const stale = controller.expectOne((r) => r.url === '/api/identity/users/b/managers');
    controller.expectOne((r) => r.url === '/api/identity/users/b/reports');
    query<HTMLButtonElement>('person-c')!.click();
    expect(stale.cancelled).toBe(true);

    controller.expectOne((r) => r.url === '/api/identity/users/c/managers').flush([bob]);
    controller.expectOne((r) => r.url === '/api/identity/users/c/reports').flush({ items: [], total: 0 });
    fixture.detectChanges();
    expect(query('detail')!.textContent).toContain('Carol Clerk');
    expect(query('manager-name')!.textContent).toContain('Bob Manager');
  });

  it('drops the answer to a search that has been replaced', () => {
    const { fixture, controller, query, type } = setup();
    type('people-search', 'car');
    query<HTMLButtonElement>('people-search-go')!.click();
    const first = controller.expectOne((r) => r.url === '/api/identity/users');
    type('people-search', 'bob');
    query<HTMLButtonElement>('people-search-go')!.click();
    fixture.detectChanges();

    expect(first.cancelled).toBe(true);
    controller.expectOne((r) => r.url === '/api/identity/users').flush({ items: [bob], page: 0, size: 20, total: 1 });
    fixture.detectChanges();
    expect(query('person-b')).not.toBeNull();
    expect(query('person-c')).toBeNull();
  });

  it('asks before throwing away unsaved changes when someone else is chosen', () => {
    const { fixture, controller, query, choose, type } = setup();
    choose('c', [bob], []);
    type('department', 'Audit');
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(true);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    query<HTMLButtonElement>('person-b')!.click();
    fixture.detectChanges();
    expect(confirm).toHaveBeenCalledTimes(1);
    controller.expectNone((r) => r.url === '/api/identity/users/b/managers');
    expect(query('detail')!.textContent).toContain('Carol Clerk');
    expect(query<HTMLInputElement>('department')!.value).toBe('Audit');

    confirm.mockReturnValue(true);
    choose('b', [alice], [carol]);
    expect(query('detail')!.textContent).toContain('Bob Manager');
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(false);
  });

  it('does not ask when nothing was changed', () => {
    const { fixture, query, choose } = setup();
    choose('c', [bob], []);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    choose('b', [alice], [carol]);

    expect(confirm).not.toHaveBeenCalled();
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(false);
    expect(query('detail')!.textContent).toContain('Bob Manager');
  });

  it('says so when someone has more reports than are listed', () => {
    const { fixture, controller, query } = setup();
    query<HTMLButtonElement>('person-b')!.click();
    controller.expectOne((r) => r.url === '/api/identity/users/b/managers').flush([alice]);
    controller.expectOne((r) => r.url === '/api/identity/users/b/reports').flush({ items: [carol, dan], total: 730 });
    fixture.detectChanges();

    expect(query('reports-cut')!.textContent).toContain('Showing 2 of 730');
  });
});
