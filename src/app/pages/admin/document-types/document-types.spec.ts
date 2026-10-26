import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DocumentTypesPage } from './document-types';

const types = [
  { id: 't-inv', name: 'Invoice', form: { key: 'invoice-meta', version: 2 } },
  { id: 't-memo', name: 'Memo', form: null },
];
const forms = [
  { key: 'invoice-meta', name: 'Invoice details', latestVersion: 2, status: 'PUBLISHED', hasDraft: false, draftUpdatedAt: null },
  { key: 'contract-meta', name: 'Contract details', latestVersion: 1, status: 'PUBLISHED', hasDraft: false, draftUpdatedAt: null },
];

describe('DocumentTypesPage', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [DocumentTypesPage], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(DocumentTypesPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const controller = TestBed.inject(HttpTestingController);
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const all = (id: string) => [...element.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
    const set = (id: string, value: string, event = 'change') => {
      el<HTMLInputElement>(id).value = value;
      el<HTMLInputElement>(id).dispatchEvent(new Event(event));
    };
    return { fixture, element, controller, el, all, set };
  }

  async function load(s: ReturnType<typeof setup>) {
    s.controller.expectOne('/api/documents/document-types').flush(types);
    await s.fixture.whenStable();
  }

  it('lists the types and the form that holds their fields', async () => {
    const s = setup();
    await load(s);
    expect(s.all('type-row').map((r) => r.textContent)).toEqual([
      expect.stringContaining('invoice-meta v2'), expect.stringContaining('No fields'),
    ]);
  });

  it('creates a type with a published form at its latest version', async () => {
    const s = setup();
    await load(s);

    s.el<HTMLButtonElement>('new-type').click();
    await s.fixture.whenStable();
    s.controller.expectOne('/api/forms/definitions').flush(forms);
    await s.fixture.whenStable();
    s.set('type-name', 'Contract', 'input');
    s.set('type-form', 'contract-meta');
    await s.fixture.whenStable();
    s.controller.expectOne('/api/forms/definitions/contract-meta/versions').flush([{ version: 1, status: 'PUBLISHED', publishedAt: 'x' }]);
    await s.fixture.whenStable();

    s.el<HTMLButtonElement>('save-type').click();
    const create = s.controller.expectOne({ method: 'POST', url: '/api/documents/document-types' });
    expect(create.request.body).toEqual({ name: 'Contract', form: { key: 'contract-meta', version: 1 } });
    create.flush({ id: 't-con', name: 'Contract', form: { key: 'contract-meta', version: 1 } });
    s.controller.expectOne('/api/documents/document-types').flush([...types, { id: 't-con', name: 'Contract', form: null }]);
    await s.fixture.whenStable();
    expect(s.all('type-row').length).toBe(3);
  });

  it('edits a type, and removes one after asking', async () => {
    const s = setup();
    await load(s);

    s.all('edit-type')[1].click();
    await s.fixture.whenStable();
    s.controller.match('/api/forms/definitions').forEach((r) => r.flush(forms));
    await s.fixture.whenStable();
    s.set('type-name', 'Internal memo', 'input');
    s.el<HTMLButtonElement>('save-type').click();
    expect(s.controller.expectOne({ method: 'PUT', url: '/api/documents/document-types/t-memo' }).request.body)
      .toEqual({ name: 'Internal memo', form: null });

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    s.all('delete-type')[0].click();
    s.controller.expectOne({ method: 'DELETE', url: '/api/documents/document-types/t-inv' }).flush(null);
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });
});
