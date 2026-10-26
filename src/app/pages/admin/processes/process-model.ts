import {
  NodeType, Point, ProcessEdge, ProcessGraph, ProcessNode, ValidationProblem,
} from '../../../core/workflow/process.models';
import { needsValue, operatorLabel, readRule } from '../forms/condition-rows';

/** Same rule as workflow-service's DefinitionController. */
export const PROCESS_KEY = /^[a-z0-9][a-z0-9-]{1,99}$/;
export const COLUMN = 220;
export const ROW = 120;
const MARGIN = 40;

export interface PaletteItem {
  type: NodeType;
  label: string;
  hint: string;
}

export const NODE_TYPES: PaletteItem[] = [
  { type: 'START', label: 'Start', hint: 'Where a request begins; it may carry the request form' },
  { type: 'USER_TASK', label: 'Task', hint: 'A person or group acts: approve, reject, fill in a form' },
  { type: 'EXCLUSIVE_GATEWAY', label: 'Decision', hint: 'Takes the first flow whose condition holds' },
  { type: 'PARALLEL_GATEWAY', label: 'Parallel', hint: 'Splits into branches, or waits for all of them' },
  { type: 'TIMER', label: 'Timer', hint: 'Waits for a while, or until a date' },
  { type: 'SYSTEM_ACTION', label: 'System action', hint: 'Sends an email, sets a value or calls a webhook' },
  { type: 'END', label: 'End', hint: 'Where a path finishes' },
];

const ID_PREFIX: Record<NodeType, string> = {
  START: 'start', END: 'end', USER_TASK: 'task', EXCLUSIVE_GATEWAY: 'decision', PARALLEL_GATEWAY: 'parallel',
  TIMER: 'timer', SYSTEM_ACTION: 'action',
};

const NEW_NAME: Record<NodeType, string> = {
  START: 'Start', END: 'End', USER_TASK: 'New task', EXCLUSIVE_GATEWAY: 'Decision', PARALLEL_GATEWAY: 'Parallel',
  TIMER: 'Wait', SYSTEM_ACTION: 'System action',
};

/** Node types the engine lets have exactly one outgoing flow. */
const SINGLE_OUT: ReadonlySet<NodeType> = new Set<NodeType>(['START', 'TIMER', 'SYSTEM_ACTION']);

export type EdgeResult = { graph: ProcessGraph; edgeId: string } | { refused: string };
export type OutcomeResult = { graph: ProcessGraph } | { refused: string };

export function typeLabel(type: NodeType): string {
  return NODE_TYPES.find((t) => t.type === type)?.label ?? type;
}

/** Every node type, but a start only while the process has none. */
export function paletteFor(graph: ProcessGraph): PaletteItem[] {
  const hasStart = graph.nodes.some((n) => n.type === 'START');
  return NODE_TYPES.filter((t) => t.type !== 'START' || !hasStart);
}

export function emptyGraph(): ProcessGraph {
  return {
    nodes: [
      { id: 'start', type: 'START', name: 'Start', position: { x: MARGIN, y: MARGIN + ROW } },
      { id: 'end', type: 'END', name: 'End', position: { x: MARGIN + 2 * COLUMN, y: MARGIN + ROW } },
    ],
    edges: [{ id: 'flow1', source: 'start', target: 'end' }],
  };
}

export function addNode(graph: ProcessGraph, type: NodeType, position?: Point): { graph: ProcessGraph; id: string } {
  const id = uniqueId(graph.nodes.map((n) => n.id), ID_PREFIX[type]);
  const node: ProcessNode = { id, type, name: NEW_NAME[type], position: position ?? nextPosition(graph), ...defaultsFor(type) };
  return { graph: { ...graph, nodes: [...graph.nodes, node] }, id };
}

/** Settings a new node starts with, chosen so that it passes publish validation once connected. */
function defaultsFor(type: NodeType): Partial<ProcessNode> {
  switch (type) {
    case 'USER_TASK':
      return { assignment: { type: 'INITIATOR_MANAGER', levels: 1 }, outcomes: ['APPROVE', 'REJECT'], approvalMode: 'SINGLE' };
    case 'TIMER':
      return { duration: 'PT1H' };
    case 'SYSTEM_ACTION':
      return { actionType: 'SEND_EMAIL', config: {} };
    default:
      return {};
  }
}

/** To the right of everything, on the top row, where it overlaps nothing. */
function nextPosition(graph: ProcessGraph): Point {
  const xs = graph.nodes.map((n) => n.position?.x).filter((x): x is number => typeof x === 'number');
  return { x: xs.length ? Math.max(...xs) + COLUMN : MARGIN, y: MARGIN };
}

export function updateNode(graph: ProcessGraph, id: string, patch: Partial<ProcessNode>): ProcessGraph {
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === id ? withoutUndefined({ ...n, ...patch }) : n)) };
}

