import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { RichTextEditor } from '../../core/documents/rich-text-editor';
import { SILENT_ERRORS } from '../../core/http/problem.interceptor';
import { DocumentEditorPage } from './document-editor';

@Component({ selector: 'app-rich-text-editor', template: '' })
class StubEditor {
  readonly content = input('');
  readonly editable = input(true);
  readonly changed = output<string>();
}

const doc = { id: 'd1', folderId: 'fin', name: 'Travel policy', kind: 'WRITTEN', state: 'DRAFT', hasDraft: true,
  permission: 'WRITE', checkedOutBy: 'bob', versions: [], currentVersionId: null, linkedInstanceId: null, inLibrary: true };
const draft = { html: '<p>Hello</p>', revision: 2, updatedBy: 'bob', updatedAt: '2026-10-06T09:00:00Z', editable: true };

describe('DocumentEditorPage', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    TestBed.configureTestingModule({
      imports: [DocumentEditorPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { userId: signal('bob'), hasRole: () => false } }],
    }).overrideComponent(DocumentEditorPage, { remove: { imports: [RichTextEditor] }, add: { imports: [StubEditor] } });
    const fixture = TestBed.createComponent(DocumentEditorPage);
    fixture.componentRef.setInput('id', 'd1');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const controller = TestBed.inject(HttpTestingController);
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const editor = () => fixture.debugElement.query((d) => d.componentInstance instanceof StubEditor).componentInstance as StubEditor;
    const type = (html: string) => { editor().changed.emit(html); fixture.detectChanges(); };
    return { fixture, element, controller, el, editor, type, page: fixture.componentInstance };
  }

  /** The page checks the document out, then reads the draft. */
  function open(s: ReturnType<typeof setup>, checkedOut: object | { status: number; code: string } = doc, read = draft) {
    const checkout = s.controller.expectOne({ method: 'POST', url: '/api/documents/documents/d1/checkout' });
    if ('status' in checkedOut) {
      checkout.flush({ code: checkedOut.code, detail: 'Checked out by someone else', checkedOutBy: 'carol' },
        { status: checkedOut.status, statusText: 'Conflict' });
    } else {
      checkout.flush(checkedOut);
    }
    s.controller.expectOne('/api/documents/documents/d1/draft').flush(read);
    s.fixture.detectChanges();
  }

  it('checks the document out, shows its text and saves a moment after typing stops', () => {
    const s = setup();
    open(s);
    expect(s.editor().content()).toBe('<p>Hello</p>');
    expect(s.editor().editable()).toBe(true);
    expect(s.el('save-status').textContent).toContain('Saved');
    expect(s.page.hasUnsavedChanges()).toBe(false);

    s.type('<p>Hello w</p>');
    s.type('<p>Hello world</p>');
    expect(s.el('save-status').textContent).toContain('Not saved yet');
    expect(s.page.hasUnsavedChanges()).toBe(true);
    s.controller.expectNone({ method: 'PUT', url: '/api/documents/documents/d1/draft' });

    vi.advanceTimersByTime(DocumentEditorPage.SAVE_DELAY_MS);
    const save = s.controller.expectOne({ method: 'PUT', url: '/api/documents/documents/d1/draft' });
    expect(save.request.body).toEqual({ html: '<p>Hello world</p>', revision: 2 });
    s.fixture.detectChanges();
    expect(s.el('save-status').textContent).toContain('Saving');
    save.flush({ ...draft, html: '<p>Hello world</p>', revision: 3 });
    s.fixture.detectChanges();
    expect(s.el('save-status').textContent).toContain('Saved');
    expect(s.page.hasUnsavedChanges()).toBe(false);
  });

  it('sends the next save with the revision the last one returned, one at a time', () => {
    const s = setup();
    open(s);
    s.type('<p>One</p>');
    vi.advanceTimersByTime(DocumentEditorPage.SAVE_DELAY_MS);
    const first = s.controller.expectOne({ method: 'PUT', url: '/api/documents/documents/d1/draft' });
    s.type('<p>Two</p>'); // typed while the first save is on its way
    vi.advanceTimersByTime(DocumentEditorPage.SAVE_DELAY_MS);
    s.controller.expectNone({ method: 'PUT', url: '/api/documents/documents/d1/draft' });

    first.flush({ ...draft, html: '<p>One</p>', revision: 3 });
    const second = s.controller.expectOne({ method: 'PUT', url: '/api/documents/documents/d1/draft' });
    expect(second.request.body).toEqual({ html: '<p>Two</p>', revision: 3 });
    second.flush({ ...draft, html: '<p>Two</p>', revision: 4 });
  });

  it('a failed save says so, keeps the text and tries again', () => {
    const s = setup();
    open(s);
    s.type('<p>Kept</p>');
    vi.advanceTimersByTime(DocumentEditorPage.SAVE_DELAY_MS);
    s.controller.expectOne({ method: 'PUT', url: '/api/documents/documents/d1/draft' })
      .flush(null, { status: 503, statusText: 'Unavailable' });
    s.fixture.detectChanges();
    expect(s.el('save-status').textContent).toContain('Not saved');
    expect(s.page.hasUnsavedChanges()).toBe(true);

    vi.advanceTimersByTime(DocumentEditorPage.RETRY_DELAY_MS);
    const retry = s.controller.expectOne({ method: 'PUT', url: '/api/documents/documents/d1/draft' });
    expect(retry.request.body).toEqual({ html: '<p>Kept</p>', revision: 2 });
    retry.flush({ ...draft, html: '<p>Kept</p>', revision: 3 });
  });

  it('a text changed somewhere else stops the editing and offers to reload', () => {
    const s = setup();
    open(s);
    s.type('<p>Mine</p>');
    vi.advanceTimersByTime(DocumentEditorPage.SAVE_DELAY_MS);
    s.controller.expectOne({ method: 'PUT', url: '/api/documents/documents/d1/draft' })
      .flush({ code: 'DOC_DRAFT_CHANGED', detail: 'Changed somewhere else' }, { status: 409, statusText: 'Conflict' });
    s.fixture.detectChanges();

    expect(s.el('editor-problem').textContent).toContain('changed somewhere else');
    expect(s.editor().editable()).toBe(false);
    vi.advanceTimersByTime(DocumentEditorPage.RETRY_DELAY_MS * 3);
    s.controller.expectNone({ method: 'PUT', url: '/api/documents/documents/d1/draft' });

    s.el<HTMLButtonElement>('reload').click();
    open(s, doc, { ...draft, html: '<p>Theirs</p>', revision: 7 });
    expect(s.editor().content()).toBe('<p>Theirs</p>');
    expect(s.editor().editable()).toBe(true);
  });

  it('losing the check-out, or the document going to approval, stops the editing and says why', () => {
    for (const [code, words] of [['DOC_NOT_CHECKED_OUT', 'no longer checked out to you'], ['DOC_CHECKED_OUT', 'no longer checked out to you'],
      ['DOC_IN_APPROVAL', 'sent for approval']]) {
      TestBed.resetTestingModule();
      const s = setup();
      open(s);
      s.type('<p>x</p>');
      vi.advanceTimersByTime(DocumentEditorPage.SAVE_DELAY_MS);
      s.controller.expectOne({ method: 'PUT', url: '/api/documents/documents/d1/draft' })
        .flush({ code, detail: 'no' }, { status: 409, statusText: 'Conflict' });
      s.fixture.detectChanges();
      expect(s.el('editor-problem').textContent).toContain(words);
      expect(s.editor().editable()).toBe(false);
    }
  });

  it('opens read-only when someone else holds the check-out', () => {
    const s = setup();
    open(s, { status: 409, code: 'DOC_CHECKED_OUT' }, { ...draft, editable: false });

    expect(s.editor().editable()).toBe(false);
    expect(s.el('editor-problem').textContent).toContain('being edited by someone else');
    s.editor().changed.emit('<p>ignored</p>');
    vi.advanceTimersByTime(DocumentEditorPage.SAVE_DELAY_MS);
    s.controller.expectNone({ method: 'PUT', url: '/api/documents/documents/d1/draft' });
  });

  it('leaving the page any other way gives the check-out back, quietly', () => {
    const s = setup();
    open(s);

    s.fixture.destroy();

    const release = s.controller.expectOne({ method: 'POST', url: '/api/documents/documents/d1/checkout/cancel' });
    expect(release.request.context.get(SILENT_ERRORS)).toBe(true);
    release.flush(doc);
  });

  it('does not give back a check-out it never had, or one it has lost', () => {
    const reader = setup();
    open(reader, { status: 409, code: 'DOC_CHECKED_OUT' }, { ...draft, editable: false });
    reader.fixture.destroy();
    reader.controller.expectNone({ method: 'POST', url: '/api/documents/documents/d1/checkout/cancel' });

    TestBed.resetTestingModule();
    const s = setup();
    open(s);
    s.type('<p>x</p>');
    vi.advanceTimersByTime(DocumentEditorPage.SAVE_DELAY_MS);
    s.controller.expectOne({ method: 'PUT', url: '/api/documents/documents/d1/draft' })
      .flush({ code: 'DOC_NOT_CHECKED_OUT', detail: 'no' }, { status: 409, statusText: 'Conflict' });
    s.fixture.destroy();
    s.controller.expectNone({ method: 'POST', url: '/api/documents/documents/d1/checkout/cancel' });
  });

  it('Done saves what is left, releases the check-out and goes back to the document', () => {
    const s = setup();
    open(s);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    s.type('<p>Last words</p>');

    s.el<HTMLButtonElement>('done').click();
    s.controller.expectOne({ method: 'PUT', url: '/api/documents/documents/d1/draft' })
      .flush({ ...draft, html: '<p>Last words</p>', revision: 3 });
    s.controller.expectOne({ method: 'POST', url: '/api/documents/documents/d1/checkout/cancel' }).flush(doc);
    expect(navigate).toHaveBeenCalledWith(['/documents', 'd1']);
    expect(s.page.hasUnsavedChanges()).toBe(false);
    s.fixture.destroy(); // the page going away does not release it a second time
    s.controller.expectNone({ method: 'POST', url: '/api/documents/documents/d1/checkout/cancel' });
  });
});
