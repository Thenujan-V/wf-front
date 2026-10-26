import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormDefinition } from '../../../core/forms/form.models';
import { DesignCanvas, spanAt } from './design-canvas';

const claim: FormDefinition = {
  sections: [
    { id: 'claim', title: 'Claim', columns: 3 },
    { id: 'items', title: 'Items', columns: 1 },
    { id: 'empty', title: 'Empty', columns: 2 },
  ],
  fields: [
    { key: 'note', type: 'display', label: 'Read this first' },
    { key: 'amount', type: 'currency', label: 'Amount', section: 'claim', required: true },
    { key: 'purpose', type: 'text', label: 'Purpose', section: 'claim', span: 2 },
    { key: 'why', type: 'textarea', label: 'Why', section: 'claim', visibleWhen: { var: 'form.amount', op: 'gt', value: 100 } },
    { key: 'lines', type: 'table', label: 'Lines', section: 'items', columns: [{ key: 'cost', type: 'currency', label: 'Cost' }] },
  ],
};

describe('DesignCanvas', () => {
  function render(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ imports: [DesignCanvas] });
    const fixture = TestBed.createComponent(DesignCanvas);
    fixture.componentRef.setInput('definition', claim);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    const events: unknown[][] = [];
    const canvas = fixture.componentInstance;
    canvas.fieldSelect.subscribe((key) => events.push(['select', key]));
    canvas.fieldMove.subscribe((move) => events.push(['move', move]));
    canvas.fieldRemove.subscribe((key) => events.push(['remove', key]));
    canvas.sectionPick.subscribe((id) => events.push(['pick', id]));
    canvas.sectionRename.subscribe((rename) => events.push(['rename', rename]));
    canvas.sectionColumns.subscribe((columns) => events.push(['columns', columns]));
    canvas.sectionRemove.subscribe((id) => events.push(['removeSection', id]));
    canvas.sectionAdd.subscribe(() => events.push(['addSection']));
    canvas.fieldAdd.subscribe((add) => events.push(['add', add]));
    canvas.fieldPlace.subscribe((place) => events.push(['place', place]));
    canvas.fieldSpan.subscribe((span) => events.push(['span', span]));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const tile = (key: string) => el(`select-${key}`).closest('[data-testid="canvas-field"]') as HTMLElement;
    const sections = () => [...element.querySelectorAll<HTMLElement>('[data-testid="canvas-section"]')];
    /** Raises the drop list's own event, as the CDK does when something is dropped on that section. */
    const drop = (grid: number, event: { data: object; from: object; to: object; previousIndex: number; currentIndex: number }) =>
      fixture.debugElement.queryAll(By.css('[data-testid="canvas-grid"]'))[grid].triggerEventHandler('cdkDropListDropped', {
        item: { data: event.data }, previousContainer: event.from, container: event.to,
        previousIndex: event.previousIndex, currentIndex: event.currentIndex,
      });
    return { fixture, element, el, tile, sections, events, drop };
  }

  it('draws every section as the form\'s grid, with the fields in no section first', () => {
    const { sections, tile } = render();

    expect(sections().length).toBe(4);
    expect(sections()[0].textContent).toContain('Not in a section');
    expect(sections()[0].textContent).toContain('Read this first');
    const grid = sections()[1].querySelector('[data-testid="canvas-grid"]') as HTMLElement;
    expect(grid.className).toContain('md:grid-cols-3');
    expect(tile('amount').className).toContain('md:col-span-1');
    expect(tile('purpose').className).toContain('md:col-span-2');
    expect(tile('why').className).toContain('md:col-span-3');
  });

  it('draws real controls that cannot be changed, including fields a rule would hide', () => {
    const { element, tile } = render();

    expect((element.querySelector('#f-amount') as HTMLInputElement).disabled).toBe(true);
    expect(element.querySelector('#f-why')).not.toBeNull();
    expect(element.querySelector('#f-lines-0-cost')).not.toBeNull();
    expect(tile('amount').querySelector('[inert]')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('a click on a field selects it, and the selected field says so', () => {
    const { el, events } = render();
    el<HTMLButtonElement>('select-amount').click();
    expect(events).toEqual([['select', 'amount']]);
    expect(el('select-amount').getAttribute('aria-label')).toBe('Amount, Money');
    expect(el('select-amount').getAttribute('aria-pressed')).toBe('false');

    TestBed.resetTestingModule();
    const chosen = render({ selected: 'amount' });
    expect(chosen.el('select-amount').getAttribute('aria-pressed')).toBe('true');
    expect(chosen.tile('amount').className).toContain('border-accent');
    expect(chosen.tile('purpose').className).not.toContain('border-accent');
  });

  it('every field has move and delete buttons', () => {
    const { element, el, events } = render();

    (element.querySelector('[aria-label="Move Purpose up"]') as HTMLButtonElement).click();
    (element.querySelector('[aria-label="Move Purpose down"]') as HTMLButtonElement).click();
    el<HTMLButtonElement>('delete-purpose').click();

    expect(events).toEqual([
      ['move', { key: 'purpose', direction: -1 }], ['move', { key: 'purpose', direction: 1 }], ['remove', 'purpose'],
    ]);
  });

  it('marks fields that have a rule, a rule that needs fixing, and problems', () => {
    const { tile } = render({
      ruleIssues: [{ key: 'why', message: 'Why: its rule uses "amount", which is not a field above it' }],
      problems: [
        { field: 'lines[0].cost', code: 'X', message: 'Bad' }, { field: 'lines', code: 'Y', message: 'Worse' },
        { field: 'amount', code: 'Z', message: 'Odd' },
      ],
    });

    expect(tile('why').textContent).toContain('has a rule');
    expect(tile('why').textContent).toContain('rule needs fixing');
    expect(tile('amount').textContent).not.toContain('has a rule');
    expect(tile('lines').textContent).toContain('2 problems');
    expect(tile('amount').textContent).toContain('1 problem');
  });

  it('a section\'s title, columns and removal are in its header', () => {
    const { sections, el, events } = render({ targetSection: 'claim' });
    const header = sections()[1];
    const title = header.querySelector('input[aria-label="Section title"]') as HTMLInputElement;
    const columns = header.querySelector('select[aria-label="Columns"]') as HTMLSelectElement;

    expect(title.value).toBe('Claim');
    expect([...columns.options].map((o) => o.value)).toEqual(['1', '2', '3', '4']);
    expect(columns.value).toBe('3');
    expect(header.textContent).toContain('New fields go here');

    title.value = 'Your claim';
    title.dispatchEvent(new Event('change'));
    columns.value = '4';
    columns.dispatchEvent(new Event('change'));
    el<HTMLButtonElement>('pick-items').click();
    (sections()[2].querySelector('[data-testid="remove-section"]') as HTMLButtonElement).click();
    el<HTMLButtonElement>('add-section').click();

    expect(events).toEqual([
      ['rename', { id: 'claim', title: 'Your claim' }], ['columns', { id: 'claim', columns: 4 }],
      ['pick', 'items'], ['removeSection', 'items'], ['addSection'],
    ]);
  });


  it('reports where a dragged field was dropped', () => {
    const { drop, events } = render();
    const claimList = {};
    const itemsList = {};

    drop(1, { data: { key: 'amount' }, from: claimList, to: claimList, previousIndex: 0, currentIndex: 2 });
    drop(2, { data: { key: 'purpose' }, from: claimList, to: itemsList, previousIndex: 1, currentIndex: 0 });
    drop(0, { data: { key: 'why' }, from: claimList, to: {}, previousIndex: 2, currentIndex: 1 });

    expect(events).toEqual([
      ['place', { key: 'amount', section: 'claim', index: 2 }],
      ['place', { key: 'purpose', section: 'items', index: 0 }],
      ['place', { key: 'why', section: '', index: 1 }],
    ]);
  });

  it('reports a field type dragged in from the palette', () => {
    const { drop, events } = render();

    drop(3, { data: { type: 'date' }, from: {}, to: {}, previousIndex: 4, currentIndex: 0 });

    expect(events).toEqual([['add', { type: 'date', section: 'empty', index: 0 }]]);
  });

  it('a field dropped back where it started changes nothing', () => {
    const { drop, events } = render();
    const claimList = {};

    drop(1, { data: { key: 'purpose' }, from: claimList, to: claimList, previousIndex: 1, currentIndex: 1 });

    expect(events).toEqual([]);
  });

  it('every field has a handle to drag it by, and an empty section invites a drop', () => {
    const { tile, sections } = render();

    expect(tile('amount').querySelector('[data-testid="drag-handle"]')).not.toBeNull();
    expect(sections()[3].textContent).toContain('Drag a field here, or pick one from the palette.');
  });

  it('turns a distance dragged into a number of columns', () => {
    // Three columns of 200px with 16px between them.
    expect(spanAt(200, 632, 3, 16)).toBe(1);
    expect(spanAt(300, 632, 3, 16)).toBe(1);
    expect(spanAt(330, 632, 3, 16)).toBe(2);
    expect(spanAt(416, 632, 3, 16)).toBe(2);
    expect(spanAt(632, 632, 3, 16)).toBe(3);
    expect(spanAt(5000, 632, 3, 16)).toBe(3);
    expect(spanAt(-40, 632, 3, 16)).toBe(1);
    // Before the page has a size there is nothing to measure against.
    expect(spanAt(100, 0, 3, 16)).toBe(1);
  });

  describe('resizing', () => {
    const box = (left: number, width: number) => ({ left, width, top: 0, right: left + width, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    let rect: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // Every element reports the same box: a 632px grid starting at the left edge.
      rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(box(0, 632));
    });
    afterEach(() => rect.mockRestore());

    it('only the selected field of a section with several columns has a handle', () => {
      expect(render().el('resize-handle')).toBeNull();
      TestBed.resetTestingModule();
      const chosen = render({ selected: 'amount' });
      expect(chosen.tile('amount').querySelector('[data-testid="resize-handle"]')).not.toBeNull();
      expect(chosen.element.querySelectorAll('[data-testid="resize-handle"]').length).toBe(1);
      TestBed.resetTestingModule();
      // "lines" is in a one-column section; "note" is in no section.
      expect(render({ selected: 'lines' }).el('resize-handle')).toBeNull();
      TestBed.resetTestingModule();
      expect(render({ selected: 'note' }).el('resize-handle')).toBeNull();
    });

    it('dragging the handle shows the new width at once and reports it on release', async () => {
      const { fixture, el, tile, events } = render({ selected: 'amount' });

      el('resize-handle').dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, bubbles: true }));
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 420 }));
      await fixture.whenStable();
      expect(tile('amount').className).toContain('md:col-span-2');
      expect(events).toEqual([]);

      document.dispatchEvent(new MouseEvent('pointerup'));
      await fixture.whenStable();
      expect(events).toEqual([['span', { key: 'amount', span: 2 }]]);

      // Once released, moving the pointer does nothing more.
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 632 }));
      document.dispatchEvent(new MouseEvent('pointerup'));
      expect(events.length).toBe(1);
    });

    it('releasing on the same width reports nothing', async () => {
      const { fixture, el, events } = render({ selected: 'amount' });

      el('resize-handle').dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, bubbles: true }));
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 420 }));
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 190 }));
      document.dispatchEvent(new MouseEvent('pointerup'));
      await fixture.whenStable();

      expect(events).toEqual([]);
    });

    it('a cancelled drag reports nothing and puts the width back', async () => {
      const { fixture, el, tile, events } = render({ selected: 'amount' });

      el('resize-handle').dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, bubbles: true }));
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 632 }));
      document.dispatchEvent(new MouseEvent('pointercancel'));
      await fixture.whenStable();

      expect(events).toEqual([]);
      expect(tile('amount').className).toContain('md:col-span-1');
    });
  });
});
