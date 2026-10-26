import { CdkDrag, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, concatMap, map, of } from 'rxjs';
import { FormRenderer } from '../../../core/forms/form-renderer';
import { FieldError, FieldType, FormDefinition, FormField } from '../../../core/forms/form.models';
import { FormsAdminApi } from '../../../core/forms/forms-admin.api';
import { FormsApi } from '../../../core/forms/forms.api';
import { ToastService } from '../../../core/ui/toast.service';
import {
  FIELD_TYPES, addField, addFieldAt, placeField, addSection, emptyDefinition, fieldKeyOf, moveField, newRuleProblems, removeField, removeSection,
  ruleProblems, setSection, setSpan, updateField, updateOptions, updateSection,
} from './builder-model';
import { DesignCanvas } from './design-canvas';
import { FieldProperties } from './field-properties';

type Source = 'draft' | 'published' | 'new';

@Component({
  selector: 'app-form-editor',
  imports: [CdkDrag, CdkDropList, CdkDropListGroup, DesignCanvas, FieldProperties, FormRenderer, RouterLink],
  templateUrl: './form-editor.html',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class FormEditorPage {
  private readonly api = inject(FormsAdminApi);
  private readonly forms = inject(FormsApi);
  private readonly toasts = inject(ToastService);

  /** Route parameter :key. */
  readonly key = input.required<string>();
  /** Query parameter ?name= for a brand-new form. */
  readonly name = input<string | undefined>(undefined);

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly source = signal<Source>('new');
  protected readonly copiedVersion = signal<number | null>(null);
  protected readonly formName = signal('');
  protected readonly definition = signal<FormDefinition>(emptyDefinition());
  private readonly savedSnapshot = signal<string | null>(null);
  protected readonly selected = signal<string | null>(null);
  /** A section the person picked for new fields; null while the selected field decides. */
  private readonly pickedSection = signal<string | null>(null);
  protected readonly problems = signal<FieldError[] | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal<'save' | 'check' | 'publish' | null>(null);
  protected readonly preview = signal(false);

  protected readonly palette = FIELD_TYPES;
  /** The palette is only a source: nothing can be dropped on it. */
  protected readonly nothingDropsHere = () => false;
  private readonly snapshot = computed(() => JSON.stringify({ name: this.formName(), definition: this.definition() }));
  protected readonly selectedField = computed(() => this.definition().fields.find((f) => f.key === this.selected()) ?? null);
  /** Where the palette puts a new field: the picked section, else the selected field's, else the first one. */
  protected readonly targetSection = computed(() => {
    const sections = this.definition().sections ?? [];
    const picked = this.pickedSection();
    if (picked && sections.some((s) => s.id === picked)) {
      return picked;
    }
    const field = this.selectedField();
    return field ? field.section : sections[0]?.id;
  });
  protected readonly ruleIssues = computed(() => ruleProblems(this.definition()));
  protected readonly problemList = computed(() => this.problems() ?? []);

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

  private load(key: string): void {
    this.state.set('loading');
    this.api.draft(key, true).subscribe({
      next: (draft) => this.loaded(draft.name, draft.definition, 'draft', null),
      error: (error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 404) {
          this.state.set('failed');
          return;
        }
        this.api.versions(key, true).subscribe({
          next: (versions) => {
            if (!versions.length) {
              this.loaded(this.name() ?? key, emptyDefinition(), 'new', null);
              return;
            }
            const latest = versions[0].version;
            this.forms.version(key, latest, true).subscribe({
              next: (form) => this.loaded(form.name, form.definition, 'published', latest),
              error: () => this.state.set('failed'),
            });
          },
          error: () => this.state.set('failed'),
        });
      },
    });
  }

  private loaded(name: string, definition: FormDefinition, source: Source, version: number | null): void {
    this.formName.set(name);
    this.definition.set(definition);
    this.source.set(source);
    this.copiedVersion.set(version);
    this.selected.set(null);
    this.pickedSection.set(null);
    this.problems.set(null);
    this.savedSnapshot.set(source === 'draft' ? this.snapshot() : null);
    this.state.set('ready');
  }

  // ---- editing

  protected add(type: FieldType): void {
    this.added(addField(this.definition(), type, this.targetSection()));
  }

  /**
   * Takes a new field into the form. Adding puts every field in the order it is drawn; in a form stored in another
   * order that could leave a rule above the field it uses, so such an add is refused like a move would be.
   */
  private added(result: { definition: FormDefinition; key: string }): void {
    if (this.accept(this.definition(), result.definition, "Can't add it there")) {
      this.definition.set(result.definition);
      this.select(result.key);
    }
  }

  /** A palette item was dropped on the canvas. */
  protected addAt(type: FieldType, section: string, index: number): void {
    this.added(addFieldAt(this.definition(), type, section, index));
  }

  /** A field was dropped somewhere else on the canvas. */
  protected place(key: string, section: string, index: number): void {
    const next = placeField(this.definition(), key, section, index);
    if (this.accept(this.definition(), next, "Can't move it there")) {
      this.definition.set(next);
      this.select(key);
    }
  }

  /** A field's edge was dragged to a new width on the canvas. */
  protected resize(key: string, span: number): void {
    this.definition.set(setSpan(this.definition(), key, span));
  }

  /** Selects a field; new fields then follow it into its section. */
  protected select(key: string): void {
    this.selected.set(key);
    this.pickedSection.set(null);
  }

  /** Makes a section the one new fields go to, which is the only way to reach one that has no field to select. */
  protected pickSection(id: string): void {
    this.pickedSection.set(id);
    this.selected.set(null);
  }

  protected update(patch: Partial<FormField>): void {
    const key = this.selected();
    if (!key) {
      return;
    }
    const before = this.definition();
    let next = before;
    if ('section' in patch) {
      next = setSection(next, key, patch.section);
      patch = { ...patch };
      delete patch.section;
      if (!this.accept(before, next, "Can't move it to that section")) {
        return;
      }
    }
    if ('span' in patch) {
      next = setSpan(next, key, patch.span ?? 1);
      patch = { ...patch };
      delete patch.span;
    }
    if ('options' in patch) {
      const changed = updateOptions(next, key, patch.options);
      next = changed.definition;
      patch = { ...patch };
      delete patch.options;
      this.notice.set(changed.clearedRulesOf.length
        ? `Removed the rules of ${changed.clearedRulesOf.join(', ')} that used that option.` : null);
    }
    this.definition.set(Object.keys(patch).length ? updateField(next, key, patch) : next);
    if (patch.key) {
      this.selected.set(patch.key);
    }
  }

  /** Applies a structural edit only if it breaks no rule; otherwise says which rule it would break. */
  private accept(before: FormDefinition, after: FormDefinition, refusal: string): boolean {
    const broken = newRuleProblems(before, after);
    if (broken.length) {
      this.notice.set(`${refusal}: ${broken[0]}.`);
      return false;
    }
    return true;
  }

  protected move(key: string, direction: -1 | 1): void {
    const next = moveField(this.definition(), key, direction);
    if (this.accept(this.definition(), next, "Can't move it there")) {
      this.definition.set(next);
    }
  }

  protected remove(key: string): void {
    const { definition, clearedRulesOf } = removeField(this.definition(), key);
    this.definition.set(definition);
    if (this.selected() === key) {
      this.selected.set(null);
    }
    this.notice.set(clearedRulesOf.length ? `Removed the rules of ${clearedRulesOf.join(', ')} that used this field.` : null);
  }

  protected newSection(): void {
    const { definition, id } = addSection(this.definition());
    this.definition.set(definition);
    this.pickSection(id);
  }

  protected renameSection(id: string, title: string): void {
    this.definition.set(updateSection(this.definition(), id, { title }));
  }

  protected setColumns(id: string, columns: number): void {
    this.definition.set(updateSection(this.definition(), id, { columns }));
  }

  protected dropSection(id: string): void {
    const next = removeSection(this.definition(), id);
    if (this.accept(this.definition(), next, "Can't remove that section yet")) {
      this.definition.set(next);
    }
  }

  protected selectProblem(problem: FieldError): void {
    const key = fieldKeyOf(problem.field);
    if (key && this.definition().fields.some((f) => f.key === key)) {
      this.select(key);
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
    return this.api.saveDraft(this.key(), this.formName().trim() || this.key(), this.definition()).pipe(map(() => {
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
        const body = error instanceof HttpErrorResponse ? (error.error as { code?: string; errors?: FieldError[] }) : null;
        if (body?.code === 'FORM_DEFINITION_INVALID' && Array.isArray(body.errors)) {
          this.problems.set(body.errors);
        }
      },
    });
  }
}
