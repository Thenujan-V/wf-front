import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { DocumentView } from '../../core/documents/document.models';
import { UploadError, UploadEvent, UploadTarget, Uploader } from '../../core/documents/uploader';
import { UploadList } from './upload-list';

describe('UploadList', () => {
  function setup(inputs: Record<string, string> = { folderId: 'fin' }) {
    const runs: { file: File; target: UploadTarget; events: Subject<UploadEvent> }[] = [];
    TestBed.configureTestingModule({
      imports: [UploadList],
      providers: [{
        provide: Uploader,
        useValue: {
          upload: (file: File, target: UploadTarget) => {
            const events = new Subject<UploadEvent>();
            runs.push({ file, target, events });
            return events;
          },
        },
      }],
    });
    const fixture = TestBed.createComponent(UploadList);
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    const uploaded: DocumentView[] = [];
    fixture.componentInstance.uploaded.subscribe((d) => uploaded.push(d));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const choose = (...files: File[]) => {
      const input = el<HTMLInputElement>('upload-input');
      Object.defineProperty(input, 'files', { value: files, configurable: true });
      input.dispatchEvent(new Event('change'));
    };
    return { fixture, element, el, choose, runs, uploaded };
  }

  const file = new File(['abc'], 'Minutes.txt', { type: 'text/plain' });
  const document = { id: 'd1', name: 'Minutes.txt' } as DocumentView;

  it('uploads each chosen file into the folder and reports progress', async () => {
    const s = setup();
    s.choose(file);
    s.runs[0].events.next({ stage: 'hashing' });
    await s.fixture.whenStable();
    expect(s.runs[0].target).toEqual({ folderId: 'fin' });
    expect(s.el('upload-entry').textContent).toContain('Minutes.txt');
    expect(s.el('upload-status').textContent).toContain('Checking the file…');

    s.runs[0].events.next({ stage: 'sending', percent: 40 });
    await s.fixture.whenStable();
    expect(s.el('upload-status').textContent).toContain('Sending 40%');

    s.runs[0].events.next({ stage: 'done', document });
    s.runs[0].events.complete();
    await s.fixture.whenStable();
    expect(s.el('upload-status').textContent).toContain('Uploaded');
    expect(s.uploaded).toEqual([document]);
  });

  it('says what went wrong and lets the person try again, without announcing an upload', async () => {
    const s = setup();
    s.choose(file);
    s.runs[0].events.error(new UploadError('The file could not be sent to storage. Please try again.'));
    await s.fixture.whenStable();

    expect(s.el('upload-error').textContent).toContain('could not be sent to storage');
    expect(s.uploaded).toEqual([]);
    s.el<HTMLButtonElement>('upload-retry').click();
    await s.fixture.whenStable();
    expect(s.runs.length).toBe(2);
    expect(s.runs[1].file).toBe(file);
    expect(s.element.querySelectorAll('[data-testid="upload-entry"]').length).toBe(1);
  });

  it('can drop a finished or failed row from the list', async () => {
    const s = setup();
    s.choose(file);
    s.runs[0].events.error(new UploadError('nope'));
    await s.fixture.whenStable();
    s.el<HTMLButtonElement>('upload-dismiss').click();
    await s.fixture.whenStable();
    expect(s.el('upload-entry')).toBeNull();
  });

  it('stops its uploads when it goes away, instead of letting them run unseen', async () => {
    const s = setup();
    s.choose(file);
    expect(s.runs[0].events.observed).toBe(true);

    s.fixture.destroy();
    expect(s.runs[0].events.observed).toBe(false);
  });

  it('sends files to a request when it is given one', async () => {
    const s = setup({ instanceId: 'i1' });
    s.choose(file);
    expect(s.runs[0].target).toEqual({ instanceId: 'i1' });
    expect(s.element.textContent).toContain('attached to this request');
  });
});
