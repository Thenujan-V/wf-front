import { slaState } from './sla';

describe('slaState', () => {
  const created = '2026-09-28T09:00:00Z';
  const due = '2026-09-30T09:00:00Z'; // 48 h window

  it('has no state without a usable due date', () => {
    expect(slaState(created, null, new Date('2026-09-28T10:00:00Z'))).toBe('none');
    expect(slaState(created, 'soon', new Date('2026-09-28T10:00:00Z'))).toBe('none');
  });

  it('is on track early in the window', () => {
    expect(slaState(created, due, new Date('2026-09-28T10:00:00Z'))).toBe('on-track');
  });

  it('is due soon in the last quarter of the window or the last four hours', () => {
    expect(slaState(created, due, new Date('2026-09-29T21:00:00Z'))).toBe('due-soon'); // 12 h left of 48
    expect(slaState('2026-09-29T21:00:00Z', due, new Date('2026-09-30T05:30:00Z'))).toBe('due-soon'); // 3.5 h left of a 12 h window
  });

  it('is overdue from the due time on', () => {
    expect(slaState(created, due, new Date('2026-09-30T09:00:00Z'))).toBe('overdue');
    expect(slaState(created, due, new Date('2026-10-02T09:00:00Z'))).toBe('overdue');
  });
});
