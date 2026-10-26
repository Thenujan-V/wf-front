import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden',
  imports: [RouterLink],
  template: `
    <section class="mx-auto max-w-2xl py-16 text-center">
      <h1 class="text-2xl font-semibold tracking-tight">You don't have access to this page</h1>
      <p class="mt-2 text-muted">Ask an administrator if you need it.</p>
      <a routerLink="/inbox" class="mt-6 inline-block text-sm font-medium text-accent-text hover:underline">Go to your inbox</a>
    </section>
  `,
})
export class ForbiddenPage {}
