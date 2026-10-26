import { TestBed } from '@angular/core/testing';
import { NOW } from './clock';
import { SlaBadge } from './sla-badge';

describe('SlaBadge', () => {
  function render(dueAt: string | null) {
    TestBed.configureTestingModule({
      imports: [SlaBadge],
      providers: [{ provide: NOW, useValue: () => new Date('2026-09-29T21:00:00Z') }],
    });
    const fixture = TestBed.createComponent(SlaBadge);
    fixture.componentRef.setInput('createdAt', '2026-09-28T09:00:00Z');
    fixture.componentRef.setInput('dueAt', dueAt);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent?.trim() ?? '';
  }

  it('shows the state of the due date', () => {
    expect(render('2026-09-30T09:00:00Z')).toBe('Due soon');
  });

  it('shows overdue tasks', () => {
    expect(render('2026-09-29T09:00:00Z')).toBe('Overdue');
  });

  it('shows nothing without a due date', () => {
    expect(render(null)).toBe('');
  });
});
