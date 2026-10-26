import { formatDuration } from './duration';

describe('formatDuration', () => {
  it('says how long something took in the units a person would use', () => {
    expect(formatDuration(20)).toBe('under a minute');
    expect(formatDuration(90)).toBe('2 min');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(5400)).toBe('1 h 30 min');
    expect(formatDuration(46800)).toBe('13 h');
    expect(formatDuration(172800)).toBe('2 d');
    expect(formatDuration(200000)).toBe('2 d 7 h');
  });

  it('shows a dash when there is nothing to show', () => {
    for (const nothing of [null, undefined, Number.NaN, -5]) {
      expect(formatDuration(nothing)).toBe('—');
    }
  });
});
