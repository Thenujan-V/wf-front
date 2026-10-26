import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideOAuthClient } from 'angular-oauth2-oidc';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { RUNTIME_CONFIG, RuntimeConfig } from './core/config/runtime-config';
import { authInterceptor } from './core/http/auth.interceptor';
import { correlationIdInterceptor } from './core/http/correlation-id.interceptor';
import { problemInterceptor } from './core/http/problem.interceptor';

export function createAppConfig(runtime: RuntimeConfig): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      { provide: RUNTIME_CONFIG, useValue: runtime },
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([correlationIdInterceptor, authInterceptor, problemInterceptor])),
      provideOAuthClient(),
      provideAppInitializer(() => inject(AuthService).init()),
    ],
  };
}
