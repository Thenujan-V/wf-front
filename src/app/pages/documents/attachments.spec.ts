import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { DocumentSummary, DocumentView, VersionView } from '../../core/documents/document.models';
import { UploadEvent, UploadTarget, Uploader } from '../../core/documents/uploader';
import { Attachments } from './attachments';

const v1: VersionView = { id: 'v1', label: '1.0', major: 1, minor: 0, size: 2048, mimeType: 'application/pdf',
  fileName: 'Receipt.pdf', sha256: 'a', createdBy: 'carol', createdAt: '2026-09-28T09:00:00Z', comment: null };
const receipt: DocumentSummary = { id: 'd1', folderId: 'f-i1', name: 'Receipt.pdf', typeId: null, currentVersion: v1,
  checkedOutBy: null, checkedOutAt: null, updatedAt: '2026-09-28T09:00:00Z', kind: 'FILE' };

describe('Attachments', () => {
  function setup() {
    const uploads: { file: File; target: UploadTarget; events: Subject<UploadEvent> }[] = [];
    TestBed.configureTestingModule({
      imports: [Attachments],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: Uploader, useValue: { upload: (file: File, target: UploadTarget) => {
          const events = new Subject<UploadEvent>();
          uploads.push({ file, target, events });
          return events;
        } } },
      ],
    });
    const fixture = TestBed.createComponent(Attachments);
    fixture.componentRef.setInput('instanceId', 'i1');
    fixture.detectChanges();
    const controller = TestBed.inject(HttpTestingController);
    const element = fixture.nativeElement as HTMLElement;
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T | null;
    const all = (id: string) => [...element.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
    return { fixture, controller, element, el, all, uploads };
  }

  async function answer(s: ReturnType<typeof setup>, documents: DocumentSummary[], canAttach: boolean) {
    s.controller.expectOne('/api/documents/instances/i1/documents').flush(documents);
    s.controller.expectOne('/api/workflow/instances/i1/access-check')
      .flush({ instanceId: 'i1', processKey: 'expense-request', status: canAttach ? 'ACTIVE' : 'COMPLETED', canView: true, canAttach });
    await s.fixture.whenStable();
  }

  it("lists the request's documents and lets people who may attach add more", async () => {
    const s = setup();
    await answer(s, [receipt], true);

    expect(s.all('attachment').length).toBe(1);
    expect(s.all('attachment')[0].textContent).toContain('1.0');
    expect(s.el('attachment')!.querySelector('a')!.getAttribute('href')).toBe('/documents/d1');
    expect(s.el('upload-input')).not.toBeNull();
    s.controller.verify();
  });

  it('shows new uploads at once, sent to the request rather than a folder', async () => {
    const s = setup();
    await answer(s, [], true);
    const input = s.el<HTMLInputElement>('upload-input')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'Taxi.txt')], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(s.uploads[0].target).toEqual({ instanceId: 'i1' });

    const document = { id: 'd2', folderId: 'f-i1', name: 'Taxi.txt', typeId: null, checkedOutBy: null, checkedOutAt: null,
      updatedAt: '2026-09-28T10:00:00Z', currentVersionId: 'v9', versions: [{ ...v1, id: 'v9', fileName: 'Taxi.txt' }] } as DocumentView;
    s.uploads[0].events.next({ stage: 'done', document });
    await s.fixture.whenStable();

    expect(s.all('attachment').map((row) => row.textContent)).toEqual([expect.stringContaining('Taxi.txt')]);
  });

  it('takes no uploads for a request that has finished', async () => {
    const s = setup();
    await answer(s, [], false);

    expect(s.element.textContent).toContain('No documents are attached.');
    expect(s.el('upload-input')).toBeNull();
  });

  it('says when the attachments could not be loaded and tries again', async () => {
    const s = setup();
    // The access check answers first: once one request fails, forkJoin cancels the other, which can then not be flushed.
    s.controller.expectOne('/api/workflow/instances/i1/access-check')
      .flush({ instanceId: 'i1', processKey: 'expense-request', status: 'ACTIVE', canView: true, canAttach: true });
    s.controller.expectOne('/api/documents/instances/i1/documents').flush({}, { status: 503, statusText: 'Unavailable' });
    await s.fixture.whenStable();
    expect(s.element.textContent).toContain('could not be loaded');

    s.el('attachments-retry')!.click();
    await answer(s, [receipt], false);
    expect(s.all('attachment').length).toBe(1);
  });
});
