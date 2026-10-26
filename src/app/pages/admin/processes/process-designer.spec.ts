import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ProcessGraph } from '../../../core/workflow/process.models';
import { ToastService } from '../../../core/ui/toast.service';
import { Connection, NodeMove, ProcessCanvas, Reconnection } from './process-canvas';
import { ProcessDesignerPage } from './process-designer';

/** Stands in for the foblex canvas; tests fire its outputs directly. */
@Component({ selector: 'app-process-canvas', template: '' })
class CanvasStub {
  readonly graph = input.required<ProcessGraph>();
  readonly selectedNode = input<string | null>(null);
  readonly selectedEdge = input<string | null>(null);
  readonly problemNodes = input<ReadonlySet<string>>(new Set());
  readonly nodesMoved = output<NodeMove[]>();
  readonly connected = output<Connection>();
  readonly reconnected = output<Reconnection>();
  readonly nodeSelected = output<string>();
  readonly edgeSelected = output<string>();
  readonly selectionCleared = output<void>();
}

const graph: ProcessGraph = {
  layoutVersion: 1,
  nodes: [
    { id: 'start', type: 'START', name: 'Submit', position: { x: 40, y: 40 } },
    { id: 'task1', type: 'USER_TASK', name: 'Manager approval', position: { x: 260, y: 40 },
      assignment: { type: 'INITIATOR_MANAGER', levels: 1 }, outcomes: ['APPROVE', 'REJECT'], approvalMode: 'SINGLE', futureSetting: 'x' },
    { id: 'end', type: 'END', name: 'Done', position: { x: 480, y: 40 } },
  ],
  edges: [
    { id: 'flow1', source: 'start', target: 'task1' },
    { id: 'flow2', source: 'task1', target: 'end', outcome: 'APPROVE' },
    { id: 'flow3', source: 'task1', target: 'end', outcome: 'REJECT' },
  ],
};

