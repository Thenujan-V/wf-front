import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DocumentView } from '../../core/documents/document.models';
import { MetadataEditor } from './metadata-editor';

const invoiceForm = {
  key: 'invoice-meta', version: 1, name: 'Invoice', status: 'PUBLISHED',
  definition: { fields: [
    { key: 'supplier', type: 'text', label: 'Supplier', required: true },
    { key: 'amount', type: 'currency', label: 'Amount' },
  ] },
};
const types = [
  { id: 't-inv', name: 'Invoice', form: { key: 'invoice-meta', version: 1 } },
  { id: 't-plain', name: 'Memo', form: null },
];

function document(overrides: Partial<DocumentView> = {}): DocumentView {
  return {
    id: 'd1', folderId: 'fin', name: 'Scan.pdf', typeId: 't-inv', metadata: { supplier: 'Acme', amount: 12 }, checkedOutBy: null,
    checkedOutAt: null, createdBy: 'bob', createdAt: 'x', updatedAt: 'x', permission: 'WRITE', currentVersionId: 'v1', versions: [], linkedInstanceId: null, inLibrary: true,
    kind: 'FILE', state: null, hasDraft: false,
    ...overrides,
  };
}

describe('MetadataEditor', () => {
  function setup(doc: DocumentView, editable: boolean) {
    TestBed.configureTestingModule({ imports: [MetadataEditor], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(MetadataEditor);
    fixture.componentRef.setInput('document', doc);
    fixture.componentRef.setInput('editable', editable);
    const saved: DocumentView[] = [];
    fixture.componentInstance.saved.subscribe((d) => saved.push(d));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const controller = TestBed.inject(HttpTestingController);
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    return { fixture, element, controller, el, saved };
  }

  async function loadTypes(s: ReturnType<typeof setup>) {
    s.controller.expectOne('/api/documents/document-types').flush(types);
    await s.fixture.whenStable();
    s.controller.expectOne('/api/forms/definitions/invoice-meta/versions/1').flush(invoiceForm);
    await s.fixture.whenStable();
  }

  it('shows the type and fills its form with the document metadata', async () => {
    const s = setup(document(), true);
    await loadTypes(s);

    expect(s.el<HTMLSelectElement>('metadata-type').value).toBe('t-inv');
    expect(s.element.querySelector<HTMLInputElement>('#f-supplier')!.value).toBe('Acme');
  });

  it('saves validated metadata and hands the updated document back', async () => {
    const s = setup(document(), true);
    await loadTypes(s);

    s.el<HTMLButtonElement>('metadata-save').click();
    const save = s.controller.expectOne({ method: 'PUT', url: '/api/documents/documents/d1/metadata' });
    expect(save.request.body).toEqual({ typeId: 't-inv', metadata: { supplier: 'Acme', amount: 12 } });
    save.flush(document({ updatedAt: 'y' }));
    await s.fixture.whenStable();
    expect(s.saved.map((d) => d.updatedAt)).toEqual(['y']);
  });

  it('shows the server field errors next to the fields', async () => {
    const s = setup(document(), true);
    await loadTypes(s);

    s.el<HTMLButtonElement>('metadata-save').click();
    s.controller.expectOne({ method: 'PUT', url: '/api/documents/documents/d1/metadata' }).flush(
      { code: 'DOC_METADATA_INVALID', errors: [{ field: 'amount', code: 'TOO_LARGE', message: 'Amount must be at most 10' }] },
      { status: 400, statusText: 'Bad Request' });
    await s.fixture.whenStable();
    expect(s.element.textContent).toContain('Amount must be at most 10');
  });

  it('switching to a type without fields clears the metadata', async () => {
    const s = setup(document(), true);
    await loadTypes(s);

    const select = s.el<HTMLSelectElement>('metadata-type');
    select.value = 't-plain';
    select.dispatchEvent(new Event('change'));
    await s.fixture.whenStable();
    expect(s.el('metadata-no-fields')).not.toBeNull();
    s.el<HTMLButtonElement>('metadata-save').click();
    expect(s.controller.expectOne({ method: 'PUT', url: '/api/documents/documents/d1/metadata' }).request.body)
      .toEqual({ typeId: 't-plain', metadata: {} });
  });

  it('is read-only for people who cannot change the document', async () => {
    const s = setup(document(), false);
    await loadTypes(s);

    expect(s.el<HTMLSelectElement>('metadata-type').disabled).toBe(true);
    expect(s.el('metadata-save')).toBeNull();
    expect(s.element.querySelector('input:not([disabled]):not([readonly])')).toBeNull();
  });

  it('invites choosing a type when there is none', async () => {
    const s = setup(document({ typeId: null, metadata: {} }), true);
    s.controller.expectOne('/api/documents/document-types').flush(types);
    await s.fixture.whenStable();
    expect(s.el('metadata-none')).not.toBeNull();
  });

  it('keeps unsaved edits when the document changes in other ways (a check-out, a rename)', async () => {
    const s = setup(document(), true);
    await loadTypes(s);
    const supplier = s.element.querySelector<HTMLInputElement>('#f-supplier')!;
    supplier.value = 'Beta Ltd';
    supplier.dispatchEvent(new Event('input'));
    await s.fixture.whenStable();

    s.fixture.componentRef.setInput('document', document({ checkedOutBy: 'bob', name: 'Renamed.pdf' }));
    await s.fixture.whenStable();

    expect(s.element.querySelector<HTMLInputElement>('#f-supplier')!.value).toBe('Beta Ltd');
    s.controller.expectNone('/api/forms/definitions/invoice-meta/versions/1');
  });

  it('offers no Save while the types or the fields are not there, and says why', async () => {
    const s = setup(document(), true);
    s.controller.expectOne('/api/documents/document-types').flush(null, { status: 500, statusText: 'Server Error' });
    await s.fixture.whenStable();

    expect(s.el('metadata-save')).toBeNull();
    expect(s.el('metadata-types-failed').textContent).toContain('could not be loaded');
  });
});
