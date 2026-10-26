import { Component, computed, inject, input } from '@angular/core';
import { UserDirectory } from './user-directory';

@Component({
  selector: 'app-user-name',
  template: `{{ name() }}`,
})
export class UserName {
  private readonly directory = inject(UserDirectory);
  readonly userId = input<string | null>(null);
  protected readonly name = computed(() => this.directory.name(this.userId())());
}
