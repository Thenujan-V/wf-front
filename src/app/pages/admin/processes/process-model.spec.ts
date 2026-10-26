import { ProcessGraph } from '../../../core/workflow/process.models';
import {
  PROCESS_KEY, addNode, addOutcome, connect, edgeLabel, emptyGraph, moveNodes, outcomeName, paletteFor,
  problemNodeIds, reconnect, removeEdge, removeNode, removeOutcome, renameOutcome, updateEdge, updateNode, withLayout,
} from './process-model';

/** start → task → decision → (approved | rejected); task REJECT → rejected. */
function sample(): ProcessGraph {
  return {
    nodes: [
      { id: 'start', type: 'START', name: 'Submit', position: { x: 40, y: 160 } },
      { id: 'task1', type: 'USER_TASK', name: 'Manager approval', position: { x: 260, y: 160 },
        assignment: { type: 'INITIATOR_MANAGER', levels: 1 }, outcomes: ['APPROVE', 'REJECT'], approvalMode: 'SINGLE',
        sla: { dueIn: 'P2D', onBreach: 'AUTO_COMPLETE', autoOutcome: 'REJECT' } },
      { id: 'decision1', type: 'EXCLUSIVE_GATEWAY', name: 'Large?', position: { x: 480, y: 160 } },
      { id: 'approved', type: 'END', name: 'Approved', endStatus: 'APPROVED', position: { x: 700, y: 40 } },
      { id: 'rejected', type: 'END', name: 'Rejected', endStatus: 'REJECTED', position: { x: 700, y: 280 } },
    ],
    edges: [
      { id: 'flow1', source: 'start', target: 'task1' },
      { id: 'flow2', source: 'task1', target: 'decision1', outcome: 'APPROVE' },
      { id: 'flow3', source: 'task1', target: 'rejected', outcome: 'REJECT' },
      { id: 'flow4', source: 'decision1', target: 'approved', default: true },
    ],
  };
}

