import { Component, input } from '@angular/core';

/** Stands in for the attachments panel in specs that check every HTTP call the page makes. */
@Component({ selector: 'app-attachments', template: '' })
export class AttachmentsStub {
  readonly instanceId = input<string>();
}
