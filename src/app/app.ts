import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHost } from './core/ui/toast-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost],
  templateUrl: './app.html',
})
export class App {}
