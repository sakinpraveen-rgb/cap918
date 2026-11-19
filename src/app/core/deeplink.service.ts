import { Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { environment } from '../../environments/environment';

/**
 * Deep links handled by the app:
 *   pgmanager://invite/AB12CD                 custom scheme
 *   https://<linkDomain>/invite/AB12CD        Android App Link / iOS Universal Link
 *   https://<linkDomain>/complaints/<id>      open a complaint
 *   https://<linkDomain>/dues                 renter dues (used in WhatsApp reminders)
 * Notification taps are routed the same way via `extra.route`.
 */
@Injectable({ providedIn: 'root' })
export class DeepLinkService {
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  init(): void {
    void App.addListener('appUrlOpen', (e: URLOpenListenerEvent) => {
      const path = DeepLinkService.toAppPath(e.url);
      if (path) this.zone.run(() => void this.router.navigateByUrl(path));
    });
    void LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
      const route = a.notification.extra?.route as string | undefined;
      if (route) this.zone.run(() => void this.router.navigateByUrl(route));
    }).catch(() => undefined);
  }

  static inviteUrl(code: string): string {
    return `https://${environment.linkDomain}/invite/${code}`;
  }

  /** Map an external URL to an in-app route, or null if unknown. */
  static toAppPath(url: string): string | null {
    let path: string;
    try {
      const u = new URL(url);
      // custom scheme: pgmanager://invite/AB12 -> host "invite", pathname "/AB12"
      path = u.protocol === 'pgmanager:' ? `/${u.host}${u.pathname}` : u.pathname;
    } catch {
      return null;
    }
    const invite = path.match(/^\/invite\/([A-Za-z0-9]{4,12})\/?$/);
    if (invite) return `/invite/${invite[1].toUpperCase()}`;
    const complaint = path.match(/^\/complaints\/([\w-]+)\/?$/);
    if (complaint) return `/complaint/${complaint[1]}`;
    if (/^\/dues\/?$/.test(path)) return '/renter/home';
    return null;
  }
}
