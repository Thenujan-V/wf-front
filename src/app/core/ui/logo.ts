import { Component, input } from '@angular/core';

/** The mark and the name. The gradient is the brand's own and is the same in both themes. */
@Component({
  selector: 'app-logo',
  host: { class: 'flex items-center gap-2.5' },
  template: `
    <span class="grid size-7 shrink-0 place-items-center rounded-md text-sm font-bold text-on-solid" aria-hidden="true"
          style="background-image: linear-gradient(135deg, #fb923c, #ea580c)">A</span>
    @if (!compact()) {
      <span class="whitespace-nowrap text-[0.95rem] font-bold tracking-tight text-ink">Auradot <span class="font-medium text-muted">Workflow</span></span>
    }
  `,
})
export class Logo {
  /** The mark alone, where there is no room for the name (the header on a phone; the name is in the menu). */
  readonly compact = input(false);
}
