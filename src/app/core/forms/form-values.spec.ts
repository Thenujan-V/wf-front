import { toTime } from '../expression/condition';
import { columnTotal, isoToLocalInput, localInputToIso, toNumber, fileNames } from './form-values';

describe('form values', () => {
  it('turns a local date-time into ISO with the browser offset and back', () => {
    const iso = localInputToIso('2026-09-28T09:30')!;

    expect(iso).toMatch(/^2026-09-28T09:30:00[+-]\d{2}:\d{2}$/);
    expect(toTime(iso)).toBe(new Date(2026, 8, 28, 9, 30).getTime());
    expect(isoToLocalInput(iso)).toBe('2026-09-28T09:30');
    expect(localInputToIso('')).toBeNull();
    expect(isoToLocalInput(null)).toBe('');
  });

  it('adds up numeric cells and ignores the rest', () => {
    expect(columnTotal([{ cost: 10.5 }, { cost: 2 }, { cost: 'x' }, {}], 'cost')).toBe(12.5);
    expect(columnTotal(undefined, 'cost')).toBe(0);
  });

  it('reads numbers typed into inputs', () => {
    expect(toNumber('12.50')).toBe(12.5);
    expect(toNumber(' ')).toBeNull();
    expect(toNumber('abc')).toBeNull();
  });
});

describe('fileNames', () => {
  it('lists a file field by its file names', () => {
    expect(fileNames([{ documentId: 'd1', name: 'Taxi.pdf' }, { documentId: 'd2', name: 'Hotel.pdf' }])).toBe('Taxi.pdf, Hotel.pdf');
  });

  it('is null for anything that is not a list of file references', () => {
    expect(fileNames('Taxi.pdf')).toBeNull();
    expect(fileNames([])).toBeNull();
    expect(fileNames([{ description: 'Taxi', cost: 10 }])).toBeNull();
  });
});