describe('ProcessDesignerPage', () => {
  function setup(name?: string) {
    TestBed.configureTestingModule({
      imports: [ProcessDesignerPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.overrideComponent(ProcessDesignerPage, { remove: { imports: [ProcessCanvas] }, add: { imports: [CanvasStub] } });
    const fixture = TestBed.createComponent(ProcessDesignerPage);
    fixture.componentRef.setInput('key', 'expense-request');
    if (name) {
      fixture.componentRef.setInput('name', name);
    }
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const controller = TestBed.inject(HttpTestingController);
    const el = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T;
    const canvas = () => fixture.debugElement.query(By.directive(CanvasStub)).componentInstance as CanvasStub;
    const toasts = () => TestBed.inject(ToastService).toasts().map((t) => t.message);
    /** The forms list that the form settings load when a start or task is selected. */
    const flushForms = () => controller.match('/api/forms/definitions').forEach((r) => r.flush([]));
    return { fixture, element, controller, el, canvas, toasts, flushForms, page: fixture.componentInstance };
  }

  async function loadDraft(s: ReturnType<typeof setup>, g: ProcessGraph = graph) {
    s.controller.expectOne('/api/workflow/definitions/expense-request/draft')
      .flush({ key: 'expense-request', name: 'Expense request', graph: g, updatedAt: '2026-09-25T10:00:00Z', updatedBy: 'bob' });
    await s.fixture.whenStable();
  }

  it('loads the draft onto the canvas with nothing unsaved', async () => {
    const s = setup();
    await loadDraft(s);
    expect(s.canvas().graph().nodes.length).toBe(3);
    expect(s.el<HTMLInputElement>('process-name').value).toBe('Expense request');
    expect(s.el('panel-empty')).not.toBeNull();
    expect(s.page.hasUnsavedChanges()).toBe(false);
  });

  it('starts from the latest published version when there is no draft, laying it out', async () => {
    const s = setup();
    s.controller.expectOne('/api/workflow/definitions/expense-request/draft').flush(null, { status: 404, statusText: 'Not Found' });
    s.controller.expectOne('/api/workflow/definitions').flush([
      { key: 'expense-request', name: 'Expense request', latestVersion: 2, status: 'PUBLISHED', hasDraft: false, draftUpdatedAt: null },
    ]);
    const bare: ProcessGraph = {
      nodes: graph.nodes.map((n) => {
        const copy = { ...n };
        delete copy.position;
        return copy;
      }),
      edges: graph.edges,
    };
    s.controller.expectOne('/api/workflow/definitions/expense-request/versions/2')
      .flush({ id: 'd2', key: 'expense-request', version: 2, name: 'Expense request', status: 'PUBLISHED', graph: bare, publishedAt: 'x', publishedBy: 'y' });
    await s.fixture.whenStable();
    expect(s.el('source-note').textContent).toContain('version 2');
    expect(s.canvas().graph().nodes.every((n) => n.position)).toBe(true);
    expect(s.page.hasUnsavedChanges()).toBe(true);
  });

  it('starts a new process with a start and an end when the key is new', async () => {
    const s = setup('Travel request');
    s.controller.expectOne('/api/workflow/definitions/expense-request/draft').flush(null, { status: 404, statusText: 'Not Found' });
    s.controller.expectOne('/api/workflow/definitions').flush([]);
    await s.fixture.whenStable();
    expect(s.el<HTMLInputElement>('process-name').value).toBe('Travel request');
    expect(s.canvas().graph().nodes.map((n) => n.type)).toEqual(['START', 'END']);
  });

  it('adds a step from the palette, selects it, connects it and saves what it does not understand unchanged', async () => {
    const s = setup();
    await loadDraft(s);
    s.el<HTMLButtonElement>('palette-TIMER').click();
    await s.fixture.whenStable();
    expect(s.canvas().selectedNode()).toBe('timer1');
    s.canvas().connected.emit({ source: 'task1', target: 'timer1' });
    await s.fixture.whenStable();
    expect(s.canvas().selectedEdge()).toBe('flow4');

    s.el<HTMLButtonElement>('save').click();
    const save = s.controller.expectOne({ method: 'PUT', url: '/api/workflow/definitions/expense-request/draft' });
    const saved = save.request.body.graph as ProcessGraph;
    expect(saved['layoutVersion']).toBe(1);
    expect(saved.nodes.find((n) => n.id === 'task1')!['futureSetting']).toBe('x');
    expect(saved.nodes.find((n) => n.id === 'timer1')).toMatchObject({ type: 'TIMER', duration: 'PT1H' });
    expect(saved.edges.at(-1)).toEqual({ id: 'flow4', source: 'task1', target: 'timer1' });
    save.flush({});
    await s.fixture.whenStable();
    expect(s.page.hasUnsavedChanges()).toBe(false);
    expect(s.toasts()).toContain('Draft saved');
  });

  it('refuses a connection that cannot exist and says why', async () => {
    const s = setup();
    await loadDraft(s);
    s.canvas().connected.emit({ source: 'end', target: 'task1' });
    await s.fixture.whenStable();
    expect(s.el('notice').textContent).toContain('Nothing may flow out of an end');
    expect(s.canvas().graph().edges.length).toBe(3);
  });

  it('edits the selected step through its properties and moves nodes', async () => {
    const s = setup();
    await loadDraft(s);
    s.canvas().nodeSelected.emit('task1');
    await s.fixture.whenStable();
    s.flushForms();
    const name = s.el<HTMLInputElement>('prop-name');
    name.value = 'Boss approval';
    name.dispatchEvent(new Event('input'));
    s.canvas().nodesMoved.emit([{ id: 'end', position: { x: 600.2, y: 40 } }]);
    await s.fixture.whenStable();
    const nodes = s.canvas().graph().nodes;
    expect(nodes.find((n) => n.id === 'task1')!.name).toBe('Boss approval');
    expect(nodes.find((n) => n.id === 'end')!.position).toEqual({ x: 600, y: 40 });
    expect(s.page.hasUnsavedChanges()).toBe(true);
  });

  it('says how many flows lost their outcome when an outcome is removed', async () => {
    const s = setup();
    await loadDraft(s);
    s.canvas().nodeSelected.emit('task1');
    await s.fixture.whenStable();
    s.flushForms();
    s.el<HTMLButtonElement>('outcome-remove-1').click();
    await s.fixture.whenStable();
    expect(s.el('notice').textContent).toContain('1 flow no longer has an outcome');
    expect(s.canvas().graph().edges.find((e) => e.id === 'flow3')!.outcome).toBeUndefined();
  });

  it('deleting the selected step removes its flows and closes its properties', async () => {
    const s = setup();
    await loadDraft(s);
    s.canvas().nodeSelected.emit('task1');
    await s.fixture.whenStable();
    s.flushForms();
    s.el<HTMLButtonElement>('prop-delete').click();
    await s.fixture.whenStable();
    expect(s.canvas().graph().nodes.map((n) => n.id)).toEqual(['start', 'end']);
    expect(s.canvas().graph().edges).toEqual([]);
    expect(s.el('panel-empty')).not.toBeNull();
  });

  it('edits the selected flow and deletes it', async () => {
    const s = setup();
    await loadDraft(s);
    s.canvas().edgeSelected.emit('flow3');
    await s.fixture.whenStable();
    const outcome = s.el<HTMLSelectElement>('edge-outcome');
    outcome.value = '';
    outcome.dispatchEvent(new Event('change'));
    await s.fixture.whenStable();
    expect(s.canvas().graph().edges.find((e) => e.id === 'flow3')!.outcome).toBeUndefined();
    s.el<HTMLButtonElement>('edge-delete').click();
    await s.fixture.whenStable();
    expect(s.canvas().graph().edges.map((e) => e.id)).toEqual(['flow1', 'flow2']);
    expect(s.el('panel-empty')).not.toBeNull();
  });

  it('lists the problems a check finds, highlights their nodes and selects a node from its problem', async () => {
    const s = setup();
    await loadDraft(s);
    s.el<HTMLButtonElement>('check').click();
    s.controller.expectOne({ method: 'POST', url: '/api/workflow/definitions/expense-request/validate' }).flush({
      valid: false,
      errors: [
        { nodeId: 'task1', code: 'TASK_NO_ASSIGNMENT', message: 'A task needs an assignment' },
        { nodeId: null, code: 'NO_END', message: 'A process needs at least one end node' },
        { nodeId: 'gone', code: 'DEAD_END', message: 'No path from this node reaches an end' },
      ],
    });
    await s.fixture.whenStable();
    const problems = s.element.querySelectorAll<HTMLElement>('[data-testid="problem"]');
    expect(problems.length).toBe(3);
    expect([...s.canvas().problemNodes()]).toEqual(['task1', 'gone']);
    // Only problems of nodes that still exist are links.
    expect(problems[1].querySelector('button')).toBeNull();
    expect(problems[2].querySelector('button')).toBeNull();
    problems[0].querySelector('button')!.click();
    await s.fixture.whenStable();
    expect(s.canvas().selectedNode()).toBe('task1');
  });

  it('publishing saves unsaved changes first, then publishes; a refusal lists the problems', async () => {
    const s = setup();
    await loadDraft(s);
    s.el<HTMLButtonElement>('palette-END').click();
    s.el<HTMLButtonElement>('publish').click();
    s.controller.expectOne({ method: 'PUT', url: '/api/workflow/definitions/expense-request/draft' }).flush({});
    s.controller.expectOne({ method: 'POST', url: '/api/workflow/definitions/expense-request/publish' }).flush(
      { code: 'WF_DEFINITION_INVALID', errors: [{ nodeId: 'end1', code: 'UNREACHABLE', message: 'This node cannot be reached from the start' }] },
      { status: 400, statusText: 'Bad Request' });
    await s.fixture.whenStable();
    expect(s.element.querySelectorAll('[data-testid="problem"]').length).toBe(1);

    s.canvas().connected.emit({ source: 'task1', target: 'end1' });
    s.el<HTMLButtonElement>('publish').click();
    s.controller.expectOne({ method: 'PUT', url: '/api/workflow/definitions/expense-request/draft' }).flush({});
    s.controller.expectOne({ method: 'POST', url: '/api/workflow/definitions/expense-request/publish' })
      .flush({ id: 'd3', key: 'expense-request', version: 3, name: 'Expense request', publishedAt: 'x' });
    await s.fixture.whenStable();
    expect(s.toasts()).toContain('Published version 3');
    expect(s.element.querySelectorAll('[data-testid="problem"]').length).toBe(0);
  });

  it('asks the browser to confirm leaving with unsaved changes', async () => {
    const s = setup();
    await loadDraft(s);
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    s.el<HTMLButtonElement>('palette-END').click();
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});
