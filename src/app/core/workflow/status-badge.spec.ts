import { TestBed } from '@angular/core/testing';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  function render(status: string, endStatus: string | null = null) {
    TestBed.configureTestingModule({ imports: [StatusBadge] });
    const fixture = TestBed.createComponent(StatusBadge);
    fixture.componentRef.setInput('status', status);
    fixture.componentRef.setInput('endStatus', endStatus);
    fixture.detectChanges();
    const badge = (fixture.nativeElement as HTMLElement).querySelector('.badge')!;
    TestBed.resetTestingModule();
    return { text: badge.textContent!.trim(), tone: badge.getAttribute('data-tone') };
  }

  it('says the status in words, never by colour alone', () => {
    expect(render('ACTIVE')).toEqual({ text: 'In progress', tone: 'accent' });
    expect(render('SUSPENDED')).toEqual({ text: 'On hold', tone: 'neutral' });
    expect(render('COMPLETED', 'APPROVED')).toEqual({ text: 'Approved', tone: 'ok' });
    expect(render('COMPLETED', 'REJECTED')).toEqual({ text: 'Rejected', tone: 'danger' });
    expect(render('CANCELLED')).toEqual({ text: 'Cancelled', tone: 'neutral' });
  });
});
