import { ErrorHandler, inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  RouteReuseStrategy,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { registerIcons } from './app/icons';
import { AppErrorHandler, initCrashReporting } from './app/core/crash.service';
import { AnalyticsService } from './app/core/analytics.service';
import { SettingsService } from './app/core/settings.service';
import { DeepLinkService } from './app/core/deeplink.service';

registerIcons();

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: ErrorHandler, useClass: AppErrorHandler },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    provideAppInitializer(() => {
      const settings = inject(SettingsService);
      const s = settings.value();
      initCrashReporting(s.crashReports);
      inject(AnalyticsService).init(s.analytics);
      inject(AnalyticsService).track('app_opened');
      settings.applyTextSize();
      inject(DeepLinkService).init();
    }),
  ],
});
