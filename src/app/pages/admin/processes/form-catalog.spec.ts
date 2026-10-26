import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormCatalog } from './form-catalog';

describe('FormCatalog', () => {
  let catalog: FormCatalog;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FormCatalog, provideHttpClient(), provideHttpClientTesting()] });
    catalog = TestBed.inject(FormCatalog);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('lists the forms that can be picked: published ones only, fetched once', () => {
    const first = catalog.summaries();
    expect(first()).toBe('loading');
    expect(catalog.summaries()).toBe(first);
    controller.expectOne('/api/forms/definitions').flush([
      { key: 'expense-claim', name: 'Expense claim', latestVersion: 2, status: 'PUBLISHED', hasDraft: false, draftUpdatedAt: null },
      { key: 'draft-only', name: 'Draft', latestVersion: null, status: 'DRAFT', hasDraft: true, draftUpdatedAt: null },
      { key: 'old', name: 'Old', latestVersion: 1, status: 'RETIRED', hasDraft: false, draftUpdatedAt: null },
    ]);
    expect((first() as { key: string }[]).map((f) => f.key)).toEqual(['expense-claim']);
  });

  it('lists published versions of a form, once per key', () => {
    const versions = catalog.versions('expense-claim');
    expect(catalog.versions('expense-claim')).toBe(versions);
    controller.expectOne('/api/forms/definitions/expense-claim/versions').flush([
      { version: 2, status: 'PUBLISHED', publishedAt: '2026-09-25T10:00:00Z' },
      { version: 1, status: 'RETIRED', publishedAt: '2026-09-20T10:00:00Z' },
    ]);
    expect((versions() as { version: number }[]).map((v) => v.version)).toEqual([2]);
  });

  it('loads a form version once, and reports one that is not there as missing', () => {
    const form = catalog.form('expense-claim', 2);
    expect(catalog.form('expense-claim', 2)).toBe(form);
    controller.expectOne('/api/forms/definitions/expense-claim/versions/2')
      .flush({ key: 'expense-claim', version: 2, name: 'Expense claim', status: 'PUBLISHED', definition: { fields: [] } });
    expect((form() as { version: number }).version).toBe(2);

    const gone = catalog.form('gone', 1);
    controller.expectOne('/api/forms/definitions/gone/versions/1').flush(null, { status: 404, statusText: 'Not Found' });
    expect(gone()).toBe('missing');
  });
});
