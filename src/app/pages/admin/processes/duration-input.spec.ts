import { TestBed } from '@angular/core/testing';
import { DurationInput } from './duration-input';

describe('DurationInput', () => {
  function setup(value: string | undefined) {
    const fixture = TestBed.createComponent(DurationInput);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('label', 'Due in');
    fixture.componentRef.setInput('testId', 'due');
    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
    fixture.detectChanges();
    const el = <T extends HTMLElement>(id: string) => (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`) as T;
    return { fixture, el, emitted };
  }

  it('edits an amount and a unit', () => {
    const { el, emitted } = setup('P2D');
    expect(el<HTMLInputElement>('due-amount').value).toBe('2');
    el<HTMLInputElement>('due-amount').value = '5';
    el<HTMLInputElement>('due-amount').dispatchEvent(new Event('change'));
    expect(emitted.at(-1)).toBe('P5D');
    el<HTMLSelectElement>('due-unit').value = 'hours';
    el<HTMLSelectElement>('due-unit').dispatchEvent(new Event('change'));
    expect(emitted.at(-1)).toBe('PT2H');
  });

  it('ignores amounts that are not whole positive numbers', () => {
    const { el, emitted } = setup('PT4H');
    for (const text of ['0', '-1', 'abc', '']) {
      el<HTMLInputElement>('due-amount').value = text;
      el<HTMLInputElement>('due-amount').dispatchEvent(new Event('change'));
    }
    expect(emitted).toEqual([]);
  });

  it('edits any other ISO-8601 duration as text', () => {
    const { el, emitted } = setup('PT1H30M');
    expect(el('due-amount')).toBeNull();
    el<HTMLInputElement>('due-raw').value = ' PT90M ';
    el<HTMLInputElement>('due-raw').dispatchEvent(new Event('change'));
    expect(emitted.at(-1)).toBe('PT90M');
  });

  it('puts back the saved amount when the entry is not a whole positive number', async () => {
    const { fixture, el } = setup('PT4H');
    el<HTMLInputElement>('due-amount').value = '0';
    el<HTMLInputElement>('due-amount').dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(el<HTMLInputElement>('due-amount').value).toBe('4');
  });
});
