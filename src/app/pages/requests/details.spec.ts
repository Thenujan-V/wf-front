import { parseDetails } from './details';

describe('parseDetails', () => {
  it('types numbers and booleans and skips empty rows', () => {
    expect(parseDetails([
      { name: 'amount', value: '20000' },
      { name: 'rate', value: '-1.5' },
      { name: 'urgent', value: 'true' },
      { name: 'purpose', value: '  Team offsite ' },
      { name: '', value: '' },
    ])).toEqual({ data: { amount: 20000, rate: -1.5, urgent: true, purpose: 'Team offsite' }, errors: [] });
  });

  it('rejects bad and repeated names', () => {
    const { errors } = parseDetails([
      { name: '2fast', value: 'x' },
      { name: 'amount', value: '1' },
      { name: 'amount', value: '2' },
      { name: '', value: 'orphan' },
    ]);
    expect(errors).toEqual([
      '"2fast" is not a valid name: start with a letter and use letters, digits or _.',
      '"amount" is used more than once.',
      'Every value needs a name.',
    ]);
  });

  it('keeps values with a leading zero as text, so phone numbers and codes survive', () => {
    expect(parseDetails([
      { name: 'phone', value: '0771234567' },
      { name: 'code', value: '007' },
      { name: 'zero', value: '0' },
      { name: 'fraction', value: '0.5' },
      { name: 'negative', value: '-0.25' },
    ]).data).toEqual({ phone: '0771234567', code: '007', zero: 0, fraction: 0.5, negative: -0.25 });
  });
});
