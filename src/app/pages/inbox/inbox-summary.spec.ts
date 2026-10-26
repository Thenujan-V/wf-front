import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { task } from '../../../testing/workflow-fixtures';
import { NOW } from '../../core/workflow/clock';
import { InboxSummary } from './inbox-summary';

const MINE = '/api/workflow/tasks?view=mine';
const GROUP = '/api/workflow/tasks?view=group';

describe('InboxSummary', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [InboxSummary],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: NOW, useValue: () => new Date('2026-09-29T09:00:00Z') }],
    });
    const fixture = TestBed.createComponent(InboxSummary);
    const chosen: string[] = [];
    fixture.componentInstance.choose.subscribe((view) => chosen.push(view));
    fixture.detectChanges();
    const controller = TestBed.inject(HttpTestingController);
    const element = fixture.nativeElement as HTMLElement;
    const card = (name: string) => element.querySelector<HTMLButtonElement>(`[data-testid="summary-${name}"]`)!;
    const count = (name: string) => card(name).querySelector('[data-testid="count"]')!.textContent!.trim();
    return { fixture, controller, card, count, chosen };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('counts my tasks, my group\'s tasks and what is overdue', () => {
    const { fixture, controller, count } = setup();
    controller.expectOne(MINE).flush([
      task({ id: 'a', dueAt: '2026-09-29T08:00:00Z' }),
      task({ id: 'b', dueAt: '2026-10-05T09:00:00Z' }),
      task({ id: 'c' }),
    ]);
    controller.expectOne(GROUP).flush([task({ id: 'g1' }), task({ id: 'g2' })]);
    fixture.detectChanges();

    expect(count('mine')).toBe('3');
    expect(count('group')).toBe('2');
    expect(count('overdue')).toBe('1');
  });

  it('shows 0 for an empty list, and a dash for a list that could not be loaded', () => {
    const { fixture, controller, count } = setup();
    expect(count('mine')).toBe('—'); // not known yet

    controller.expectOne(MINE).flush([]);
    controller.expectOne(GROUP).flush(null, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();

    expect(count('mine')).toBe('0');
    expect(count('overdue')).toBe('0');
    expect(count('group')).toBe('—');
  });

  it('shows dashes for my tasks and overdue when my list could not be loaded', () => {
    const { fixture, controller, count } = setup();
    controller.expectOne(MINE).flush(null, { status: 502, statusText: 'Bad Gateway' });
    controller.expectOne(GROUP).flush([task({ id: 'g1' })]);
    fixture.detectChanges();

    expect(count('mine')).toBe('—');
    expect(count('overdue')).toBe('—');
    expect(count('group')).toBe('1');
  });

  it('counts again when it is told the tasks changed, dropping an answer that is no longer wanted', () => {
    const { fixture, controller, count } = setup();
    const stale = controller.expectOne(MINE);
    controller.expectOne(GROUP).flush([]);

    fixture.componentRef.setInput('version', 1);
    fixture.detectChanges();

    expect(stale.cancelled).toBe(true);
    controller.expectOne(MINE).flush([task({ id: 'a' })]);
    controller.expectOne(GROUP).flush([]);
    fixture.detectChanges();
    expect(count('mine')).toBe('1');
  });

  it('leads to the list behind each card', () => {
    const { controller, card, chosen } = setup();
    controller.expectOne(MINE).flush([]);
    controller.expectOne(GROUP).flush([]);

    card('group').click();
    card('overdue').click();
    card('mine').click();

    expect(chosen).toEqual(['group', 'mine', 'mine']);
  });
});