export function removeNode(graph: ProcessGraph, id: string): ProcessGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.source !== id && e.target !== id),
  };
}

export function moveNodes(graph: ProcessGraph, moves: { id: string; position: Point }[]): ProcessGraph {
  const to = new Map(moves.map((m) => [m.id, { x: Math.round(m.position.x), y: Math.round(m.position.y) }]));
  return { ...graph, nodes: graph.nodes.map((n) => (to.has(n.id) ? { ...n, position: to.get(n.id)! } : n)) };
}

export function connect(graph: ProcessGraph, source: string, target: string): EdgeResult {
  const refusal = connectionRefusal(graph, source, target, null);
  if (refusal) {
    return { refused: refusal };
  }
  const edgeId = uniqueId(graph.edges.map((e) => e.id), 'flow');
  const edge: ProcessEdge = { id: edgeId, source, target, ...bindingFor(graph, source, null) };
  return { graph: { ...graph, edges: [...graph.edges, edge] }, edgeId };
}

/** Moves one end of a flow. A flow that leaves for another source drops its old outcome or condition. */
export function reconnect(graph: ProcessGraph, edgeId: string, end: 'source' | 'target', nodeId: string): EdgeResult {
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (!edge) {
    return { refused: 'That flow no longer exists' };
  }
  const source = end === 'source' ? nodeId : edge.source;
  const target = end === 'target' ? nodeId : edge.target;
  const refusal = connectionRefusal(graph, source, target, edgeId);
  if (refusal) {
    return { refused: refusal };
  }
  let next: ProcessEdge = { ...edge, source, target };
  if (source !== edge.source) {
    delete next.outcome;
    delete next.condition;
    delete next.default;
    next = { ...next, ...bindingFor(graph, source, edgeId) };
  }
  return { graph: { ...graph, edges: graph.edges.map((e) => (e.id === edgeId ? next : e)) }, edgeId };
}

function connectionRefusal(graph: ProcessGraph, source: string, target: string, ignoreEdge: string | null): string | null {
  const from = graph.nodes.find((n) => n.id === source);
  const to = graph.nodes.find((n) => n.id === target);
  if (!from || !to) {
    return 'Connect two steps of this process';
  }
  if (source === target) {
    return 'A step cannot flow into itself';
  }
  if (to.type === 'START') {
    return 'Nothing may flow into the start';
  }
  if (from.type === 'END') {
    return 'Nothing may flow out of an end';
  }
  const siblings = graph.edges.filter((e) => e.id !== ignoreEdge && e.source === source);
  if (SINGLE_OUT.has(from.type) && siblings.length) {
    return `${typeLabel(from.type)} "${from.name}" already has its one outgoing flow; remove that flow first`;
  }
  if (from.type !== 'USER_TASK' && siblings.some((e) => e.target === target)) {
    return `"${from.name}" already flows into "${to.name}"`;
  }
  return null;
}

/** What a new flow out of `source` starts with: the task's first outcome without a flow, or the decision's default. */
function bindingFor(graph: ProcessGraph, source: string, ignoreEdge: string | null): Partial<ProcessEdge> {
  const from = graph.nodes.find((n) => n.id === source)!;
  const siblings = graph.edges.filter((e) => e.source === source && e.id !== ignoreEdge);
  if (from.type === 'USER_TASK') {
    const outcome = (from.outcomes ?? []).find((o) => !siblings.some((e) => e.outcome === o));
    return outcome ? { outcome } : {};
  }
  if (from.type === 'EXCLUSIVE_GATEWAY' && !siblings.some((e) => e.default)) {
    return { default: true };
  }
  return {};
}

/** A decision has one default flow, and the default flow has no condition. */
export function updateEdge(graph: ProcessGraph, id: string, patch: Pick<Partial<ProcessEdge>, 'outcome' | 'condition' | 'default'>): ProcessGraph {
  const edge = graph.edges.find((e) => e.id === id);
  if (!edge) {
    return graph;
  }
  const makesDefault = patch.default === true;
  return {
    ...graph,
    edges: graph.edges.map((e) => {
      if (e.id === id) {
        const next = withoutUndefined({ ...e, ...patch });
        if (makesDefault) {
          delete next.condition;
        }
        if (next.default === false) {
          delete next.default;
        }
        return next;
      }
      if (makesDefault && e.source === edge.source && e.default) {
        const other = { ...e };
        delete other.default;
        return other;
      }
      return e;
    }),
  };
}

export function removeEdge(graph: ProcessGraph, id: string): ProcessGraph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== id) };
}

