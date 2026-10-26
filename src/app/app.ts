import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EmbedService } from './core/embed/embed.service';
import { ToastHost } from './core/ui/toast-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost],
  templateUrl: './app.html',
})
export class App {
  constructor() {
    inject(EmbedService).start();
  }
}
