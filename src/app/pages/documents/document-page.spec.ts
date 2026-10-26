import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DocumentView, VersionView } from '../../core/documents/document.models';
import { UploadEvent, UploadTarget, Uploader } from '../../core/documents/uploader';
import { ToastService } from '../../core/ui/toast.service';
import { DocumentPage } from './document-page';
import { PDF_LOADER } from './pdf-viewer';

const v1: VersionView = { id: 'v1', label: '1.0', major: 1, minor: 0, size: 1000, mimeType: 'application/pdf',
  fileName: 'Contract.pdf', sha256: 'a', createdBy: 'bob', createdAt: '2026-09-20T09:00:00Z', comment: null };
const v2: VersionView = { ...v1, id: 'v2', label: '1.1', minor: 1, createdAt: '2026-09-28T09:00:00Z', comment: 'Signed copy' };

function view(overrides: Partial<DocumentView> = {}): DocumentView {
  return {
    id: 'd1', folderId: 'fin', name: 'Contract.pdf', typeId: null, metadata: {}, checkedOutBy: null, checkedOutAt: null,
    createdBy: 'bob', createdAt: '2026-09-20T09:00:00Z', updatedAt: '2026-09-28T09:00:00Z', permission: 'WRITE',
    currentVersionId: 'v2', versions: [v2, v1], linkedInstanceId: null, inLibrary: true,
    kind: 'FILE', state: null, hasDraft: false, ...overrides,
  };
}

