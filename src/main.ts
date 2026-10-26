import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { createAppConfig } from './app/app.config';
import { loadRuntimeConfig } from './app/core/config/runtime-config';

loadRuntimeConfig()
  .then((runtime) => bootstrapApplication(App, createAppConfig(runtime)))
  .catch((err: unknown) => {
    console.error(err);
    document.body.textContent = 'The application could not start: its configuration is missing or invalid.';
  });
