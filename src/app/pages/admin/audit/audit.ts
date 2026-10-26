import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuditDetail, auditDetails } from '../../../core/audit/audit-details';
import { AuditApi } from '../../../core/audit/audit.api';
import { AuditEntry, AuditQuery, AuditResults } from '../../../core/audit/audit.models';
import { UserSummary } from '../../../core/identity/identity.models';
import { UserName } from '../../../core/identity/user-name';
import { UserPicker } from '../../../core/identity/user-picker';

const ENTITY_TYPES = [
  { value: '', label: 'Anything' },
  { value: 'INSTANCE', label: 'Request' },
  { value: 'TASK', label: 'Task' },
  { value: 'DOCUMENT', label: 'Document' },
  { value: 'JOB', label: 'Background job' },
];

/** Spec §8/§9 admin audit viewer: the append-only log, filtered by person, entity and period. */
@Component({
  selector: 'app-audit',
  imports: [DatePipe, RouterLink, UserName, UserPicker],
  templateUrl: './audit.html',
})
export class AuditPage {
  private readonly api = inject(AuditApi);

  protected readonly entityTypes = ENTITY_TYPES;
  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly results = signal<AuditResults | null>(null);
  protected readonly actor = signal<UserSummary | null>(null);
  protected readonly entityType = signal('');
  protected readonly entityId = signal('');
  /** Whole days (yyyy-mm-dd) in the reader's time zone; both ends are included. */
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly opened = signal<number | null>(null);
  /** The open entry's recorded event, in words. */
  protected readonly details = computed<AuditDetail[]>(() => {
    const entry = this.results()?.items.find((e) => e.id === this.opened());
    return entry ? auditDetails(entry) : [];
  });
  /** Whether the open entry also shows the event exactly as it was recorded. */
  protected readonly raw = signal(false);
  protected readonly rangeError = computed(() =>
    this.from() && this.to() && this.from() > this.to() ? 'The start date must not be after the end date.' : null);
  protected readonly pages = computed(() => {
    const r = this.results();
    return r ? Math.max(1, Math.ceil(r.total / r.size)) : 1;
  });

  /** Answers to an earlier search are ignored. */
  private run = 0;
  private lastPage = 0;

  constructor() {
    this.search();
  }

  protected search(page = 0): void {
    if (this.rangeError()) {
      return;
    }
    const run = ++this.run;
    this.lastPage = page;
    this.state.set('loading');
    this.opened.set(null);
    this.api.entries(this.query(page), true).subscribe({
      next: (results) => {
        if (run === this.run) {
          this.results.set(results);
          this.state.set('ready');
        }
      },
      error: () => run === this.run && this.state.set('failed'),
    });
  }

  protected retry(): void {
    this.search(this.lastPage);
  }

  protected toggle(entry: AuditEntry): void {
    this.opened.set(this.opened() === entry.id ? null : entry.id);
    this.raw.set(false);
  }

  /** "workflow.task.completed" → "Task completed"; "document.version.uploaded" → "Document version uploaded". */
  protected label(action: string): string {
    const parts = action.split('.');
    const words = (parts[0] === 'workflow' ? parts.slice(1) : parts).join(' ');
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : action;
  }

  /** "TASK" → "Task"; a kind the page does not know keeps the name it was recorded under. */
  protected about(entityType: string): string {
    return ENTITY_TYPES.find((t) => t.value === entityType)?.label ?? entityType;
  }

  /** Where the thing an entry is about can be opened, if anywhere. */
  protected link(entry: AuditEntry): string[] | null {
    if (entry.entityType === 'DOCUMENT' && entry.entityId) {
      return ['/documents', entry.entityId];
    }
    const instanceId = entry.data['instanceId'];
    return typeof instanceId === 'string' && instanceId ? ['/requests', instanceId] : null;
  }

  protected json(entry: AuditEntry): string {
    return JSON.stringify(entry.data, null, 2);
  }

  private query(page: number): AuditQuery {
    const query: AuditQuery = { page };
    const actor = this.actor();
    if (actor) {
      query.actor = actor.id;
    }
    if (this.entityType()) {
      query.entityType = this.entityType();
    }
    if (this.entityId().trim()) {
      query.entityId = this.entityId().trim();
    }
    if (this.from()) {
      query.from = startOfDay(this.from(), 0).toISOString();
    }
    if (this.to()) {
      query.to = startOfDay(this.to(), 1).toISOString(); // the end day is included: up to the start of the next one
    }
    return query;
  }
}

/** Local midnight of a yyyy-mm-dd date, plus whole days. */
function startOfDay(date: string, plusDays: number): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day + plusDays);
}