describe('DocumentPage', () => {
  function setup(me = 'bob') {
    const uploads: { file: File; target: UploadTarget; events: Subject<UploadEvent> }[] = [];
    TestBed.configureTestingModule({
      imports: [DocumentPage],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { userId: signal(me), hasRole: () => false } },
        { provide: PDF_LOADER, useValue: () => new Promise(() => {}) },
        { provide: Uploader, useValue: { upload: (file: File, target: UploadTarget) => {
          const events = new Subject<UploadEvent>();
          uploads.push({ file, target, events });
          return events;
        } } },
      ],
    });
    const fixture = TestBed.createComponent(DocumentPage);
    fixture.componentRef.setInput('id', 'd1');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const controller = TestBed.inject(HttpTestingController);
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const all = (id: string) => [...element.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
    const toasts = () => TestBed.inject(ToastService).toasts().map((t) => t.message);
    return { fixture, element, controller, el, all, uploads, toasts, page: fixture.componentInstance };
  }

  async function load(s: ReturnType<typeof setup>, document: DocumentView) {
    s.controller.expectOne('/api/documents/documents/d1').flush(document);
    await s.fixture.whenStable();
    s.controller.match('/api/identity/users/carol').forEach((r) => r.flush({ id: 'carol', username: 'carol', displayName: 'Carol Clerk' }));
    await s.fixture.whenStable();
  }

  it('shows the document, its versions newest first, and previews the current one', async () => {
    const s = setup();
    await load(s, view());

    expect(s.el('document-name').textContent).toContain('Contract.pdf');
    expect(s.el('folder-link').getAttribute('href')).toBe('/documents/folders/fin');
    expect(s.all('version-row').map((r) => r.textContent)).toEqual([
      expect.stringContaining('1.1'), expect.stringContaining('1.0'),
    ]);
    expect(s.all('version-row')[0].textContent).toContain('Signed copy');
    s.controller.expectOne('/api/documents/documents/d1/versions/v2/content?inline=true');
  });

  it('previews an older version when asked', async () => {
    const s = setup();
    await load(s, view());
    s.all('preview-version')[1].click();
    await s.fixture.whenStable();
    s.controller.expectOne('/api/documents/documents/d1/versions/v1/content?inline=true');
  });

  it('explains a document that does not exist or cannot be read', async () => {
    const s = setup();
    s.controller.expectOne('/api/documents/documents/d1').flush({ code: 'DOC_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await s.fixture.whenStable();
    expect(s.el('missing').textContent).toContain('does not exist or you do not have access to it');
  });

  it('checks out, uploads a new version that checks it back in, or cancels the check-out', async () => {
    const s = setup();
    await load(s, view());
    expect(s.el('version-file')).toBeNull();

    s.el<HTMLButtonElement>('checkout').click();
    s.controller.expectOne({ method: 'POST', url: '/api/documents/documents/d1/checkout' })
      .flush(view({ checkedOutBy: 'bob', checkedOutAt: '2026-09-28T10:00:00Z' }));
    await s.fixture.whenStable();
    expect(s.el('cancel-checkout')).not.toBeNull();

    s.el<HTMLInputElement>('version-major').click();
    const comment = s.el<HTMLInputElement>('version-comment');
    comment.value = 'Countersigned';
    comment.dispatchEvent(new Event('input'));
    const file = new File(['%PDF'], 'Contract v2.pdf', { type: 'application/pdf' });
    const input = s.el<HTMLInputElement>('version-file');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(s.uploads[0].target).toEqual({ documentId: 'd1', major: true, comment: 'Countersigned' });

    s.uploads[0].events.next({ stage: 'sending', percent: 60 });
    await s.fixture.whenStable();
    expect(s.el('version-status').textContent).toContain('Sending 60%');
    const v3 = { ...v2, id: 'v3', label: '2.0', major: 2, minor: 0 };
    s.uploads[0].events.next({ stage: 'done', document: view({ currentVersionId: 'v3', versions: [v3, v2, v1] }) });
    await s.fixture.whenStable();
    expect(s.all('version-row')[0].textContent).toContain('2.0');
    expect(s.el('checkout')).not.toBeNull();
    expect(s.toasts()).toContain('Version 2.0 uploaded and checked in');
  });

  it('shows a failed new version next to the file picker', async () => {
    const s = setup();
    await load(s, view({ checkedOutBy: 'bob' }));
    const input = s.el<HTMLInputElement>('version-file');
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'x.pdf')], configurable: true });
    input.dispatchEvent(new Event('change'));
    s.uploads[0].events.error(new Error('boom'));
    await s.fixture.whenStable();
    expect(s.el('version-error').textContent).toContain('The upload failed');
  });

  it('while someone else holds it, offers no changes, says who, and lets only a manager release it', async () => {
    const s = setup();
    await load(s, view({ checkedOutBy: 'carol', checkedOutAt: '2026-09-28T08:00:00Z' }));

    expect(s.el('lock').textContent).toContain('Checked out by Carol Clerk');
    for (const id of ['checkout', 'rename-document', 'version-file', 'restore-version', 'delete-document', 'release']) {
      expect(s.el(id), id).toBeNull();
    }
    TestBed.resetTestingModule();

    const manager = setup();
    await load(manager, view({ checkedOutBy: 'carol', checkedOutAt: '2026-09-28T08:00:00Z', permission: 'MANAGE' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    manager.el<HTMLButtonElement>('release').click();
    manager.controller.expectOne({ method: 'POST', url: '/api/documents/documents/d1/checkout/cancel' }).flush(view({ permission: 'MANAGE' }));
    await manager.fixture.whenStable();
    expect(confirm).toHaveBeenCalled();
    expect(manager.toasts()).toContain('Check-out released');
    confirm.mockRestore();
  });

  it('restores an older version while holding the check-out', async () => {
    const s = setup();
    await load(s, view({ checkedOutBy: 'bob' }));
    expect(s.all('restore-version').length).toBe(1);

    s.el<HTMLButtonElement>('restore-version').click();
    s.controller.expectOne({ method: 'POST', url: '/api/documents/documents/d1/versions/v1/restore' })
      .flush(view({ currentVersionId: 'v3', versions: [{ ...v1, id: 'v3', label: '1.2', minor: 2 }, v2, v1] }));
    await s.fixture.whenStable();
    expect(s.toasts()).toContain('Version 1.0 restored as 1.2');
  });

  it('downloads a version through a short-lived link', async () => {
    const s = setup();
    await load(s, view());
    const open = vi.spyOn(s.page as unknown as { openUrl(url: string): void }, 'openUrl').mockImplementation(() => undefined);

    s.all('download-version')[1].click();
    s.controller.expectOne('/api/documents/documents/d1/versions/v1/content?inline=false')
      .flush({ url: 'http://storage/v1?sig', fileName: 'Contract.pdf', mimeType: 'application/pdf', inline: false, expiresAt: 'x' });
    expect(open).toHaveBeenCalledWith('http://storage/v1?sig');
  });

  it('renames, and deletes after asking, going back to the folder', async () => {
    const s = setup();
    await load(s, view({ permission: 'DELETE' }));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    s.el<HTMLButtonElement>('rename-document').click();
    await s.fixture.whenStable();
    const input = s.el<HTMLInputElement>('rename-input');
    input.value = 'Signed contract.pdf';
    input.dispatchEvent(new Event('input'));
    s.el<HTMLButtonElement>('save-rename').click();
    expect(s.controller.expectOne({ method: 'PATCH', url: '/api/documents/documents/d1' }).request.body).toEqual({ name: 'Signed contract.pdf' });

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    s.el<HTMLButtonElement>('delete-document').click();
    s.controller.expectOne({ method: 'DELETE', url: '/api/documents/documents/d1' }).flush(null);
    await s.fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/documents/folders', 'fin']);
    confirm.mockRestore();
  });

  it('shows the metadata editor, editable only when the document can be changed', async () => {
    const s = setup();
    await load(s, view({ checkedOutBy: 'carol' }));
    const editor = s.fixture.debugElement.query((d) => d.name === 'app-metadata-editor');
    expect(editor).not.toBeNull();
    expect(editor.componentInstance.editable()).toBe(false);
  });

  it('shows the document the address names even when an earlier one answers last', async () => {
    const s = setup();
    const first = s.controller.expectOne('/api/documents/documents/d1');
    s.fixture.componentRef.setInput('id', 'd2');
    await s.fixture.whenStable();
    s.controller.expectOne('/api/documents/documents/d2').flush(view({ id: 'd2', name: 'Budget.xlsx' }));
    await s.fixture.whenStable();

    first.flush(view());
    await s.fixture.whenStable();
    expect(s.el('document-name').textContent).toContain('Budget.xlsx');
  });

  it('does not show a new version of the previous document after moving to another one', async () => {
    const s = setup();
    await load(s, view({ checkedOutBy: 'bob' }));
    const input = s.el<HTMLInputElement>('version-file');
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'x.pdf')], configurable: true });
    input.dispatchEvent(new Event('change'));

    s.fixture.componentRef.setInput('id', 'd2');
    await s.fixture.whenStable();
    s.controller.expectOne('/api/documents/documents/d2').flush(view({ id: 'd2', name: 'Budget.xlsx' }));
    await s.fixture.whenStable();
    s.uploads[0].events.next({ stage: 'done', document: view({ name: 'Contract v2.pdf' }) });
    await s.fixture.whenStable();

    expect(s.el('document-name').textContent).toContain('Budget.xlsx');
  });

  const catalog = [{ key: 'contract-approval', name: 'Contract approval', version: 1, startForm: null }];
  const started = { id: 'i9', processKey: 'contract-approval', processVersion: 1, businessKey: 'C-1', status: 'ACTIVE',
    endStatus: null, initiatorId: 'bob', startedAt: '2026-09-28T09:00:00Z', endedAt: null };

  async function startApproval(s: ReturnType<typeof setup>) {
    s.el('send-for-approval').click();
    await s.fixture.whenStable();
    s.controller.expectOne('/api/workflow/catalog').flush(catalog);
    await s.fixture.whenStable();
    const select = s.el<HTMLSelectElement>('send-process');
    select.value = 'contract-approval';
    select.dispatchEvent(new Event('change'));
    await s.fixture.whenStable();
    const key = s.el<HTMLInputElement>('send-business-key');
    key.value = 'C-1';
    key.dispatchEvent(new Event('input'));
    s.el('send-submit').click();
    const start = s.controller.expectOne({ method: 'POST', url: '/api/workflow/instances' });
    expect(start.request.body).toEqual({ processKey: 'contract-approval', businessKey: 'C-1', data: {} });
    start.flush(started);
    await s.fixture.whenStable();
  }

  it('sends a document for approval: starts the request, then attaches the document', async () => {
    const s = setup();
    await load(s, view());
    await startApproval(s);

    const link = s.controller.expectOne({ method: 'POST', url: '/api/documents/documents/d1/link' });
    expect(link.request.body).toEqual({ instanceId: 'i9' });
    link.flush(view({ linkedInstanceId: 'i9' }));
    await s.fixture.whenStable();

    expect(s.el('request-link').getAttribute('href')).toBe('/requests/i9');
    expect(s.el('send-for-approval')).toBeNull();
    expect(s.el('send-panel')).toBeNull();
    expect(s.toasts()).toContain('Sent for approval');
  });

  it('says when the request started but the document could not be attached, and tries again', async () => {
    const s = setup();
    await load(s, view());
    await startApproval(s);

    s.controller.expectOne('/api/documents/documents/d1/link')
      .flush({ code: 'DOC_WORKFLOW_UNAVAILABLE', message: 'Requests cannot be checked right now' }, { status: 503, statusText: 'Unavailable' });
    await s.fixture.whenStable();
    expect(s.el('link-failed').textContent).toContain('The request was started');
    expect(s.el('open-started').getAttribute('href')).toBe('/requests/i9');

    s.el('retry-link').click();
    s.controller.expectOne('/api/documents/documents/d1/link').flush(view({ linkedInstanceId: 'i9' }));
    await s.fixture.whenStable();
    expect(s.el('request-link').getAttribute('href')).toBe('/requests/i9');
    expect(s.el('link-failed')).toBeNull();
  });

  it('shows a document reached only through its request with that request, not its folder', async () => {
    const s = setup();
    await load(s, view({ permission: 'READ', linkedInstanceId: 'i1', inLibrary: false }));

    expect(s.el('folder-link')).toBeNull();
    expect(s.el('request-link').getAttribute('href')).toBe('/requests/i1');
    expect(s.el('send-for-approval')).toBeNull();
  });

  it('does not offer to send a document that already belongs to a request', async () => {
    const s = setup();
    await load(s, view({ linkedInstanceId: 'i1' }));

    expect(s.el('folder-link')).not.toBeNull();
    expect(s.el('send-for-approval')).toBeNull();
  });

  describe('a written document', () => {
    const written = () => view({ name: 'Travel policy', kind: 'WRITTEN', state: 'DRAFT', hasDraft: true,
      currentVersionId: null, versions: [] });

    it('shows a draft with its text, an Edit link, and no file-version controls', async () => {
      const s = setup();
      await load(s, written());
      s.controller.expectOne('/api/documents/documents/d1/draft')
        .flush({ html: '<h1>Policy</h1><p>Fly economy.</p>', revision: 4, updatedBy: 'bob', updatedAt: '2026-10-06T09:00:00Z', editable: false });
      await s.fixture.whenStable();

      expect(s.el('written-state').textContent).toContain('Draft');
      expect(s.el('draft-text').querySelector('h1')?.textContent).toBe('Policy');
      expect(s.el<HTMLAnchorElement>('edit-document').getAttribute('href')).toBe('/documents/d1/edit');
      expect(s.el('checkout')).toBeNull();
      expect(s.el('version-file')).toBeNull();
      expect(s.el('send-for-approval')).not.toBeNull();
    });

    it('someone else editing it: no Edit link, and who has it', async () => {
      const s = setup();
      await load(s, { ...written(), checkedOutBy: 'carol', checkedOutAt: '2026-10-06T09:00:00Z' });
      s.controller.expectOne('/api/documents/documents/d1/draft')
        .flush({ html: '<p>x</p>', revision: 1, updatedBy: 'carol', updatedAt: '2026-10-06T09:00:00Z', editable: false });
      await s.fixture.whenStable();

      expect(s.el('edit-document')).toBeNull();
      expect(s.el('lock').textContent).toContain('Carol Clerk');
    });

    it('cannot be sent while someone else is editing it, or with nothing written', async () => {
      const held = setup();
      await load(held, { ...written(), checkedOutBy: 'carol', checkedOutAt: '2026-10-06T09:00:00Z' });
      held.controller.expectOne('/api/documents/documents/d1/draft')
        .flush({ html: '<p>x</p>', revision: 1, updatedBy: 'carol', updatedAt: '2026-10-06T09:00:00Z', editable: false });
      await held.fixture.whenStable();
      expect(held.el('send-for-approval')).toBeNull();

      TestBed.resetTestingModule();
      const approved = setup();
      await load(approved, view({ name: 'Travel policy', kind: 'WRITTEN', state: 'APPROVED', hasDraft: false }));
      expect(approved.el('send-for-approval')).toBeNull();
    });

    it('an empty draft cannot be sent: the request would start and never get its document', async () => {
      for (const html of ['', '<p></p>', '<p>  </p><table><tbody><tr><td></td></tr></tbody></table>']) {
        TestBed.resetTestingModule();
        const s = setup();
        await load(s, written());
        expect(s.el('send-for-approval')).toBeNull(); // not before the text is known, either
        s.controller.expectOne('/api/documents/documents/d1/draft')
          .flush({ html, revision: 1, updatedBy: 'bob', updatedAt: '2026-10-06T09:00:00Z', editable: false });
        await s.fixture.whenStable();

        expect(s.el('send-for-approval')).toBeNull();
        expect(s.el('send-hint').textContent).toContain('Write something');
      }
    });

    it('in approval: the whole review copy opens in a new tab, with a fresh link each time', async () => {
      const s = setup();
      await load(s, { ...written(), state: 'IN_APPROVAL', linkedInstanceId: 'i1' });
      s.controller.expectOne('/api/documents/documents/d1/review').flush(null, { status: 503, statusText: 'Unavailable' });
      await s.fixture.whenStable();
      const opened = vi.spyOn(window, 'open').mockReturnValue(null);

      s.el<HTMLButtonElement>('open-review').click(); // there even when the viewer failed
      s.controller.expectOne('/api/documents/documents/d1/review')
        .flush({ url: 'https://storage/fresh.pdf', fileName: 'x.pdf', mimeType: 'application/pdf', inline: true, expiresAt: 'x' });

      expect(opened).toHaveBeenCalledWith('https://storage/fresh.pdf', '_blank', 'noopener');
      opened.mockRestore();
    });

    it('in approval: shows the review PDF and its request, and offers no way to change it', async () => {
      const s = setup();
      await load(s, { ...written(), state: 'IN_APPROVAL', linkedInstanceId: 'i1' });
      s.controller.expectOne('/api/documents/documents/d1/review')
        .flush({ url: 'https://storage/review.pdf', fileName: 'Travel policy (for review).pdf', mimeType: 'application/pdf',
          inline: true, expiresAt: '2026-10-06T10:00:00Z' });
      await s.fixture.whenStable();

      expect(s.el('written-state').textContent).toContain('In approval');
      expect(s.el('review')).not.toBeNull();
      expect(s.el('review-note').textContent).toContain('cannot be changed until the request finishes');
      expect(s.el('request-link')).not.toBeNull();
      expect(s.el('edit-document')).toBeNull();
      expect(s.el('send-for-approval')).toBeNull();
      expect(s.el('delete-document')).toBeNull();
      s.controller.expectNone('/api/documents/documents/d1/draft');
    });

    it('in approval, when the review cannot be fetched, says so', async () => {
      const s = setup();
      await load(s, { ...written(), state: 'IN_APPROVAL', linkedInstanceId: 'i1' });
      s.controller.expectOne('/api/documents/documents/d1/review').flush(null, { status: 503, statusText: 'Unavailable' });
      await s.fixture.whenStable();

      expect(s.el('review')).toBeNull();
      expect(s.el('review-failed').textContent).toContain('could not be loaded');
    });

    it('after sending, the page turns to the review without a reload', async () => {
      const s = setup();
      await load(s, written());
      s.controller.expectOne('/api/documents/documents/d1/draft')
        .flush({ html: '<p>Fly economy.</p>', revision: 1, updatedBy: 'bob', updatedAt: '2026-10-06T09:00:00Z', editable: false });
      await s.fixture.whenStable();

      s.page.apply({ ...written(), state: 'IN_APPROVAL', linkedInstanceId: 'i1' });
      await s.fixture.whenStable();

      s.controller.expectOne('/api/documents/documents/d1/review')
        .flush({ url: 'https://storage/review.pdf', fileName: 'x.pdf', mimeType: 'application/pdf', inline: true, expiresAt: 'x' });
      await s.fixture.whenStable();
      expect(s.el('review')).not.toBeNull();
      expect(s.el('draft-text')).toBeNull();
    });

    it('an uploaded file is shown as before', async () => {
      const s = setup();
      await load(s, view());

      expect(s.el('written-state')).toBeNull();
      expect(s.el('checkout')).not.toBeNull();
      s.controller.expectNone('/api/documents/documents/d1/draft');
    });
  });
});
