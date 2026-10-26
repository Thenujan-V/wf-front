import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { DocumentView } from '../documents/document.models';
import { UploadError, UploadEvent, UploadTarget, Uploader } from '../documents/uploader';
import { FileField } from './file-field';
import { FileRef } from './form.models';

describe('FileField', () => {
  function setup(files: FileRef[] = [], readOnly = false) {
    const uploads: { file: File; target: UploadTarget; events: Subject<UploadEvent> }[] = [];
    TestBed.configureTestingModule({
      imports: [FileField],
      providers: [{ provide: Uploader, useValue: { upload: (file: File, target: UploadTarget) => {
        const events = new Subject<UploadEvent>();
        uploads.push({ file, target, events });
        return events;
      } } }],
    });
    const fixture = TestBed.createComponent(FileField);
    fixture.componentRef.setInput('fieldId', 'f-receipts');
    fixture.componentRef.setInput('files', files);
    fixture.componentRef.setInput('readOnly', readOnly);
    const changes: FileRef[][] = [];
    const busy: boolean[] = [];
    fixture.componentInstance.changed.subscribe((value) => changes.push(value));
    fixture.componentInstance.busy.subscribe((value) => busy.push(value));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T | null;
    const all = (id: string) => [...element.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
    const choose = (...names: string[]) => {
      const input = el<HTMLInputElement>('file-input')!;
      Object.defineProperty(input, 'files', { value: names.map((n) => new File(['x'], n)), configurable: true });
      input.dispatchEvent(new Event('change'));
    };
    return { fixture, element, el, all, choose, uploads, changes, busy };
  }

  const done = (id: string, name: string): UploadEvent => ({ stage: 'done', document: { id, name } as DocumentView });

  it('uploads each chosen file as a staged file and adds it once stored', async () => {
    const s = setup();
    s.choose('Taxi.pdf');
    expect(s.uploads[0].target).toEqual({ staged: true });
    expect(s.busy.at(-1)).toBe(true);

    s.uploads[0].events.next({ stage: 'sending', percent: 40 });
    await s.fixture.whenStable();
    expect(s.el('file-status')!.textContent).toContain('Sending 40%');

    s.uploads[0].events.next(done('d1', 'Taxi.pdf'));
    await s.fixture.whenStable();
    expect(s.changes.at(-1)).toEqual([{ documentId: 'd1', name: 'Taxi.pdf' }]);
    expect(s.busy.at(-1)).toBe(false);
    expect(s.all('file-pending')).toHaveLength(0);
  });

  it('keeps both files when two uploads finish before the form passes the list back', () => {
    const s = setup();
    s.choose('a.pdf', 'b.pdf');
    s.uploads[0].events.next(done('d1', 'a.pdf'));
    s.uploads[1].events.next(done('d2', 'b.pdf'));

    expect(s.changes.at(-1)).toEqual([{ documentId: 'd1', name: 'a.pdf' }, { documentId: 'd2', name: 'b.pdf' }]);
  });

  it('removes a file', () => {
    const s = setup([{ documentId: 'd1', name: 'a.pdf' }, { documentId: 'd2', name: 'b.pdf' }]);
    s.all('file-remove')[0].click();

    expect(s.changes.at(-1)).toEqual([{ documentId: 'd2', name: 'b.pdf' }]);
  });

  it('reports a failed upload, is no longer busy, and tries again', async () => {
    const s = setup();
    s.choose('Taxi.pdf');
    s.uploads[0].events.error(new UploadError('The file could not be sent to storage. Please try again.'));
    await s.fixture.whenStable();

    expect(s.el('file-error')!.textContent).toContain('could not be sent');
    expect(s.busy.at(-1)).toBe(false);
    s.el('file-retry')!.click();
    expect(s.uploads).toHaveLength(2);
    expect(s.busy.at(-1)).toBe(true);
  });

  it('shows files read-only as links that open in a new tab', () => {
    const s = setup([{ documentId: 'd1', name: 'a.pdf' }], true);

    const link = s.el('file-ref')!.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/documents/d1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(s.el('file-input')).toBeNull();
    expect(s.el('file-remove')).toBeNull();
  });

  it('stops offering uploads at ten files', () => {
    const s = setup(Array.from({ length: 10 }, (_, i) => ({ documentId: `d${i}`, name: `${i}.pdf` })));

    expect(s.el('file-input')).toBeNull();
  });
});
