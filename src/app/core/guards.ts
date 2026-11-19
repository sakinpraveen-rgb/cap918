import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';
import type { Role } from './models';

/** Only lets a logged-in user with the given role in; otherwise redirects to their home or login. */
export function roleGuard(role: Role | 'any'): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.load();
    const r = auth.role();
    if (!r) return router.parseUrl('/login');
    if (role !== 'any' && r !== role) return router.parseUrl(r === 'owner' ? '/owner/dues' : '/renter/home');
    return true;
  };
}

/** Sends already logged-in users from /login to their home. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.load();
  const r = auth.role();
  return r ? router.parseUrl(r === 'owner' ? '/owner/dues' : '/renter/home') : true;
};
