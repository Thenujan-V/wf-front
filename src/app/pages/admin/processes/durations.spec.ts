import { describeDuration, fromIsoDuration, toIsoDuration } from './durations';

describe('durations', () => {
  it('writes simple durations as ISO-8601 that java.time.Duration reads', () => {
    expect(toIsoDuration({ amount: 30, unit: 'minutes' })).toBe('PT30M');
    expect(toIsoDuration({ amount: 48, unit: 'hours' })).toBe('PT48H');
    expect(toIsoDuration({ amount: 2, unit: 'days' })).toBe('P2D');
  });

  it('reads back only what it writes', () => {
    expect(fromIsoDuration('PT30M')).toEqual({ amount: 30, unit: 'minutes' });
    expect(fromIsoDuration('PT48H')).toEqual({ amount: 48, unit: 'hours' });
    expect(fromIsoDuration('P2D')).toEqual({ amount: 2, unit: 'days' });
    expect(fromIsoDuration('PT1H30M')).toBeNull();
    expect(fromIsoDuration(undefined)).toBeNull();
    expect(fromIsoDuration('soon')).toBeNull();
  });

  it('describes durations for people', () => {
    expect(describeDuration('P1D')).toBe('1 day');
    expect(describeDuration('PT4H')).toBe('4 hours');
    expect(describeDuration('PT1H30M')).toBe('PT1H30M');
  });
});
