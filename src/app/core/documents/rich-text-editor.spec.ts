import { TestBed } from '@angular/core/testing';
import { RichTextEditor, linkAddress } from './rich-text-editor';

describe('RichTextEditor', () => {
  function setup(content: string, editable = true) {
    TestBed.configureTestingModule({ imports: [RichTextEditor] });
    const fixture = TestBed.createComponent(RichTextEditor);
    fixture.componentRef.setInput('content', content);
    fixture.componentRef.setInput('editable', editable);
    const changes: string[] = [];
    fixture.componentInstance.changed.subscribe((html) => changes.push(html));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, changes, editor: fixture.componentInstance };
  }

  it('shows the text it is given without reporting a change', () => {
    const s = setup('<h1>Policy</h1><p>Hello</p>');

    expect(s.element.querySelector('h1')?.textContent).toBe('Policy');
    expect(s.editor.html()).toBe('<h1>Policy</h1><p>Hello</p>');
    expect(s.changes).toEqual([]);
  });

  it('applies formatting from the toolbar and reports the new text', () => {
    const s = setup('<p>Hello</p>');

    s.editor.selectAll();
    (s.element.querySelector('[data-testid="format-bold"]') as HTMLButtonElement).click();

    expect(s.changes.at(-1)).toBe('<p><strong>Hello</strong></p>');
    s.fixture.detectChanges();
    expect(s.element.querySelector('[data-testid="format-bold"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('replaces the text when given a new one, quietly', () => {
    const s = setup('<p>Old</p>');

    s.fixture.componentRef.setInput('content', '<p>New from the server</p>');
    s.fixture.detectChanges();

    expect(s.editor.html()).toBe('<p>New from the server</p>');
    expect(s.changes).toEqual([]);
  });

  it('offers no formatting the server would remove: code is plain text', () => {
    const s = setup('<pre><code>let x = 1;</code></pre><p>Use <code>x</code> here</p>');

    expect(s.editor.html()).not.toContain('<pre');
    expect(s.editor.html()).not.toContain('<code');
    expect(s.editor.html()).toContain('let x = 1;');
  });

  it('turns what is typed for a link into an address the server keeps, or nothing', () => {
    expect(linkAddress(' example.com/a ')).toBe('https://example.com/a');
    expect(linkAddress('https://example.com')).toBe('https://example.com');
    expect(linkAddress('HTTP://example.com')).toBe('HTTP://example.com');
    expect(linkAddress('mailto:bob@example.com')).toBe('mailto:bob@example.com');
    expect(linkAddress('javascript:alert(1)')).toBeNull();
    expect(linkAddress('ftp://example.com')).toBeNull();
    expect(linkAddress('   ')).toBeNull();
    expect(linkAddress(null)).toBeNull();
  });

  it('read-only: no toolbar, and the text cannot be typed into', () => {
    const s = setup('<p>Fixed</p>', false);

    expect(s.element.querySelector('[data-testid="toolbar"]')).toBeNull();
    expect(s.element.querySelector('[contenteditable="true"]')).toBeNull();
  });
});
