import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FILE_HASHER, UploadError, UploadEvent, Uploader, uploadErrorMessage, uploadStatus } from './uploader';

describe('Uploader', () => {
  let uploader: Uploader;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FILE_HASHER, useValue: () => Promise.resolve('f'.repeat(64)) },
      ],
    });
    uploader = TestBed.inject(Uploader);
    controller = TestBed.inject(HttpTestingController);
  });

  const file = new File(['hello world'], 'Notes.txt', { type: 'text/plain' });
  const ticket = { uploadId: 'u1', url: 'http://storage/objects/u1?X-Amz-Signature=s', method: 'PUT',
    headers: { 'Content-Type': 'text/plain' }, expiresAt: '2026-09-28T10:00:00Z' };

  async function settle() {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  }

  it('hashes, gets a ticket, sends the file straight to storage and confirms it', async () => {
    const events: UploadEvent[] = [];
    uploader.upload(file, { folderId: 'f1' }).subscribe((e) => events.push(e));
    await settle();

    const start = controller.expectOne({ method: 'POST', url: '/api/documents/uploads' });
    expect(start.request.body).toEqual({ fileName: 'Notes.txt', size: 11, sha256: 'f'.repeat(64), mimeType: 'text/plain', folderId: 'f1' });
    start.flush(ticket);

    const put = controller.expectOne({ method: 'PUT', url: ticket.url });
    expect(put.request.headers.get('Content-Type')).toBe('text/plain');
    expect(put.request.headers.has('Authorization')).toBe(false);
    expect(put.request.body).toBe(file);
    put.event({ type: HttpEventType.UploadProgress, loaded: 5, total: 10 });
    put.flush(null);

    controller.expectOne({ method: 'POST', url: '/api/documents/uploads/u1/confirm' }).flush({ id: 'd1', name: 'Notes.txt' });

    expect(events.map(uploadStatus)).toEqual(['Checking the file…', 'Sending 50%', 'Saving…', 'Uploaded']);
    expect(events.at(-1)).toEqual({ stage: 'done', document: { id: 'd1', name: 'Notes.txt' } });
  });

  it('sends a new version with its options', async () => {
    uploader.upload(file, { documentId: 'd1', major: true, comment: 'Signed copy' }).subscribe();
    await settle();

    expect(controller.expectOne({ method: 'POST', url: '/api/documents/uploads' }).request.body)
      .toEqual({ fileName: 'Notes.txt', size: 11, sha256: 'f'.repeat(64), mimeType: 'text/plain', documentId: 'd1', major: true, comment: 'Signed copy' });
  });

  it('stops with a clear message when storage refuses the file, without confirming', async () => {
    let error: unknown;
    uploader.upload(file, { folderId: 'f1' }).subscribe({ error: (e) => (error = e) });
    await settle();
    controller.expectOne({ method: 'POST', url: '/api/documents/uploads' }).flush(ticket);
    controller.expectOne({ method: 'PUT', url: ticket.url }).flush('denied', { status: 403, statusText: 'Forbidden' });

    expect(error).toBeInstanceOf(UploadError);
    expect(uploadErrorMessage(error)).toBe('The file could not be sent to storage. Please try again.');
    controller.expectNone('/api/documents/uploads/u1/confirm');
  });

  it('explains a refused confirm with the server message', async () => {
    let error: unknown;
    uploader.upload(file, { folderId: 'f1' }).subscribe({ error: (e) => (error = e) });
    await settle();
    controller.expectOne({ method: 'POST', url: '/api/documents/uploads' }).flush(ticket);
    controller.expectOne({ method: 'PUT', url: ticket.url }).flush(null);
    controller.expectOne({ method: 'POST', url: '/api/documents/uploads/u1/confirm' }).flush(
      { code: 'DOC_UPLOAD_MISMATCH', detail: 'The uploaded file is not the one announced; please upload it again' },
      { status: 400, statusText: 'Bad Request' });

    expect(uploadErrorMessage(error)).toBe('The uploaded file is not the one announced; please upload it again');
  });

  it('sends files without a type as binary', async () => {
    uploader.upload(new File(['x'], 'data'), { folderId: 'f1' }).subscribe();
    await settle();
    expect(controller.expectOne({ method: 'POST', url: '/api/documents/uploads' }).request.body.mimeType).toBe('application/octet-stream');
  });

  it('refuses a file over the size limit before reading it', async () => {
    const hashed: Blob[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(),
        { provide: FILE_HASHER, useValue: (f: Blob) => { hashed.push(f); return Promise.resolve('f'.repeat(64)); } }],
    });
    const big = new File(['x'], 'Film.mp4', { type: 'video/mp4' });
    Object.defineProperty(big, 'size', { value: 3 * 1024 * 1024 * 1024 });
    let error: unknown;
    TestBed.inject(Uploader).upload(big, { folderId: 'f1' }).subscribe({ error: (e) => (error = e) });
    await settle();

    expect(uploadErrorMessage(error)).toBe('Files can be at most 100.0 MB; this one is 3.0 GB.');
    expect(hashed).toEqual([]);
    TestBed.inject(HttpTestingController).expectNone('/api/documents/uploads');
  });
});
