import { Component, effect, input, output, untracked, viewChild } from '@angular/core';
import {
  FCreateConnectionEvent, FFlowComponent, FFlowModule, FMoveNodesEvent, FReassignConnectionEvent, FSelectionChangeEvent,
} from '@foblex/flow';
import { NodeType, Point, ProcessGraph } from '../../../core/workflow/process.models';
import { edgeLabel, typeLabel } from './process-model';

export interface NodeMove {
  id: string;
  position: Point;
}

export interface Connection {
  source: string;
  target: string;
}

export interface Reconnection {
  edgeId: string;
  end: 'source' | 'target';
  nodeId: string;
}

const ORIGIN: Point = { x: 0, y: 0 };

const SHAPES: Record<NodeType, string> = {
  START: 'rounded-full border-ok bg-ok-soft',
  END: 'rounded-full border-line-strong bg-field',
  USER_TASK: 'rounded-lg border-line-strong bg-surface',
  EXCLUSIVE_GATEWAY: 'rounded-md border-warn bg-warn-soft',
  PARALLEL_GATEWAY: 'rounded-md border-accent bg-accent-soft',
  TIMER: 'rounded-lg border-accent-text bg-surface',
  SYSTEM_ACTION: 'rounded-lg border-line-strong bg-field',
};

/** Connector ids are "in:<nodeId>" and "out:<nodeId>". */
export function nodeOf(connectorId: string): string {
  return connectorId.slice(connectorId.indexOf(':') + 1);
}

/**
 * Draws the process with @foblex/flow and reports gestures. It changes nothing itself: the page applies each
 * gesture through the process model, which may refuse it.
 */
@Component({
  selector: 'app-process-canvas',
  imports: [FFlowModule],
  templateUrl: './process-canvas.html',
  styles: `
    :host { display: block; height: 100%; }
    f-flow { display: block; height: 100%; }
  `,
})
export class ProcessCanvas {
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

  private readonly flow = viewChild(FFlowComponent);
  protected readonly origin = ORIGIN;
  protected readonly typeLabel = typeLabel;
  protected readonly edgeLabel = edgeLabel;

  constructor() {
    // The page also selects (palette, new flows, problems); the library must agree, or clicking the step it still
    // thinks is selected fires no selection event.
    effect(() => {
      const flow = this.flow();
      const node = this.selectedNode();
      const edge = this.selectedEdge();
      if (flow) {
        untracked(() => flow.select(node ? [node] : [], edge ? [edge] : [], false));
      }
    });
  }

  protected shape(type: NodeType): string {
    return SHAPES[type];
  }

  protected onConnect(event: FCreateConnectionEvent): void {
    if (event.targetId) {
      this.connected.emit({ source: nodeOf(event.sourceId), target: nodeOf(event.targetId) });
    }
  }

  protected onReassign(event: FReassignConnectionEvent): void {
    const next = event.endpoint === 'source' ? event.nextSourceId : event.nextTargetId;
    if (next) {
      this.reconnected.emit({ edgeId: event.connectionId, end: event.endpoint, nodeId: nodeOf(next) });
    }
  }

  protected onMove(event: FMoveNodesEvent): void {
    this.nodesMoved.emit(event.nodes.map((n) => ({ id: n.id, position: { x: n.position.x, y: n.position.y } })));
  }

  protected onSelection(event: FSelectionChangeEvent): void {
    if (event.nodeIds.length) {
      this.nodeSelected.emit(event.nodeIds[0]);
    } else if (event.connectionIds.length) {
      this.edgeSelected.emit(event.connectionIds[0]);
    } else {
      this.selectionCleared.emit();
    }
  }
}
