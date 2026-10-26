import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import { covers, formatSize } from './document.models';
import { DocumentsApi } from './documents.api';

describe('DocumentsApi', () => {
  let api: DocumentsApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(DocumentsApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('reads folders quietly when asked and changes them', () => {
    api.root(true).subscribe();
    const root = controller.expectOne('/api/documents/folders/root');
    expect(root.request.context.get(SILENT_ERRORS)).toBe(true);
    root.flush({});

    api.createFolder('p1', 'Invoices').subscribe();
    expect(controller.expectOne({ method: 'POST', url: '/api/documents/folders' }).request.body).toEqual({ parentId: 'p1', name: 'Invoices' });
    api.renameFolder('f1', 'Bills').subscribe();
    expect(controller.expectOne({ method: 'PATCH', url: '/api/documents/folders/f1' }).request.body).toEqual({ name: 'Bills' });
    api.setAcl('f1', false, [{ principalType: 'USER', principalId: 'bob', permission: 'MANAGE' }]).subscribe();
    expect(controller.expectOne({ method: 'PUT', url: '/api/documents/folders/f1/acl' }).request.body)
      .toEqual({ inheritAcl: false, entries: [{ principalType: 'USER', principalId: 'bob', permission: 'MANAGE' }] });
    api.deleteFolder('f1').subscribe();
    controller.expectOne({ method: 'DELETE', url: '/api/documents/folders/f1' }).flush(null);
  });

  it('creates a written document and reads and saves its draft', () => {
    api.createWritten('f1', 'Travel policy').subscribe();
    expect(controller.expectOne({ method: 'POST', url: '/api/documents/written' }).request.body)
      .toEqual({ folderId: 'f1', name: 'Travel policy' });

    api.draft('d1', true).subscribe();
    const read = controller.expectOne('/api/documents/documents/d1/draft');
    expect(read.request.context.get(SILENT_ERRORS)).toBe(true);
    read.flush({});

    api.saveDraft('d1', '<p>Hello</p>', 3).subscribe();
    const save = controller.expectOne({ method: 'PUT', url: '/api/documents/documents/d1/draft' });
    expect(save.request.body).toEqual({ html: '<p>Hello</p>', revision: 3 });
    expect(save.request.context.get(SILENT_ERRORS)).toBe(true);
    save.flush({});

    api.review('d1', true).subscribe();
    const review = controller.expectOne('/api/documents/documents/d1/review');
    expect(review.request.context.get(SILENT_ERRORS)).toBe(true);
    review.flush({});
  });

  it('works with documents, versions and their content links', () => {
    api.documents('f1').subscribe();
    controller.expectOne('/api/documents/folders/f1/documents').flush([]);
    api.setMetadata('d1', 't1', { supplier: 'Acme' }).subscribe();
    expect(controller.expectOne({ method: 'PUT', url: '/api/documents/documents/d1/metadata' }).request.body)
      .toEqual({ typeId: 't1', metadata: { supplier: 'Acme' } });
    api.checkout('d1').subscribe();
    controller.expectOne({ method: 'POST', url: '/api/documents/documents/d1/checkout' }).flush({});
    api.cancelCheckout('d1').subscribe();
    controller.expectOne({ method: 'POST', url: '/api/documents/documents/d1/checkout/cancel' }).flush({});
    api.content('d1', 'v1', true).subscribe();
    controller.expectOne('/api/documents/documents/d1/versions/v1/content?inline=true').flush({});
    api.restore('d1', 'v1').subscribe();
    controller.expectOne({ method: 'POST', url: '/api/documents/documents/d1/versions/v1/restore' }).flush({});
  });

  it('starts and confirms uploads quietly, so the page can say what went wrong', () => {
    api.startUpload({ fileName: 'a.txt', size: 1, sha256: 'ab', mimeType: 'text/plain', folderId: 'f1' }).subscribe();
    const start = controller.expectOne({ method: 'POST', url: '/api/documents/uploads' });
    expect(start.request.context.get(SILENT_ERRORS)).toBe(true);
    start.flush({});
    api.confirmUpload('u1').subscribe();
    const confirm = controller.expectOne({ method: 'POST', url: '/api/documents/uploads/u1/confirm' });
    expect(confirm.request.context.get(SILENT_ERRORS)).toBe(true);
    confirm.flush({});
  });

  it('searches with only the filters that are set', () => {
    api.search('budget', { folderId: 'f1', page: 2, size: 20 }).subscribe();
    const search = controller.expectOne((r) => r.url === '/api/documents/search');
    expect(search.request.params.get('q')).toBe('budget');
    expect(search.request.params.get('folderId')).toBe('f1');
    expect(search.request.params.has('typeId')).toBe(false);
    expect(search.request.params.get('page')).toBe('2');
    search.flush({ items: [], total: 0, page: 2, size: 20 });
  });

  it('knows which permission includes which, and prints sizes for people', () => {
    expect(covers('MANAGE', 'WRITE')).toBe(true);
    expect(covers('WRITE', 'DELETE')).toBe(false);
    expect(covers(null, 'READ')).toBe(false);
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(999)).toBe('999 B');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(12_900_000)).toBe('12.3 MB');
  });

  it("lists a request's documents and links a document to a request, quietly", () => {
    api.instanceDocuments('i1', true).subscribe();
    const list = controller.expectOne('/api/documents/instances/i1/documents');
    expect(list.request.context.get(SILENT_ERRORS)).toBe(true);
    list.flush([]);

    api.link('d1', 'i1').subscribe();
    const link = controller.expectOne({ method: 'POST', url: '/api/documents/documents/d1/link' });
    expect(link.request.body).toEqual({ instanceId: 'i1' });
    expect(link.request.context.get(SILENT_ERRORS)).toBe(true);
    link.flush({});
  });
});
