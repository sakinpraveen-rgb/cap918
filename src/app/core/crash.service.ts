import { ErrorHandler, Injectable } from '@angular/core';
import * as SentryCapacitor from '@sentry/capacitor';
import * as SentryAngular from '@sentry/angular';
import { environment } from '../../environments/environment';

let initialised = false;

/**
 * Crash + error reporting via Sentry. Captures JS errors (Angular) and native crashes (Capacitor SDK).
 * Release health in Sentry gives the crash-free sessions / users rate.
 * No-op when no DSN is configured or the user has turned off diagnostics.
 */
export function initCrashReporting(enabled: boolean): void {
  if (initialised || !environment.sentryDsn || !enabled) return;
  SentryCapacitor.init(
    {
      dsn: environment.sentryDsn,
      release: `pg-manager@${environment.appVersion}`,
      environment: environment.production ? 'production' : 'development',
      tracesSampleRate: 0.2,
      sendDefaultPii: false, // no names, phones or IPs (DPDP Act)
    },
    SentryAngular.init,
  );
  initialised = true;
}

@Injectable({ providedIn: 'root' })
export class CrashService {
  capture(error: unknown, context?: Record<string, string>): void {
    console.error(error, context);
    if (initialised) SentryAngular.captureException(error, { tags: context });
  }
}

/** Angular-wide error handler that forwards uncaught errors. */
@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly sentryHandler = SentryAngular.createErrorHandler({ showDialog: false });
  handleError(error: unknown): void {
    if (initialised) this.sentryHandler.handleError(error);
    else console.error(error);
  }
}
