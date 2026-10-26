import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { UserSummary } from './identity.models';
import { UserPicker } from './user-picker';

describe('UserPicker', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [UserPicker], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(UserPicker);
    fixture.componentRef.setInput('excludeId', 'me');
    const picked: UserSummary[] = [];
    fixture.componentInstance.picked.subscribe((user) => picked.push(user));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const type = (text: string) => {
      const input = element.querySelector('input') as HTMLInputElement;
      input.value = text;
      input.dispatchEvent(new Event('input'));
      (element.querySelector('[data-testid="user-search"]') as HTMLButtonElement).click();
    };
    return { fixture, element, picked, type, controller: TestBed.inject(HttpTestingController) };
  }

  it('searches, hides the current user and emits the chosen person', async () => {
    const { fixture, element, picked, type, controller } = setup();

    type('da');
    controller.expectOne('/api/identity/users?q=da&size=10').flush({
      items: [
        { id: 'me', username: 'bob', displayName: 'Bob Manager' },
        { id: 'd', username: 'dave', displayName: 'Dave Admin', department: 'IT' },
      ],
    });
    await fixture.whenStable();

    const options = element.querySelectorAll('[data-testid="user-option"]');
    expect(options.length).toBe(1);
    (options[0] as HTMLButtonElement).click();
    expect(picked.map((u) => u.id)).toEqual(['d']);
    controller.verify();
  });

  it('does not search for fewer than two characters', () => {
    const { type, controller } = setup();
    type('d');
    controller.verify();
  });

  it('calls its button Search unless the page gives it another word', async () => {
    const { fixture, element } = setup();
    const button = element.querySelector('[data-testid="user-search"]') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Search');

    fixture.componentRef.setInput('searchLabel', 'Find');
    await fixture.whenStable();
    expect(button.textContent?.trim()).toBe('Find');
  });

  it('keeps its search to itself when it sits inside the form of a page', () => {
    const { element, type, controller } = setup();
    let outer = 0;
    element.parentElement!.addEventListener('submit', () => outer++);

    type('da');

    controller.expectOne('/api/identity/users?q=da&size=10').flush({ items: [] });
    expect(outer).toBe(0);
  });
});
