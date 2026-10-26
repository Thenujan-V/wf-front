import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, concatMap, map, of } from 'rxjs';
import { PublishedForm } from '../../../core/forms/form.models';
import { ToastService } from '../../../core/ui/toast.service';
import { ProcessDefinitionsApi } from '../../../core/workflow/process-definitions.api';
import {
  NodeType, ProcessEdge, ProcessGraph, ProcessNode, ValidationProblem,
} from '../../../core/workflow/process.models';
import { EdgePatch, EdgeProperties } from './edge-properties';
import { FormCatalog } from './form-catalog';
import { NodeProperties } from './node-properties';
import { Connection, NodeMove, ProcessCanvas, Reconnection } from './process-canvas';
import { processConditionVariables, variablesOfType } from './process-fields';
import {
  EdgeResult, OutcomeResult, addNode, addOutcome, connect, emptyGraph, moveNodes, paletteFor, problemNodeIds, reconnect,
  removeEdge, removeNode, removeOutcome, renameOutcome, updateEdge, updateNode, withLayout,
} from './process-model';

type Source = 'draft' | 'published' | 'new';
type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null;

@Component({
  selector: 'app-process-designer',
  imports: [EdgeProperties, NodeProperties, ProcessCanvas, RouterLink],
  providers: [FormCatalog],
  templateUrl: './process-designer.html',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class ProcessDesignerPage {
  private readonly api = inject(ProcessDefinitionsApi);
  private readonly catalog = inject(FormCatalog);
  private readonly toasts = inject(ToastService);

  /** Route parameter :key. */
  readonly key = input.required<string>();
  /** Query parameter ?name= for a brand-new process. */
  readonly name = input<string | undefined>(undefined);

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly source = signal<Source>('new');
  protected readonly copiedVersion = signal<number | null>(null);
  protected readonly processName = signal('');
  protected readonly graph = signal<ProcessGraph>(emptyGraph());
  private readonly savedSnapshot = signal<string | null>(null);
  protected readonly selection = signal<Selection>(null);
  protected readonly problems = signal<ValidationProblem[] | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal<'save' | 'check' | 'publish' | null>(null);

  private readonly snapshot = computed(() => JSON.stringify({ name: this.processName(), graph: this.graph() }));
  protected readonly palette = computed(() => paletteFor(this.graph()));
  protected readonly selectedNode = computed(() => {
    const s = this.selection();
    return s?.kind === 'node' ? this.graph().nodes.find((n) => n.id === s.id) ?? null : null;
  });
  protected readonly selectedOutgoing = computed(() => {
    const id = this.selectedNode()?.id;
    return id ? this.graph().edges.filter((e) => e.source === id) : [];
  });
  protected readonly selectedIncoming = computed(() => {
    const id = this.selectedNode()?.id;
    return id ? this.graph().edges.filter((e) => e.target === id) : [];
  });
  protected readonly nodeNames = computed(() => Object.fromEntries(this.graph().nodes.map((n) => [n.id, n.name])));
  protected readonly selectedEdge = computed(() => {
    const s = this.selection();
    return s?.kind === 'edge' ? this.graph().edges.find((e) => e.id === s.id) ?? null : null;
  });
  protected readonly problemNodes = computed(() => problemNodeIds(this.problems()));
  /** Published forms the process uses, as far as they have loaded; their fields feed rules and variable pickers. */
  private readonly usedForms = computed(() => this.graph().nodes.flatMap((n): PublishedForm[] => {
    if (!n.form) {
      return [];
    }
    const form = this.catalog.form(n.form.key, n.form.version)();
    return typeof form === 'object' ? [form] : [];
  }));
  protected readonly ruleFields = computed(() => processConditionVariables(this.graph(), this.usedForms()));
  protected readonly userVariables = computed(() => variablesOfType(this.usedForms(), ['user']));
  protected readonly dateVariables = computed(() => variablesOfType(this.usedForms(), ['date', 'datetime']));

  constructor() {
    effect(() => {
      const key = this.key();
      untracked(() => this.load(key));
    });
  }

  hasUnsavedChanges(): boolean {
    return this.state() === 'ready' && this.snapshot() !== this.savedSnapshot();
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  // ---- loading

  protected load(key: string): void {
    this.state.set('loading');
    this.api.draft(key, true).subscribe({
      next: (draft) => this.loaded(draft.name, draft.graph, 'draft', null),
      error: (error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 404) {
          this.state.set('failed');
          return;
        }
        this.api.list().subscribe({
          next: (all) => {
            const latest = all.find((p) => p.key === key)?.latestVersion;
            if (!latest) {
              this.loaded(this.name() ?? key, emptyGraph(), 'new', null);
              return;
            }
            this.api.version(key, latest, true).subscribe({
              next: (published) => this.loaded(published.name, published.graph, 'published', latest),
              error: () => this.state.set('failed'),
            });
          },
          error: () => this.state.set('failed'),
        });
      },
    });
  }

  private loaded(name: string, graph: ProcessGraph, source: Source, version: number | null): void {
    this.processName.set(name);
    this.graph.set(withLayout(graph));
    this.source.set(source);
    this.copiedVersion.set(version);
    this.selection.set(null);
    this.problems.set(null);
    this.notice.set(null);
    this.savedSnapshot.set(source === 'draft' ? this.snapshot() : null);
    this.state.set('ready');
  }

  // ---- editing

  protected add(type: NodeType): void {
    const { graph, id } = addNode(this.graph(), type);
    this.graph.set(graph);
    this.selection.set({ kind: 'node', id });
    this.notice.set(null);
  }

  protected onConnected(connection: Connection): void {
    this.applyEdge(connect(this.graph(), connection.source, connection.target));
  }

  protected onReconnected(change: Reconnection): void {
    this.applyEdge(reconnect(this.graph(), change.edgeId, change.end, change.nodeId));
  }

  private applyEdge(result: EdgeResult): void {
    if ('refused' in result) {
      this.notice.set(`${result.refused}.`);
      return;
    }
    this.graph.set(result.graph);
    this.selection.set({ kind: 'edge', id: result.edgeId });
    this.notice.set(null);
  }

  protected onMoved(moves: NodeMove[]): void {
    this.graph.set(moveNodes(this.graph(), moves));
  }

  protected select(selection: Selection): void {
    this.selection.set(selection);
  }

  protected openEdge(id: string): void {
    this.selection.set({ kind: 'edge', id });
  }

  protected openNode(id: string): void {
    this.selection.set({ kind: 'node', id });
  }

  protected patchNode(patch: Partial<ProcessNode>): void {
    const node = this.selectedNode();
    if (node) {
      this.graph.set(updateNode(this.graph(), node.id, patch));
    }
  }

  protected addOutcome(name: string): void {
    const node = this.selectedNode();
    if (node) {
      this.applyOutcome(addOutcome(this.graph(), node.id, name));
    }
  }

  protected renameOutcome(change: { from: string; to: string }): void {
    const node = this.selectedNode();
    if (node) {
      this.applyOutcome(renameOutcome(this.graph(), node.id, change.from, change.to));
    }
  }

  protected removeOutcome(name: string): void {
    const node = this.selectedNode();
    if (!node) {
      return;
    }
    const { graph, unboundFlows } = removeOutcome(this.graph(), node.id, name);
    this.graph.set(graph);
    this.notice.set(unboundFlows
      ? `${unboundFlows} flow${unboundFlows === 1 ? '' : 's'} no longer ${unboundFlows === 1 ? 'has an outcome' : 'have an outcome'}; choose one for ${unboundFlows === 1 ? 'it' : 'them'}.`
      : null);
  }

  private applyOutcome(result: OutcomeResult): void {
    if ('refused' in result) {
      this.notice.set(`${result.refused}.`);
      return;
    }
    this.graph.set(result.graph);
    this.notice.set(null);
  }

  protected removeSelectedNode(): void {
    const node = this.selectedNode();
    if (node) {
      this.graph.set(removeNode(this.graph(), node.id));
      this.selection.set(null);
    }
  }

  protected patchEdge(patch: EdgePatch): void {
    const edge = this.selectedEdge();
    if (edge) {
      this.graph.set(updateEdge(this.graph(), edge.id, patch));
    }
  }

  /** A flow changed from its source step's panel, such as a decision's condition setters. */
  protected patchEdgeById(change: { id: string; patch: EdgePatch }): void {
    this.graph.set(updateEdge(this.graph(), change.id, change.patch));
  }

  protected removeSelectedEdge(): void {
    const edge = this.selectedEdge();
    if (edge) {
      this.graph.set(removeEdge(this.graph(), edge.id));
      this.selection.set(null);
    }
  }

  protected nodeById(id: string): ProcessNode | null {
    return this.graph().nodes.find((n) => n.id === id) ?? null;
  }

  protected edgeSource(edge: ProcessEdge): ProcessNode | null {
    return this.nodeById(edge.source);
  }

  protected edgeTarget(edge: ProcessEdge): ProcessNode | null {
    return this.nodeById(edge.target);
  }

  protected selectProblem(problem: ValidationProblem): void {
    if (problem.nodeId && this.nodeById(problem.nodeId)) {
      this.selection.set({ kind: 'node', id: problem.nodeId });
    }
  }

  // ---- saving, checking, publishing

  protected save(): void {
    this.run('save', this.saveIfNeeded(true), () => this.toasts.success('Draft saved'));
  }

  protected check(): void {
    this.run('check', this.saveIfNeeded(false).pipe(concatMap(() => this.api.validate(this.key()))), (report) => {
      this.problems.set(report.errors);
      if (report.valid) {
        this.toasts.success('No problems found');
      }
    });
  }

  protected publish(): void {
    this.run('publish', this.saveIfNeeded(false).pipe(concatMap(() => this.api.publish(this.key()))), (published) => {
      this.problems.set([]);
      this.source.set('draft');
      this.toasts.success(`Published version ${published.version}`);
    });
  }

  private saveIfNeeded(always: boolean): Observable<unknown> {
    if (!always && !this.hasUnsavedChanges()) {
      return of(null);
    }
    const sent = this.snapshot();
    return this.api.saveDraft(this.key(), this.processName().trim() || this.key(), this.graph()).pipe(map(() => {
      this.savedSnapshot.set(sent);
      this.source.set('draft');
      return null;
    }));
  }

  private run<T>(kind: 'save' | 'check' | 'publish', work: Observable<T>, done: (result: T) => void): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(kind);
    work.subscribe({
      next: (result) => {
        this.busy.set(null);
        done(result);
      },
      error: (error: unknown) => {
        this.busy.set(null);
        const body = error instanceof HttpErrorResponse ? (error.error as { code?: string; errors?: ValidationProblem[] }) : null;
        if (body?.code === 'WF_DEFINITION_INVALID' && Array.isArray(body.errors)) {
          this.problems.set(body.errors);
        }
      },
    });
  }
}
