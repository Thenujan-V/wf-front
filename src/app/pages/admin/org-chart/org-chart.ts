import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Subscription, forkJoin } from 'rxjs';
import { UserSummary } from '../../../core/identity/identity.models';
import { OrgApi, OrgSettings, UserPage } from '../../../core/identity/org.api';
import { UserPicker } from '../../../core/identity/user-picker';
import { ToastService } from '../../../core/ui/toast.service';

function clean(text: string): string | null {
  return text.trim() || null;
}

/**
 * Spec §7/§9 admin/org-chart: who reports to whom, and each person's department and position. A field this instance
 * takes from Keycloak is shown but cannot be changed here.
 */
@Component({
  selector: 'app-org-chart',
  imports: [UserPicker],
  templateUrl: './org-chart.html',
})
export class OrgChartPage {
  private readonly api = inject(OrgApi);
  private readonly toasts = inject(ToastService);

  protected readonly settings = signal<OrgSettings | null>(null);
  /** Until the settings are known the page cannot say which fields may be changed, so it shows no editor. */
  protected readonly settingsState = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly editable = computed(() => {
    const s = this.settings();
    return { manager: s?.manager === 'LOCAL', department: s?.department === 'LOCAL', position: s?.position === 'LOCAL' };
  });
  protected readonly anyEditable = computed(() => {
    const e = this.editable();
    return e.manager || e.department || e.position;
  });

  protected readonly search = signal('');
  protected readonly page = signal(0);
  protected readonly listState = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly people = signal<UserPage | null>(null);
  protected readonly pages = computed(() => {
    const p = this.people();
    return p ? Math.max(1, Math.ceil(p.total / p.size)) : 1;
  });

  protected readonly selected = signal<UserSummary | null>(null);
  protected readonly detailState = signal<'loading' | 'ready' | 'failed'>('loading');
  /** The chain above the chosen person, top first. */
  protected readonly chain = signal<UserSummary[]>([]);
  protected readonly reports = signal<UserSummary[]>([]);
  /** How many report to the chosen person; more than are listed when the list was cut. */
  protected readonly reportsTotal = signal(0);

  /** What the form holds; saved together. */
  protected readonly manager = signal<UserSummary | null>(null);
  protected readonly department = signal('');
  protected readonly position = signal('');
  protected readonly picking = signal(false);
  protected readonly saving = signal(false);
  protected readonly dirty = computed(() => {
    const person = this.selected();
    return person !== null && this.detailState() === 'ready' && ((this.manager()?.id ?? null) !== person.managerId
      || clean(this.department()) !== (person.department ?? null) || clean(this.position()) !== (person.position ?? null));
  });

  /** Requests in flight; a newer one replaces it, so a slow answer never overwrites a later search or choice. */
  private peopleRequest: Subscription | null = null;
  private detailRequest: Subscription | null = null;

  constructor() {
    this.loadSettings();
    this.loadPeople();
    inject(DestroyRef).onDestroy(() => {
      this.peopleRequest?.unsubscribe();
      this.detailRequest?.unsubscribe();
    });
  }

  protected loadSettings(): void {
    this.settingsState.set('loading');
    this.api.settings(true).subscribe({
      next: (s) => {
        this.settings.set(s);
        this.settingsState.set('ready');
      },
      error: () => this.settingsState.set('failed'),
    });
  }

  /** For the route's unsaved-changes guard. */
  hasUnsavedChanges(): boolean {
    return this.dirty();
  }

  protected find(): void {
    this.page.set(0);
    this.loadPeople();
  }

  protected go(delta: number): void {
    this.page.update((p) => Math.min(Math.max(0, p + delta), this.pages() - 1));
    this.loadPeople();
  }

  protected loadPeople(): void {
    this.peopleRequest?.unsubscribe();
    this.peopleRequest = this.api.people(this.search(), this.page(), true).subscribe({
      next: (p) => {
        this.people.set(p);
        this.listState.set('ready');
      },
      error: () => this.listState.set('failed'),
    });
  }

  /** Choosing someone else leaves the form: unsaved changes are not thrown away without asking. */
  protected choose(person: UserSummary): void {
    const current = this.selected();
    if (current && current.id !== person.id && this.dirty()
      && !window.confirm(`Discard the changes to ${current.displayName || current.username}?`)) {
      return;
    }
    this.show(person);
  }

  private show(person: UserSummary): void {
    this.selected.set(person);
    this.department.set(person.department ?? '');
    this.position.set(person.position ?? '');
    this.manager.set(null);
    this.picking.set(false);
    this.detailState.set('loading');
    this.detailRequest?.unsubscribe();
    this.detailRequest = forkJoin({ managers: this.api.managers(person.id, true), reports: this.api.reports(person.id, true) }).subscribe({
      next: ({ managers, reports }) => {
        this.chain.set([...managers].reverse());
        this.reports.set(reports.items);
        this.reportsTotal.set(reports.total);
        this.manager.set(managers[0] ?? null);
        this.detailState.set('ready');
      },
      error: () => this.detailState.set('failed'),
    });
  }

  protected pick(manager: UserSummary): void {
    this.manager.set(manager);
    this.picking.set(false);
  }

  protected save(): void {
    const person = this.selected();
    if (!person || this.saving() || !this.dirty()) {
      return;
    }
    this.saving.set(true);
    this.api.update(person.id, {
      managerId: this.manager()?.id ?? null,
      department: clean(this.department()),
      position: clean(this.position()),
    }).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.toasts.success(`${person.displayName || person.username} is updated.`);
        this.show(updated);
        this.loadPeople();
      },
      // The failure has been shown as a toast; what was chosen stays, so it can be changed and tried again.
      error: () => this.saving.set(false),
    });
  }
}
