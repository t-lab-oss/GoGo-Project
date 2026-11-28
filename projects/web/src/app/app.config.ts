import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { OUTBOX_SENDER } from './core/offline/outbox.sender';
import { TripOutboxSender } from './features/trip-mode/offline/trip-outbox.sender';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: OUTBOX_SENDER, useExisting: TripOutboxSender },
    // Chỉ bật ở bản build: lưu giao diện để mở lại được khi mất mạng.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:10000',
    }),
    // Khôi phục phiên từ cookie trước khi router chạy guard.
    provideAppInitializer(() => inject(AuthService).restoreSession()),
  ],
};
