import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  FCreateConnectionEvent, FDraggableDirective, FFlowComponent, FMoveNodesEvent, FReassignConnectionEvent, FSelectionChangeEvent,
} from '@foblex/flow';
import { stubResizeObserver } from '../../../../testing/resize-observer';
import { ProcessGraph } from '../../../core/workflow/process.models';
import { ProcessCanvas, nodeOf } from './process-canvas';

stubResizeObserver();

const graph: ProcessGraph = {
  nodes: [
    { id: 'start', type: 'START', name: 'Submit', position: { x: 40, y: 40 } },
    { id: 'task1', type: 'USER_TASK', name: 'Manager approval', position: { x: 260, y: 40 }, outcomes: ['APPROVE'] },
    { id: 'end', type: 'END', name: 'Done', position: { x: 480, y: 40 } },
  ],
  edges: [
    { id: 'flow1', source: 'start', target: 'task1' },
    { id: 'flow2', source: 'task1', target: 'end', outcome: 'APPROVE' },
  ],
};

describe('ProcessCanvas', () => {
  function setup() {
    const fixture = TestBed.createComponent(ProcessCanvas);
    fixture.componentRef.setInput('graph', graph);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const flow = fixture.debugElement.query(By.directive(FDraggableDirective)).injector.get(FDraggableDirective);
    const canvas = fixture.componentInstance;
    return { fixture, element, flow, canvas };
  }

  it('draws a node per step with its type and name, and a labelled flow per edge', async () => {
    const { fixture, element } = setup();
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="node-task1"]')!.textContent).toContain('Manager approval');
    expect(element.querySelector('[data-testid="node-task1"]')!.textContent).toContain('Task');
    expect(element.querySelectorAll('f-connection').length).toBe(2);
    expect(element.textContent).toContain('APPROVE');
    // A start has no way in, an end no way out.
    expect(element.querySelector('[data-testid="node-start"] [data-connector="in"]')).toBeNull();
    expect(element.querySelector('[data-testid="node-end"] [data-connector="out"]')).toBeNull();
  });

  it('marks nodes with problems and the selected node', async () => {
    const { fixture, element } = setup();
    fixture.componentRef.setInput('problemNodes', new Set(['task1']));
    fixture.componentRef.setInput('selectedNode', 'end');
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="node-task1"]')!.getAttribute('data-problem')).toBe('true');
    expect(element.querySelector('[data-testid="node-end"]')!.getAttribute('data-selected')).toBe('true');
    expect(element.querySelector('[data-testid="node-start"]')!.hasAttribute('data-problem')).toBe(false);
  });

  it('reports a drawn connection between steps, and ignores one dropped on nothing', () => {
    const { flow, canvas } = setup();
    const connected: unknown[] = [];
    canvas.connected.subscribe((c) => connected.push(c));
    flow.fCreateConnection.emit(new FCreateConnectionEvent('out:start', 'in:end', { x: 0, y: 0 }));
    flow.fCreateConnection.emit(new FCreateConnectionEvent('out:start', undefined, { x: 0, y: 0 }));
    expect(connected).toEqual([{ source: 'start', target: 'end' }]);
  });

  it('reports a moved flow end, moved nodes and selections', () => {
    const { flow, canvas } = setup();
    const events: unknown[] = [];
    canvas.reconnected.subscribe((r) => events.push(r));
    canvas.nodesMoved.subscribe((m) => events.push(m));
    canvas.nodeSelected.subscribe((id) => events.push(`node ${id}`));
    canvas.edgeSelected.subscribe((id) => events.push(`edge ${id}`));
    canvas.selectionCleared.subscribe(() => events.push('cleared'));

    flow.fReassignConnection.emit({
      connectionId: 'flow2', endpoint: 'target', previousSourceId: 'out:task1', nextSourceId: undefined,
      previousTargetId: 'in:end', nextTargetId: 'in:start', dropPosition: { x: 0, y: 0 },
    } as unknown as FReassignConnectionEvent);
    flow.fReassignConnection.emit({
      connectionId: 'flow2', endpoint: 'target', previousSourceId: 'out:task1', nextSourceId: undefined,
      previousTargetId: 'in:end', nextTargetId: undefined, dropPosition: { x: 0, y: 0 },
    } as unknown as FReassignConnectionEvent);
    flow.fMoveNodes.emit(new FMoveNodesEvent([{ id: 'task1', position: { x: 300, y: 90 } }]));
    flow.fSelectionChange.emit(new FSelectionChangeEvent(['task1'], [], []));
    flow.fSelectionChange.emit(new FSelectionChangeEvent([], [], ['flow1']));
    flow.fSelectionChange.emit(new FSelectionChangeEvent([], [], []));

    expect(events).toEqual([
      { edgeId: 'flow2', end: 'target', nodeId: 'start' },
      [{ id: 'task1', position: { x: 300, y: 90 } }],
      'node task1',
      'edge flow1',
      'cleared',
    ]);
  });

  it('reads the node id back from a connector id', () => {
    expect(nodeOf('out:task1')).toBe('task1');
    expect(nodeOf('in:a:b')).toBe('a:b');
  });

  it('shows the selection of the page on the canvas, so clicking the previously selected step selects it again', async () => {
    const { fixture } = setup();
    const flow = fixture.debugElement.query(By.directive(FFlowComponent)).componentInstance as FFlowComponent;
    const select = vi.spyOn(flow, 'select');
    fixture.componentRef.setInput('selectedNode', 'task1');
    await fixture.whenStable();
    expect(select).toHaveBeenLastCalledWith(['task1'], [], false);
    fixture.componentRef.setInput('selectedNode', null);
    fixture.componentRef.setInput('selectedEdge', 'flow2');
    await fixture.whenStable();
    expect(select).toHaveBeenLastCalledWith([], ['flow2'], false);
  });
});
