import { keyFromName } from './key-from-name';

describe('keyFromName', () => {
  it('lowercases and joins words with dashes', () => {
    expect(keyFromName('Travel request')).toBe('travel-request');
  });

  it('drops punctuation, accents and dashes at the ends', () => {
    expect(keyFromName('  Congé payé (EU) ')).toBe('conge-paye-eu');
  });

  it('keeps at most 100 characters and no trailing dash', () => {
    const key = keyFromName(`${'a'.repeat(99)} b`);
    expect(key).toBe('a'.repeat(99));
  });

  it('is empty for a name with nothing usable', () => {
    expect(keyFromName('—')).toBe('');
  });
});