/** Outcomes are capitals and underscores: "send back" becomes SEND_BACK. */
export function outcomeName(text: string): string {
  return text.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function addOutcome(graph: ProcessGraph, taskId: string, name: string): OutcomeResult {
  const outcome = outcomeName(name);
  const outcomes = graph.nodes.find((n) => n.id === taskId)?.outcomes ?? [];
  if (!outcome) {
    return { refused: 'Give the outcome a name' };
  }
  if (outcomes.includes(outcome)) {
    return { refused: `The task already has the outcome ${outcome}` };
  }
  return { graph: updateNode(graph, taskId, { outcomes: [...outcomes, outcome] }) };
}

/** Renames the outcome in the task, in its flows and in the SLA's automatic outcome. */
export function renameOutcome(graph: ProcessGraph, taskId: string, from: string, to: string): OutcomeResult {
  const outcome = outcomeName(to);
  const task = graph.nodes.find((n) => n.id === taskId);
  if (!task) {
    return { graph };
  }
  if (!outcome) {
    return { refused: 'Give the outcome a name' };
  }
  if (outcome === from) {
    return { graph };
  }
  if ((task.outcomes ?? []).includes(outcome)) {
    return { refused: `The task already has the outcome ${outcome}` };
  }
  const sla = task.sla?.autoOutcome === from ? { ...task.sla, autoOutcome: outcome } : task.sla;
  const renamed = updateNode(graph, taskId, { outcomes: (task.outcomes ?? []).map((o) => (o === from ? outcome : o)), sla });
  return {
    graph: {
      ...renamed,
      edges: renamed.edges.map((e) => (e.source === taskId && e.outcome === from ? { ...e, outcome } : e)),
    },
  };
}

/** Removes the outcome; flows that used it lose their outcome, and so does the SLA's automatic completion. */
export function removeOutcome(graph: ProcessGraph, taskId: string, name: string): { graph: ProcessGraph; unboundFlows: number } {
  const task = graph.nodes.find((n) => n.id === taskId);
  if (!task) {
    return { graph, unboundFlows: 0 };
  }
  let sla = task.sla;
  if (sla?.autoOutcome === name) {
    sla = { ...sla };
    delete sla.autoOutcome;
  }
  const updated = updateNode(graph, taskId, { outcomes: (task.outcomes ?? []).filter((o) => o !== name), sla });
  let unboundFlows = 0;
  const edges = updated.edges.map((e) => {
    if (e.source !== taskId || e.outcome !== name) {
      return e;
    }
    unboundFlows++;
    const next = { ...e };
    delete next.outcome;
    return next;
  });
  return { graph: { ...updated, edges }, unboundFlows };
}

/**
 * Gives nodes without a position one: a column per step away from the start, a row per node in that column.
 * Nodes the start cannot reach go in the last column. A graph that already has every position is returned as is.
 */
export function withLayout(graph: ProcessGraph): ProcessGraph {
  if (graph.nodes.every((n) => isPoint(n.position))) {
    return graph;
  }
  const ids = new Set(graph.nodes.map((n) => n.id));
  const layer = new Map<string, number>();
  const queue = graph.nodes.filter((n) => n.type === 'START').map((n) => n.id);
  queue.forEach((id) => layer.set(id, 0));
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of graph.edges) {
      if (e.source === id && ids.has(e.target) && !layer.has(e.target)) {
        layer.set(e.target, layer.get(id)! + 1);
        queue.push(e.target);
      }
    }
  }
  const last = Math.max(-1, ...layer.values()) + 1;
  const rows = new Map<number, number>();
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (isPoint(n.position)) {
        return n;
      }
      const column = layer.get(n.id) ?? last;
      const row = rows.get(column) ?? 0;
      rows.set(column, row + 1);
      return { ...n, position: { x: MARGIN + column * COLUMN, y: MARGIN + row * ROW } };
    }),
  };
}

export function problemNodeIds(problems: ValidationProblem[] | null): ReadonlySet<string> {
  return new Set((problems ?? []).map((p) => p.nodeId).filter((id): id is string => !!id));
}

/** The short text drawn on a flow. */
export function edgeLabel(edge: ProcessEdge): string {
  if (edge.outcome) {
    return edge.outcome;
  }
  if (edge.default) {
    return 'otherwise';
  }
  if (edge.condition === undefined || edge.condition === null) {
    return '';
  }
  const read = readRule(edge.condition);
  if (read.kind !== 'rows') {
    return 'if (custom rule)';
  }
  const rows = read.model.rows;
  if (rows.length > 1) {
    return `if ${read.model.mode} of ${rows.length} conditions`;
  }
  const row = rows[0];
  const value = needsValue(row.op) ? ` ${Array.isArray(row.value) ? row.value.join(', ') : String(row.value)}` : '';
  return `if ${row.field} ${operatorLabel(row.op)}${value}`;
}

/** A copy without the properties whose value is undefined, so saved JSON has no empty settings. */
export function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function uniqueId(taken: string[], prefix: string): string {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${prefix}${n}`)) {
    n++;
  }
  return `${prefix}${n}`;
}

function isPoint(value: unknown): value is Point {
  const point = value as Point | undefined;
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}
