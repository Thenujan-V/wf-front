import { Component, ElementRef, OnDestroy, afterNextRender, effect, input, output, signal, untracked, viewChild } from '@angular/core';
import { Editor } from '@tiptap/core';
import { TableKit } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';

interface Tool {
  id: string;
  label: string;
  title: string;
  run: (editor: Editor) => void;
  active?: (editor: Editor) => boolean;
}

const TOOLS: Tool[] = [
  { id: 'h1', label: 'H1', title: 'Heading 1', run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), active: (e) => e.isActive('heading', { level: 1 }) },
  { id: 'h2', label: 'H2', title: 'Heading 2', run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive('heading', { level: 2 }) },
  { id: 'h3', label: 'H3', title: 'Heading 3', run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), active: (e) => e.isActive('heading', { level: 3 }) },
  { id: 'bold', label: 'B', title: 'Bold', run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive('bold') },
  { id: 'italic', label: 'I', title: 'Italic', run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive('italic') },
  { id: 'underline', label: 'U', title: 'Underline', run: (e) => e.chain().focus().toggleUnderline().run(), active: (e) => e.isActive('underline') },
  { id: 'bullets', label: '• List', title: 'Bullet list', run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive('bulletList') },
  { id: 'numbers', label: '1. List', title: 'Numbered list', run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive('orderedList') },
  { id: 'quote', label: 'Quote', title: 'Quote', run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive('blockquote') },
  { id: 'table', label: 'Table', title: 'Insert a 3 by 3 table', run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: 'link', label: 'Link', title: 'Add or remove a link', run: (e) => {
    if (e.isActive('link')) {
      e.chain().focus().unsetLink().run();
      return;
    }
    const href = linkAddress(window.prompt('Link address, for example example.com or mailto:name@example.com'));
    if (href) {
      e.chain().focus().setLink({ href }).run();
    }
  }, active: (e) => e.isActive('link') },
];

/**
 * What a person typed for a link, as an address the server keeps: web and mail addresses only, and a bare
 * "example.com" becomes https. Null for nothing, or for any other kind of address (the server would drop the link).
 */
export function linkAddress(typed: string | null): string | null {
  const address = (typed ?? '').trim();
  if (!address) {
    return null;
  }
  if (/^(https?:|mailto:)/i.test(address)) {
    return address;
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(address) ? null : `https://${address}`;
}

/**
 * The rich-text editor of written documents. The only file that knows TipTap: everything else gives it HTML and gets
 * HTML back. What it allows is a convenience; the server decides what is kept.
 */
@Component({
  selector: 'app-rich-text-editor',
  template: `
    @if (editable()) {
      <div data-testid="toolbar" role="toolbar" aria-label="Formatting" class="flex flex-wrap gap-1 border-b border-line p-2">
        @for (tool of tools; track tool.id) {
          <button type="button" class="btn btn-secondary px-2 py-1 text-xs" [attr.data-testid]="'format-' + tool.id"
                  [title]="tool.title" [attr.aria-label]="tool.title" [attr.aria-pressed]="isActive(tool)"
                  (mousedown)="$event.preventDefault()" (click)="run(tool)">{{ tool.label }}</button>
        }
      </div>
    }
    <div #host data-testid="text" class="rich-text min-h-64 p-4"></div>
  `,
})
export class RichTextEditor implements OnDestroy {
  readonly content = input('');
  readonly editable = input(true);
  /** The text after each change the person makes. */
  readonly changed = output<string>();

  protected readonly tools = TOOLS;
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private editor: Editor | null = null;
  /** Bumped on every editor transaction, so the toolbar's pressed states are read again. */
  private readonly tick = signal(0);
  /** True while the text is being set from outside, which is not a change by the person. */
  private setting = false;

  constructor() {
    afterNextRender(() => {
      this.editor = new Editor({
        element: this.host().nativeElement,
        extensions: [// Code and code blocks are off: the server does not keep them, and the editor must not show what will not be saved.
          StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false }, code: false, codeBlock: false }), TableKit],
        content: this.content(),
        editable: this.editable(),
        onUpdate: ({ editor }) => {
          if (!this.setting) {
            this.changed.emit(editor.getHTML());
          }
        },
        onTransaction: () => this.tick.update((n) => n + 1),
      });
    });
    effect(() => {
      const content = this.content();
      untracked(() => this.show(content));
    });
    effect(() => {
      const editable = this.editable();
      untracked(() => this.editor?.setEditable(editable));
    });
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
  }

  /** The text as it stands. */
  html(): string {
    return this.editor?.getHTML() ?? this.content();
  }

  /** For tests and "select everything" shortcuts. */
  selectAll(): void {
    this.editor?.commands.selectAll();
  }

  protected run(tool: Tool): void {
    if (this.editor) {
      tool.run(this.editor);
    }
  }

  protected isActive(tool: Tool): boolean {
    this.tick();
    return !!this.editor && !!tool.active?.(this.editor);
  }

  private show(content: string): void {
    if (!this.editor || this.editor.getHTML() === content) {
      return;
    }
    this.setting = true;
    try {
      this.editor.commands.setContent(content);
    } finally {
      this.setting = false;
    }
  }
}
