import { TestBed } from '@angular/core/testing';
import { Icon } from './icon';
import { ICONS, IconName } from './icons';

describe('Icon', () => {
  function render(name: IconName, label?: string) {
    TestBed.configureTestingModule({ imports: [Icon] });
    const fixture = TestBed.createComponent(Icon);
    fixture.componentRef.setInput('name', name);
    if (label) {
      fixture.componentRef.setInput('label', label);
    }
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('svg')!;
  }

  it('draws the named icon', () => {
    const svg = render('inbox');

    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.children.length).toBe(ICONS.inbox.length);
    expect(svg.children.length).toBeGreaterThan(0);
  });

  it('is decoration unless it is given a name', () => {
    expect(render('bell').getAttribute('aria-hidden')).toBe('true');
    TestBed.resetTestingModule();

    const named = render('bell', 'Notifications');
    expect(named.getAttribute('aria-hidden')).toBeNull();
    expect(named.getAttribute('role')).toBe('img');
    expect(named.getAttribute('aria-label')).toBe('Notifications');
  });

  it('has a drawing for every name, made only of shapes it can draw', () => {
    const shapes = ['path', 'circle', 'line', 'polyline', 'polygon', 'rect', 'ellipse'];
    for (const [name, nodes] of Object.entries(ICONS)) {
      expect(nodes.length, name).toBeGreaterThan(0);
      for (const [tag] of nodes) {
        expect(shapes, `${name}: ${tag}`).toContain(tag);
      }
    }
  });
});
