import { goesAgainst, humanize, statusLabel, statusTone } from './labels';

describe('labels', () => {
  it('turns codes into sentence case', () => {
    expect(humanize('APPROVE')).toBe('Approve');
    expect(humanize('SEND_BACK')).toBe('Send back');
    expect(humanize('')).toBe('');
  });

  it('describes request status, preferring the end status of completed requests', () => {
    expect(statusLabel('ACTIVE')).toBe('In progress');
    expect(statusLabel('SUSPENDED')).toBe('On hold');
    expect(statusLabel('CANCELLED')).toBe('Cancelled');
    expect(statusLabel('COMPLETED', 'APPROVED')).toBe('Approved');
    expect(statusLabel('COMPLETED', null)).toBe('Completed');
  });

  it('gives each request status its colour', () => {
    expect(statusTone('ACTIVE')).toBe('accent');
    expect(statusTone('SUSPENDED')).toBe('neutral');
    expect(statusTone('CANCELLED')).toBe('neutral');
    expect(statusTone('COMPLETED', 'APPROVED')).toBe('ok');
    expect(statusTone('COMPLETED', null)).toBe('ok');
    expect(statusTone('COMPLETED', 'REJECTED')).toBe('danger');
    expect(statusTone('COMPLETED', 'declined_by_finance')).toBe('danger');
    expect(statusTone('COMPLETED', 'Access denied')).toBe('danger');
    expect(statusTone('COMPLETED', 'FAILED')).toBe('danger');
    expect(statusTone('SOMETHING_NEW')).toBe('neutral');
  });

  it('knows the names that go against a request, for endings and for outcomes alike', () => {
    for (const against of ['REJECT', 'REJECTED', 'DECLINE', 'declined_by_finance', 'DENY', 'Access denied', 'FAILED']) {
      expect(goesAgainst(against), against).toBe(true);
    }
    for (const fine of ['APPROVE', 'APPROVED', 'SEND_BACK', 'DONE', '', null, undefined]) {
      expect(goesAgainst(fine), String(fine)).toBe(false);
    }
  });
});
