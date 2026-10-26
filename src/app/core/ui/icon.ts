import { Component, computed, input } from '@angular/core';
import { ICONS, IconName, IconNode } from './icons';

/**
 * One line icon. It is as large as the text around it (1em); size it with text-… or size-… utilities. Decoration by
 * default: give it a label only when it stands alone and carries the meaning.
 */
@Component({
  selector: 'app-icon',
  host: { class: 'inline-flex shrink-0', style: 'width: 1em; height: 1em' },
  template: `
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.9"
         stroke-linecap="round" stroke-linejoin="round"
         [attr.aria-hidden]="label() ? null : 'true'" [attr.role]="label() ? 'img' : null" [attr.aria-label]="label() || null">
      @for (node of nodes(); track $index) {
        @switch (node[0]) {
          @case ('path') { <path [attr.d]="node[1]['d']" /> }
          @case ('circle') { <circle [attr.cx]="node[1]['cx']" [attr.cy]="node[1]['cy']" [attr.r]="node[1]['r']" /> }
          @case ('line') { <line [attr.x1]="node[1]['x1']" [attr.y1]="node[1]['y1']" [attr.x2]="node[1]['x2']" [attr.y2]="node[1]['y2']" /> }
          @case ('polyline') { <polyline [attr.points]="node[1]['points']" /> }
          @case ('polygon') { <polygon [attr.points]="node[1]['points']" /> }
          @case ('rect') {
            <rect [attr.x]="node[1]['x']" [attr.y]="node[1]['y']" [attr.width]="node[1]['width']" [attr.height]="node[1]['height']"
                  [attr.rx]="node[1]['rx']" [attr.ry]="node[1]['ry']" />
          }
          @case ('ellipse') { <ellipse [attr.cx]="node[1]['cx']" [attr.cy]="node[1]['cy']" [attr.rx]="node[1]['rx']" [attr.ry]="node[1]['ry']" /> }
        }
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  /** Set only when the icon stands alone and carries the meaning. */
  readonly label = input<string>();
  protected readonly nodes = computed<readonly IconNode[]>(() => ICONS[this.name()]);
}
