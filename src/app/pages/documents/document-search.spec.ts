import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { DocumentSearchPage } from './document-search';

const hit = (id: string, name: string) => ({
  document: { id, folderId: 'fin', name, typeId: null, currentVersion: null, checkedOutBy: null, checkedOutAt: null,
    updatedAt: '2026-09-28T09:00:00Z' },
  folderName: 'Finance',
});

describe('DocumentSearchPage', () => {
  function setup(params: Record<string, string>) {
    TestBed.configureTestingModule({
      imports: [DocumentSearchPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(DocumentSearchPage);
    Object.entries(params).forEach(([key, value]) => fixture.componentRef.setInput(key, value));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const controller = TestBed.inject(HttpTestingController);
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const all = (id: string) => [...element.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
    controller.expectOne('/api/documents/document-types').flush([{ id: 't-inv', name: 'Invoice', form: null }]);
    return { fixture, element, controller, el, all };
  }

  function expectSearch(s: ReturnType<typeof setup>) {
    return s.controller.expectOne((r) => r.url === '/api/documents/search');
  }

  it('shows what matched, where it is, and how many there are', async () => {
    const s = setup({ q: 'budget', folderId: 'fin' });
    const search = expectSearch(s);
    expect(search.request.params.get('q')).toBe('budget');
    expect(search.request.params.get('folderId')).toBe('fin');
    expect(search.request.params.get('page')).toBe('0');
    search.flush({ items: [hit('d1', 'Budget 2026.xlsx')], total: 1, page: 0, size: 20 });
    await s.fixture.whenStable();

    expect(s.el('result-total').textContent).toContain('1 document');
    const result = s.el('result');
    expect(result.textContent).toContain('Budget 2026.xlsx');
    expect(result.textContent).toContain('Finance');
    expect(result.querySelector('a')?.getAttribute('href')).toBe('/documents/d1');
    expect(s.el('clear-folder')).not.toBeNull();
  });

  it('explains a search that is too short', async () => {
    const s = setup({ q: 'a' });
    expectSearch(s).flush({ code: 'DOC_SEARCH_QUERY', detail: 'Type at least two letters or digits to search' },
      { status: 400, statusText: 'Bad Request' });
    await s.fixture.whenStable();
    expect(s.el('search-invalid').textContent).toContain('Type at least two letters');
  });

  it('pages through results and searches again from the form', async () => {
    const s = setup({ q: 'report', page: '1' });
    expectSearch(s).flush({ items: [hit('d3', 'Report 3.pdf')], total: 45, page: 1, size: 20 });
    await s.fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    s.el<HTMLButtonElement>('page-next').click();
    expect(navigate).toHaveBeenLastCalledWith(['/documents/search'],
      { queryParams: { q: 'report', folderId: null, typeId: null, page: 2 } });
    s.el<HTMLButtonElement>('page-prev').click();
    expect(navigate).toHaveBeenLastCalledWith(['/documents/search'],
      { queryParams: { q: 'report', folderId: null, typeId: null, page: 0 } });

    const query = s.el<HTMLInputElement>('search-query');
    query.value = ' contract ';
    query.dispatchEvent(new Event('input'));
    const type = s.el<HTMLSelectElement>('search-type');
    type.value = 't-inv';
    type.dispatchEvent(new Event('change'));
    s.el<HTMLButtonElement>('search-go').click();
    expect(navigate).toHaveBeenLastCalledWith(['/documents/search'],
      { queryParams: { q: 'contract', folderId: null, typeId: 't-inv', page: null } });
  });

  it('waits for a query before searching', async () => {
    const s = setup({});
    s.controller.expectNone((r) => r.url === '/api/documents/search');
    expect(s.element.textContent).toContain('Search the names, details and contents');
  });
});
