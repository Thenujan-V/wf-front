import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { FormFieldView } from '../../../core/forms/form-field';
import { MAX_COLUMNS, effectiveSpan, gridClass, layoutOf, spanClass } from '../../../core/forms/form-layout';
import { FieldError, FieldType, FormDefinition, FormField } from '../../../core/forms/form.models';
import { RuleProblem, fieldKeyOf, typeLabel } from './builder-model';

/** What is being dragged: a field type from the palette, or a field already on the canvas. */
export type DragData = { type: FieldType } | { key: string };

/** The space between a grid's columns, in px (Tailwind's gap-4). */
const GAP = 16;

/** The width, in columns, of a field whose right edge is `offset` px from its left edge. */
export function spanAt(offset: number, gridWidth: number, columns: number, gap: number): number {
  const column = (gridWidth - gap * (columns - 1)) / columns;
  if (!(column > 0)) {
    return 1;
  }
  return Math.min(Math.max(Math.round((offset + gap) / (column + gap)), 1), columns);
}

interface Resize {
  key: string;
  /** The width the pointer is on now. */
  span: number;
  /** The width the field had when the drag began. */
  from: number;
  columns: number;
  /** The field's left edge and its grid's width, in px. */
  left: number;
  gridWidth: number;
}

/**
 * The form as it will look, for arranging: every field is drawn with its real control, which cannot be changed here.
 * The canvas only reports what the designer did; the editor decides what that does to the form.
 */
@Component({
  selector: 'app-design-canvas',
  imports: [CdkDrag, CdkDragHandle, CdkDropList, FormFieldView],
  templateUrl: './design-canvas.html',
})
export class DesignCanvas {
  readonly definition = input.required<FormDefinition>();
  readonly selected = input<string | null>(null);
  /** The section the palette's buttons add to. */
  readonly targetSection = input<string | undefined>(undefined);
  readonly ruleIssues = input<RuleProblem[]>([]);
  readonly problems = input<FieldError[]>([]);

  readonly fieldSelect = output<string>();
  readonly fieldMove = output<{ key: string; direction: -1 | 1 }>();
  readonly fieldRemove = output<string>();
  readonly sectionPick = output<string>();
  readonly sectionRename = output<{ id: string; title: string }>();
  readonly sectionColumns = output<{ id: string; columns: number }>();
  readonly sectionRemove = output<string>();
  readonly sectionAdd = output<void>();
  readonly fieldAdd = output<{ type: FieldType; section: string; index: number }>();
  readonly fieldPlace = output<{ key: string; section: string; index: number }>();
  readonly fieldSpan = output<{ key: string; span: number }>();

  private readonly document = inject(DOCUMENT);
  /** A width being dragged; the field is drawn at that width until the pointer is released. */
  private readonly resizing = signal<Resize | null>(null);
  private stopListening: (() => void) | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopListening?.());
  }

  protected readonly sections = computed(() => layoutOf(this.definition()));
  protected readonly columnChoices = Array.from({ length: MAX_COLUMNS }, (_, i) => i + 1);
  protected readonly gridClass = gridClass;
  protected readonly typeLabel = typeLabel;

  protected spanClass(field: FormField, columns: number): string {
    const resizing = this.resizing();
    return spanClass(resizing?.key === field.key ? resizing.span : effectiveSpan(field, columns));
  }

  protected ruleIssue(key: string): string | undefined {
    return this.ruleIssues().find((p) => p.key === key)?.message;
  }

  protected problemCount(key: string): number {
    return this.problems().filter((p) => fieldKeyOf(p.field) === key).length;
  }

  /** Something was dropped on a section's grid; '' is the group of fields in no section. */
  protected dropped(event: CdkDragDrop<string, unknown, DragData>, section: string): void {
    const data = event.item.data;
    if ('type' in data) {
      this.fieldAdd.emit({ type: data.type, section, index: event.currentIndex });
    } else if (event.previousContainer !== event.container || event.previousIndex !== event.currentIndex) {
      this.fieldPlace.emit({ key: data.key, section, index: event.currentIndex });
    }
  }

  /** The pointer went down on a field's resize handle. */
  protected startResize(event: PointerEvent, field: FormField, columns: number): void {
    const tile = (event.target as HTMLElement).closest('[data-testid="canvas-field"]') as HTMLElement | null;
    const grid = tile?.parentElement;
    if (!tile || !grid) {
      return;
    }
    event.preventDefault();
    const span = effectiveSpan(field, columns);
    this.resizing.set({
      key: field.key, span, from: span, columns,
      left: tile.getBoundingClientRect().left, gridWidth: grid.getBoundingClientRect().width,
    });
    // The pointer leaves the handle as soon as it moves, so the document is what hears the rest.
    const move = (e: Event) => this.resizeTo((e as PointerEvent).clientX);
    const release = () => this.endResize(true);
    const cancel = () => this.endResize(false);
    this.document.addEventListener('pointermove', move);
    this.document.addEventListener('pointerup', release);
    this.document.addEventListener('pointercancel', cancel);
    this.stopListening = () => {
      this.document.removeEventListener('pointermove', move);
      this.document.removeEventListener('pointerup', release);
      this.document.removeEventListener('pointercancel', cancel);
      this.stopListening = null;
    };
  }

  private resizeTo(clientX: number): void {
    const resizing = this.resizing();
    if (!resizing) {
      return;
    }
    const span = spanAt(clientX - resizing.left, resizing.gridWidth, resizing.columns, GAP);
    if (span !== resizing.span) {
      this.resizing.set({ ...resizing, span });
    }
  }

  private endResize(keep: boolean): void {
    const resizing = this.resizing();
    this.stopListening?.();
    this.resizing.set(null);
    if (keep && resizing && resizing.span !== resizing.from) {
      this.fieldSpan.emit({ key: resizing.key, span: resizing.span });
    }
  }
}