describe('process model', () => {
  it('accepts the same keys as workflow-service', () => {
    expect(PROCESS_KEY.test('expense-request')).toBe(true);
    expect(PROCESS_KEY.test('Expense')).toBe(false);
    expect(PROCESS_KEY.test('x')).toBe(false);
  });

  it('starts a new process with a start flowing into an end', () => {
    const graph = emptyGraph();
    expect(graph.nodes.map((n) => n.type)).toEqual(['START', 'END']);
    expect(graph.edges).toEqual([{ id: 'flow1', source: 'start', target: 'end' }]);
    expect(graph.nodes.every((n) => n.position)).toBe(true);
  });

  it('offers a start in the palette only while the process has none', () => {
    expect(paletteFor(sample()).some((p) => p.type === 'START')).toBe(false);
    expect(paletteFor(removeNode(sample(), 'start')).some((p) => p.type === 'START')).toBe(true);
  });

  it('adds nodes with unique ids, a place on the canvas and settings that already pass validation', () => {
    const first = addNode(sample(), 'USER_TASK');
    const second = addNode(first.graph, 'USER_TASK');
    expect(first.id).toBe('task2');
    expect(second.id).toBe('task3');
    const task = second.graph.nodes.find((n) => n.id === 'task3')!;
    expect(task).toMatchObject({
      type: 'USER_TASK', name: 'New task', assignment: { type: 'INITIATOR_MANAGER', levels: 1 },
      outcomes: ['APPROVE', 'REJECT'], approvalMode: 'SINGLE',
    });
    expect(task.position!.x).toBeGreaterThan(700);
    expect(addNode(sample(), 'TIMER', { x: 5, y: 6 }).graph.nodes.at(-1)).toMatchObject({ duration: 'PT1H', position: { x: 5, y: 6 } });
    expect(addNode(sample(), 'SYSTEM_ACTION').graph.nodes.at(-1)).toMatchObject({ actionType: 'SEND_EMAIL', config: {} });
  });

  it('updates a node and drops settings patched to undefined', () => {
    const graph = updateNode(sample(), 'task1', { name: 'Boss approval', sla: undefined });
    const task = graph.nodes.find((n) => n.id === 'task1')!;
    expect(task.name).toBe('Boss approval');
    expect('sla' in task).toBe(false);
  });

  it('removes a node together with every flow that touches it', () => {
    const graph = removeNode(sample(), 'task1');
    expect(graph.nodes.some((n) => n.id === 'task1')).toBe(false);
    expect(graph.edges.map((e) => e.id)).toEqual(['flow4']);
  });

  it('moves nodes to whole-pixel positions', () => {
    const graph = moveNodes(sample(), [{ id: 'task1', position: { x: 300.4, y: 99.6 } }]);
    expect(graph.nodes.find((n) => n.id === 'task1')!.position).toEqual({ x: 300, y: 100 });
  });

  it('connects a task through its first outcome that has no flow yet', () => {
    const base = updateNode(sample(), 'task1', { outcomes: ['APPROVE', 'REJECT', 'SEND_BACK'] });
    const result = connect(base, 'task1', 'approved');
    expect('edgeId' in result && result.graph.edges.at(-1)).toEqual({ id: 'flow5', source: 'task1', target: 'approved', outcome: 'SEND_BACK' });
  });

  it('makes the first flow out of a decision its default, and later ones plain', () => {
    const noDefault = removeEdge(sample(), 'flow4');
    const first = connect(noDefault, 'decision1', 'approved');
    expect('edgeId' in first && first.graph.edges.at(-1)).toMatchObject({ default: true });
    const second = connect(sample(), 'decision1', 'rejected');
    expect('edgeId' in second && second.graph.edges.at(-1)).toEqual({ id: 'flow5', source: 'decision1', target: 'rejected' });
  });

  it('refuses connections that cannot exist, and says why', () => {
    const refused = (graph: ProcessGraph, source: string, target: string) => {
      const result = connect(graph, source, target);
      return 'refused' in result ? result.refused : null;
    };
    expect(refused(sample(), 'task1', 'task1')).toBe('A step cannot flow into itself');
    expect(refused(sample(), 'task1', 'start')).toBe('Nothing may flow into the start');
    expect(refused(sample(), 'approved', 'task1')).toBe('Nothing may flow out of an end');
    expect(refused(sample(), 'start', 'decision1')).toBe('Start "Submit" already has its one outgoing flow; remove that flow first');
    expect(refused(sample(), 'decision1', 'approved')).toBe('"Large?" already flows into "Approved"');
    expect(refused(sample(), 'task1', 'ghost')).toBe('Connect two steps of this process');
    // A task may have two outcomes leading to the same step.
    expect(refused(updateNode(sample(), 'task1', { outcomes: ['APPROVE', 'REJECT', 'SEND_BACK'] }), 'task1', 'rejected')).toBeNull();
  });

  it('moves a flow end, and rebinds it when it leaves for another source', () => {
    const target = reconnect(sample(), 'flow3', 'target', 'approved');
    expect('edgeId' in target && target.graph.edges.find((e) => e.id === 'flow3')).toEqual(
      { id: 'flow3', source: 'task1', target: 'approved', outcome: 'REJECT' });

    const source = reconnect(sample(), 'flow3', 'source', 'decision1');
    expect('edgeId' in source && source.graph.edges.find((e) => e.id === 'flow3')).toEqual(
      { id: 'flow3', source: 'decision1', target: 'rejected' });

    const refused = reconnect(sample(), 'flow2', 'target', 'start');
    expect(refused).toEqual({ refused: 'Nothing may flow into the start' });
  });

  it('keeps one default per decision, and a default has no condition', () => {
    const withCondition = connect(sample(), 'decision1', 'rejected');
    if (!('edgeId' in withCondition)) throw new Error('expected a flow');
    let graph = updateEdge(withCondition.graph, 'flow5', { condition: { var: 'form.amount', op: 'gt', value: 10 } });
    graph = updateEdge(graph, 'flow5', { default: true });
    expect(graph.edges.find((e) => e.id === 'flow5')).toEqual({ id: 'flow5', source: 'decision1', target: 'rejected', default: true });
    expect(graph.edges.find((e) => e.id === 'flow4')!.default).toBeUndefined();
    graph = updateEdge(graph, 'flow5', { default: false });
    expect('default' in graph.edges.find((e) => e.id === 'flow5')!).toBe(false);
  });

  it('names outcomes in capitals with underscores', () => {
    expect(outcomeName('  send back ')).toBe('SEND_BACK');
    expect(outcomeName('ok!')).toBe('OK');
  });

  it('adds an outcome once', () => {
    const added = addOutcome(sample(), 'task1', 'send back');
    expect('graph' in added && added.graph.nodes.find((n) => n.id === 'task1')!.outcomes).toEqual(['APPROVE', 'REJECT', 'SEND_BACK']);
    expect(addOutcome(sample(), 'task1', 'approve')).toEqual({ refused: 'The task already has the outcome APPROVE' });
    expect(addOutcome(sample(), 'task1', ' ! ')).toEqual({ refused: 'Give the outcome a name' });
  });

  it('renames an outcome everywhere it is used', () => {
    const renamed = renameOutcome(sample(), 'task1', 'REJECT', 'decline');
    if (!('graph' in renamed)) throw new Error('expected a rename');
    const task = renamed.graph.nodes.find((n) => n.id === 'task1')!;
    expect(task.outcomes).toEqual(['APPROVE', 'DECLINE']);
    expect(task.sla!.autoOutcome).toBe('DECLINE');
    expect(renamed.graph.edges.find((e) => e.id === 'flow3')!.outcome).toBe('DECLINE');
    expect(renameOutcome(sample(), 'task1', 'REJECT', 'approve')).toEqual({ refused: 'The task already has the outcome APPROVE' });
  });

  it('removes an outcome, unbinding its flows and the automatic outcome', () => {
    const { graph, unboundFlows } = removeOutcome(sample(), 'task1', 'REJECT');
    const task = graph.nodes.find((n) => n.id === 'task1')!;
    expect(task.outcomes).toEqual(['APPROVE']);
    expect(task.sla).toEqual({ dueIn: 'P2D', onBreach: 'AUTO_COMPLETE' });
    expect(graph.edges.find((e) => e.id === 'flow3')).toEqual({ id: 'flow3', source: 'task1', target: 'rejected' });
    expect(unboundFlows).toBe(1);
  });

  it('lays out a graph without positions from the start, keeping unknown properties', () => {
    const bare: ProcessGraph = {
      extra: 'kept',
      nodes: [
        { id: 'end', type: 'END', name: 'End', note: 'kept too' },
        { id: 'start', type: 'START', name: 'Start' },
        { id: 'a', type: 'USER_TASK', name: 'A' },
        { id: 'b', type: 'USER_TASK', name: 'B' },
        { id: 'lonely', type: 'TIMER', name: 'Lonely' },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'a' },
        { id: 'e2', source: 'start', target: 'b' },
        { id: 'e3', source: 'a', target: 'end' },
      ],
    };
    const laid = withLayout(bare);
    const at = (id: string) => laid.nodes.find((n) => n.id === id)!.position;
    expect(at('start')).toEqual({ x: 40, y: 40 });
    expect(at('a')).toEqual({ x: 260, y: 40 });
    expect(at('b')).toEqual({ x: 260, y: 160 });
    expect(at('end')).toEqual({ x: 480, y: 40 });
    expect(at('lonely')).toEqual({ x: 700, y: 40 });
    expect(laid['extra']).toBe('kept');
    expect(laid.nodes[0]['note']).toBe('kept too');
    expect(withLayout(sample())).toEqual(sample());
  });

  it('collects the nodes that have problems, ignoring whole-process ones', () => {
    const ids = problemNodeIds([
      { nodeId: 'task1', code: 'TASK_NO_ASSIGNMENT', message: 'x' },
      { nodeId: null, code: 'NO_END', message: 'y' },
    ]);
    expect([...ids]).toEqual(['task1']);
    expect(problemNodeIds(null).size).toBe(0);
  });

  it('labels flows by outcome, default or condition', () => {
    expect(edgeLabel({ id: 'a', source: 's', target: 't', outcome: 'APPROVE' })).toBe('APPROVE');
    expect(edgeLabel({ id: 'a', source: 's', target: 't', default: true })).toBe('otherwise');
    expect(edgeLabel({ id: 'a', source: 's', target: 't', condition: { var: 'form.amount', op: 'gt', value: 10000 } }))
      .toBe('if amount is more than 10000');
    expect(edgeLabel({ id: 'a', source: 's', target: 't', condition: { var: 'form.region', op: 'in', value: ['EU', 'US'] } }))
      .toBe('if region is one of EU, US');
    expect(edgeLabel({ id: 'a', source: 's', target: 't',
      condition: { any: [{ var: 'form.a', op: 'isEmpty' }, { var: 'form.b', op: 'isEmpty' }] } })).toBe('if any of 2 conditions');
    expect(edgeLabel({ id: 'a', source: 's', target: 't', condition: { var: 'requester.department', op: 'eq', value: 'X' } }))
      .toBe('if requester department is X');
    expect(edgeLabel({ id: 'a', source: 's', target: 't', condition: { var: 'nodes.task1.outcome', op: 'eq', value: 'APPROVE' } },
      { task1: 'Legal review' })).toBe('if Legal review outcome is APPROVE');
    expect(edgeLabel({ id: 'a', source: 's', target: 't', condition: { not: { var: 'form.a', op: 'isEmpty' } } }))
      .toBe('if (custom rule)');
    expect(edgeLabel({ id: 'a', source: 's', target: 't' })).toBe('');
  });
});
